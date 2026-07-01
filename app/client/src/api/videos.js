import { getJson, getJsonOrNull, postJson } from './http'

// GET /api/videos — list all video sessions.
export const listVideos = () => getJson('/api/videos')

// GET /api/videos/:id — a single video's metadata, or null if not found.
export const getVideoOrNull = (videoId) => getJsonOrNull(`/api/videos/${videoId}`, null)

// Upload a video. Same contract as before — resolves with { videoId, ... } and
// reports 0–100 progress — but the bytes now go BROWSER → S3 directly via a
// presigned POST. The server only mints the URL and records metadata, never
// proxies the file. Three steps:
//   1. POST /api/upload/presign  → { videoId, url, fields }
//   2. XHR POST FormData(fields + file) → S3 (progress here; no cookies sent)
//   3. POST /api/upload/complete → server confirms + writes meta
export async function uploadVideo(file, { onProgress } = {}) {
  // 1. Ask our API for a presigned POST (same-origin fetch carries the cookie).
  const { videoId, url, fields } = await postJson(
    '/api/upload/presign',
    { filename: file.name, contentType: file.type, size: file.size },
    'Failed to start upload',
  )

  // 2. Upload straight to S3. Plain XHR (not the credentialed fetch wrapper) so
  // no session cookie is sent cross-origin. The `file` field MUST be appended
  // last — S3 ignores any form fields that follow it.
  await new Promise((resolve, reject) => {
    const form = new FormData()
    Object.entries(fields).forEach(([k, v]) => form.append(k, v))
    form.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload to storage failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(form)
  })

  // 3. Finalize — server HEADs the object and writes meta.json.
  return postJson(
    '/api/upload/complete',
    { videoId, filename: file.name, size: file.size },
    'Failed to finalize upload',
  )
}
