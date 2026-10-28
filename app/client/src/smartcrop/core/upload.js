// Multipart upload to S3 (spec 01, 05 §3 "Upload"). Pure orchestration: the
// network calls are injected, so this runs (and is tested) without a browser.

export const PART_CONCURRENCY = 4
export const MAX_PART_RETRIES = 3
export const RETRY_DELAYS_MS = [500, 1500, 4000]

// Allowed types per extension (00 §3); the first is sent when the browser
// reports none (common for .m4v / .mov on some systems).
const CONTENT_TYPES = {
  mp4: ['video/mp4'],
  m4v: ['video/x-m4v', 'video/mp4'],
  mov: ['video/quicktime'],
  webm: ['video/webm'],
}

export const ACCEPT = '.mp4,.m4v,.mov,.webm,video/mp4,video/x-m4v,video/quicktime,video/webm'

export const fileExtension = (name) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export const isSupportedFile = (file) => fileExtension(file.name) in CONTENT_TYPES

// The browser's type when the server would accept it for this extension,
// otherwise the canonical type. Unknown extensions pass `file.type` through
// so the server answers with its own 415 message.
export function contentTypeFor(file) {
  const allowed = CONTENT_TYPES[fileExtension(file.name)]
  if (!allowed) return file.type || 'application/octet-stream'
  return allowed.includes(file.type) ? file.type : allowed[0]
}

// Part n = bytes [(n−1)·partSize, min(n·partSize, size)) (01 §1).
export function partRange(partNumber, partSizeBytes, sizeBytes) {
  const start = (partNumber - 1) * partSizeBytes
  return [start, Math.min(start + partSizeBytes, sizeBytes)]
}

const isAbort = (err) => err?.name === 'AbortError'

// 403 = presigned URL expired; 0 = network; 408/429/5xx = S3 hiccup.
const isRetryable = (err) =>
  err?.status === 0 || err?.status === 403 || err?.status === 408 || err?.status === 429 || err?.status >= 500

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

// Sums bytes sent across parts; a retried part starts again from 0.
export function createByteProgress(totalBytes, onBytes) {
  const loadedByPart = new Map()
  return {
    set(partNumber, loaded) {
      loadedByPart.set(partNumber, loaded)
      let sent = 0
      for (const bytes of loadedByPart.values()) sent += bytes
      onBytes?.(Math.min(sent, totalBytes))
    },
  }
}

// Run `worker` over `items` with at most `limit` in flight. The first failure
// stops new work from starting and is rethrown once in-flight work settles.
async function runPool(items, limit, worker) {
  let next = 0
  let failure = null
  async function lane() {
    while (next < items.length && !failure) {
      const item = items[next++]
      try {
        await worker(item)
      } catch (err) {
        failure ??= err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  if (failure) throw failure
}

/**
 * PUT `parts` ([{ partNumber, url }]) of `file` to S3, 4 at a time.
 * A failed part is retried up to 3 times; on 403 its URL is refreshed first
 * via `api.refreshParts(projectId, [n])`. Resolves with [{ partNumber, etag }].
 *
 * api = { putPart(url, blob, { onProgress, signal }) → etag,
 *         refreshParts(projectId, partNumbers) → { parts: [{ partNumber, url }] } }
 */
export async function uploadParts({ file, projectId, parts, partSizeBytes, api, progress, signal }) {
  const etags = []

  async function freshUrl(partNumber) {
    const { parts: refreshed } = await api.refreshParts(projectId, [partNumber])
    const match = refreshed.find((p) => p.partNumber === partNumber)
    if (!match) throw new Error(`No upload URL returned for part ${partNumber}.`)
    return match.url
  }

  async function uploadPart({ partNumber, url }) {
    const [start, end] = partRange(partNumber, partSizeBytes, file.size)
    const blob = file.slice(start, end)
    const onProgress = (loaded) => progress?.set(partNumber, loaded)

    for (let retry = 0; ; retry++) {
      try {
        const etag = await api.putPart(url, blob, { onProgress, signal })
        progress?.set(partNumber, end - start)
        etags.push({ partNumber, etag })
        return
      } catch (err) {
        if (isAbort(err) || retry >= MAX_PART_RETRIES || !isRetryable(err)) throw err
        progress?.set(partNumber, 0)
        if (err.status === 403) url = await freshUrl(partNumber)
        else await sleep(RETRY_DELAYS_MS[retry], signal)
      }
    }
  }

  await runPool(parts, PART_CONCURRENCY, uploadPart)
  return etags.sort((a, b) => a.partNumber - b.partNumber)
}

/**
 * POST /complete. If S3 reports parts missing (422 UPLOAD_INCOMPLETE), get
 * fresh URLs for just those, upload them again and complete once more.
 * Takes the same arguments as uploadParts, plus `etags` from it and
 * `api.complete(projectId, etags)`.
 */
export async function completeParts({ etags, ...upload }) {
  const { api, projectId } = upload
  try {
    return await api.complete(projectId, etags)
  } catch (err) {
    const missing = err?.code === 'UPLOAD_INCOMPLETE' ? err.details?.missingParts : null
    if (!missing?.length) throw err

    const { parts } = await api.refreshParts(projectId, missing)
    const redone = await uploadParts({ ...upload, parts })
    const kept = etags.filter((p) => !missing.includes(p.partNumber))
    return api.complete(projectId, [...kept, ...redone].sort((a, b) => a.partNumber - b.partNumber))
  }
}
