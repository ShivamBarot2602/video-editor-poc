import { getJson, getJsonOrNull, postJson } from './http'

// GET /api/videos — list all video sessions.
export const listVideos = () => getJson('/api/videos')

// GET /api/videos/:id — a single video's metadata, or null if not found.
export const getVideoOrNull = (videoId) => getJsonOrNull(`/api/videos/${videoId}`, null)

const RETRY_DELAYS_MS = [500, 1500, 4000] // 1 initial attempt + 3 retries per part
const PART_CONCURRENCY = 4 // matches @aws-sdk/lib-storage's own default queueSize

async function withRetry(fn) {
  let lastErr
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === RETRY_DELAYS_MS.length) break
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
    }
  }
  throw lastErr
}

// PUT `body` to a presigned S3 URL. Plain XHR (not the credentialed fetch
// wrapper) — no session cookie crosses origin to S3. Resolves with the
// response's ETag header (needed to complete a multipart upload); reports
// byte-level progress via `onProgress(loadedBytes)`.
function putWithProgress(url, body, { headers, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [k, v] of Object.entries(headers || {})) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader('ETag'))
      else reject(new Error(`Upload to storage failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(body)
  })
}

// Run `worker` over `items` with at most `limit` in flight at once.
async function runWithConcurrency(items, limit, worker) {
  let next = 0
  async function lane() {
    while (next < items.length) {
      const i = next++
      await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
}

/**
 * Upload a video. Resolves with { videoId, ... } and reports 0–100 progress.
 * Bytes go BROWSER → S3 directly, never through our server:
 *   1. POST /api/upload/presign  → a single presigned PUT url (small files),
 *      or a multipart uploadId + one presigned URL per part (server decides
 *      by file size)
 *   2. PUT the file — or every part, in parallel, with per-part retry —
 *      straight to S3
 *   3. POST /api/upload/complete → server assembles the parts (multipart
 *      only), confirms the object, writes meta.json
 * A part that exhausts its retries aborts the whole multipart upload
 * server-side (POST /api/upload/abort) before rejecting.
 */
export async function uploadVideo(file, { onProgress } = {}) {
  const presign = await postJson(
    '/api/upload/presign',
    { filename: file.name, contentType: file.type, size: file.size },
    'Failed to start upload',
  )

  let parts
  if (presign.mode === 'single') {
    await withRetry(() => putWithProgress(presign.url, file, {
      headers: { 'Content-Type': file.type },
      onProgress: (loaded) => onProgress?.(Math.round((loaded / file.size) * 100)),
    }))
  } else {
    const { uploadId, key, partSize } = presign
    const loadedByPart = new Array(presign.parts.length).fill(0)
    const report = () => {
      const loaded = loadedByPart.reduce((a, b) => a + b, 0)
      onProgress?.(Math.round((loaded / file.size) * 100))
    }

    const etagByPartNumber = new Map()
    try {
      await runWithConcurrency(presign.parts, PART_CONCURRENCY, async ({ partNumber, url }, i) => {
        const start = (partNumber - 1) * partSize
        const end = Math.min(start + partSize, file.size)
        const blob = file.slice(start, end)
        const eTag = await withRetry(() => putWithProgress(url, blob, {
          onProgress: (loaded) => { loadedByPart[i] = loaded; report() },
        }))
        loadedByPart[i] = end - start
        report()
        etagByPartNumber.set(partNumber, eTag)
      })
    } catch (err) {
      try { await postJson('/api/upload/abort', { key, uploadId }, 'Failed to abort upload') } catch (_) {}
      throw err
    }

    parts = presign.parts.map((p) => ({ partNumber: p.partNumber, eTag: etagByPartNumber.get(p.partNumber) }))
  }

  return postJson(
    '/api/upload/complete',
    {
      videoId: presign.videoId,
      filename: file.name,
      size: file.size,
      key: presign.key,
      ...(presign.mode === 'multipart' ? { uploadId: presign.uploadId, parts } : {}),
    },
    'Failed to finalize upload',
  )
}
