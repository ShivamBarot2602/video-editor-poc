// SmartCrop API client (spec .claude/spec/01–04). One function per endpoint;
// each resolves with the response data or throws a SmartcropApiError carrying
// the server's envelope `{ status, code, message, details }`.
//
// Unlike ./http.js this keeps the error code/details — the editor branches on
// them (PREVIEW_BUSY retry, RENDER_IN_PROGRESS attach, S3 403 part refresh …).

const BASE = '/api/smartcrop'

export class SmartcropApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message)
    this.name = 'SmartcropApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const isAbort = (err) => err?.name === 'AbortError'

// Aborts are re-thrown untouched so callers can ignore them. Everything else
// becomes a SmartcropApiError; `status: 0` means the server was never reached.
async function request(method, path, { body, signal } = {}) {
  const init = { method, signal }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, init)
  } catch (err) {
    if (isAbort(err)) throw err
    throw new SmartcropApiError(0, 'NETWORK_ERROR', "Can't reach the server. Check your connection.")
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (res.ok) return data

  const error = data?.error
  throw new SmartcropApiError(
    res.status,
    error?.code || 'HTTP_ERROR',
    error?.message || `Request failed (${res.status}).`,
    error?.details ?? null,
  )
}

const projectPath = (projectId) => `/projects/${encodeURIComponent(projectId)}`
const renderPath = (projectId, renderId) =>
  `${projectPath(projectId)}/renders/${encodeURIComponent(renderId)}`
const uploadPath = (projectId) => `/uploads/${encodeURIComponent(projectId)}`

// List query (?limit&cursor&status) shared by GET /projects and GET …/renders.
function withQuery(path, { limit, cursor, status } = {}) {
  const q = new URLSearchParams()
  if (limit != null) q.set('limit', String(limit))
  if (cursor) q.set('cursor', cursor)
  if (status) q.set('status', Array.isArray(status) ? status.join(',') : status)
  const qs = q.toString()
  return qs ? `${path}?${qs}` : path
}

// ── 01 Upload ────────────────────────────────────────────────────────────────

// POST /uploads → { project, upload: { partSizeBytes, partCount, parts, urlsExpireAt, expiresAt } }
export const createUpload = ({ fileName, contentType, sizeBytes, title, initialAspect, initialLayout }) =>
  request('POST', '/uploads', {
    body: { fileName, contentType, sizeBytes, title, initialAspect, initialLayout },
  })

// POST /uploads/:id/parts → fresh part URLs. No `partNumbers` = every part S3 doesn't have yet.
export const refreshUploadParts = (projectId, partNumbers) =>
  request('POST', `${uploadPath(projectId)}/parts`, { body: partNumbers ? { partNumbers } : {} })

// POST /uploads/:id/complete → { project }. Validation failures throw 422 VIDEO_*.
export const completeUpload = (projectId, parts) =>
  request('POST', `${uploadPath(projectId)}/complete`, { body: { parts } })

// DELETE /uploads/:id → null (204)
export const abortUpload = (projectId) => request('DELETE', uploadPath(projectId))

// PUT one part's bytes straight to S3. XHR (not fetch) for byte progress; no
// cookies cross-origin and no Content-Type (01 §1). Resolves with the quoted
// ETag. Rejects with S3's HTTP status — 403 means the URL expired, so the
// caller refreshes it via refreshUploadParts and retries that part.
export function putUploadPart(url, blob, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new DOMException('Upload aborted', 'AbortError'))
    if (signal?.aborted) return aborted()

    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded) }
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new SmartcropApiError(xhr.status, 'PART_UPLOAD_FAILED', `Upload to storage failed (${xhr.status}).`))
        return
      }
      // Null when the bucket's CORS config doesn't expose ETag (00 §4).
      const etag = xhr.getResponseHeader('ETag')
      if (etag) resolve(etag)
      else reject(new SmartcropApiError(xhr.status, 'ETAG_MISSING', 'Storage did not return an ETag.'))
    }
    xhr.onerror = () => reject(new SmartcropApiError(0, 'NETWORK_ERROR', 'Network error during upload.'))
    xhr.onabort = aborted
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(blob)
  })
}

// ── 02 Projects ──────────────────────────────────────────────────────────────

// GET /projects → { items, nextCursor }
export const listProjects = (query) => request('GET', withQuery('/projects', query))

// GET /projects/:id → { project }
export const getProject = (projectId, { signal } = {}) =>
  request('GET', projectPath(projectId), { signal })

// GET /projects/:id/editor → { project, media, timing, analysis, capabilities, edit, preview }
export const getEditor = (projectId, { signal } = {}) =>
  request('GET', `${projectPath(projectId)}/editor`, { signal })

// POST /projects/:id/retry → { project } (202)
export const retryProject = (projectId) =>
  request('POST', `${projectPath(projectId)}/retry`, { body: {} })

// DELETE /projects/:id → null (204) or { status: 'DELETING' } (202)
export const deleteProject = (projectId) => request('DELETE', projectPath(projectId))

// ── 03 Editing ───────────────────────────────────────────────────────────────

// GET /projects/:id/edit → { version, updatedAt, outputDurationMs, document }
export const getEdit = (projectId) => request('GET', `${projectPath(projectId)}/edit`)

// PUT /projects/:id/edit → { version, updatedAt, changed, outputDurationMs, document }
export const putEdit = (projectId, document, { signal } = {}) =>
  request('PUT', `${projectPath(projectId)}/edit`, { body: { document }, signal })

// POST /projects/:id/preview-plan with exactly one of { document } / { editVersion }
// → { previewId, cached, canvas, frames, plan: { url, sizeBytes }, warnings, … } (03 §4)
export const previewPlan = (projectId, { document, editVersion }, { signal } = {}) =>
  request('POST', `${projectPath(projectId)}/preview-plan`, {
    body: document !== undefined ? { document } : { editVersion },
    signal,
  })

// GET the plan JSON from its presigned S3 URL. Not under /api, so the global
// fetch interceptor leaves credentials off.
export async function fetchPlan(url, { signal } = {}) {
  let res
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    if (isAbort(err)) throw err
    throw new SmartcropApiError(0, 'NETWORK_ERROR', "Couldn't download the preview plan.")
  }
  if (!res.ok) {
    throw new SmartcropApiError(res.status, 'PLAN_FETCH_FAILED', `Couldn't download the preview plan (${res.status}).`)
  }
  return res.json()
}

// ── 04 Rendering ─────────────────────────────────────────────────────────────

// POST /projects/:id/renders → { render } (202). 409 RENDER_IN_PROGRESS carries details.renderId.
export const createRender = (projectId, editVersion) =>
  request('POST', `${projectPath(projectId)}/renders`, {
    body: editVersion != null ? { editVersion } : {},
  })

// GET /projects/:id/renders → { items, nextCursor }
export const listRenders = (projectId, query) =>
  request('GET', withQuery(`${projectPath(projectId)}/renders`, query))

// GET /projects/:id/renders/:rid → { render }
export const getRender = (projectId, renderId, { signal } = {}) =>
  request('GET', renderPath(projectId, renderId), { signal })

// POST /projects/:id/renders/:rid/cancel → { render }
export const cancelRender = (projectId, renderId) =>
  request('POST', `${renderPath(projectId, renderId)}/cancel`)

// GET …/download answers with a 302 to a freshly signed URL — usable as an
// <a href> when render.output.downloadUrl may have expired.
export const renderDownloadUrl = (projectId, renderId) =>
  `${BASE}${renderPath(projectId, renderId)}/download`
