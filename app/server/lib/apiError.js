/**
 * SmartCrop error envelope (spec 00 §2):
 *   { "error": { "code", "message", "details" } }   — details is an object or null.
 *
 * Services throw ApiError; the router-level middleware below turns it (and
 * body-parser / AWS SDK / unexpected errors) into the envelope. Messages never
 * carry S3 keys, ARNs or stack traces — those only go to the server log.
 */

class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const E = {
  validation: (issues) =>
    new ApiError(400, 'VALIDATION_ERROR', 'The request is not valid.', { issues }),
  projectNotFound: () => new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.'),
  renderNotFound: () => new ApiError(404, 'RENDER_NOT_FOUND', 'Render not found.'),
  routeNotFound: () => new ApiError(404, 'ROUTE_NOT_FOUND', 'No such endpoint.'),
  invalidState: (status, allowed, message) =>
    new ApiError(409, 'INVALID_STATE', message || `This can't be done while the item is ${status}.`, { status, allowed }),
  uploadNotActive: (status) =>
    new ApiError(409, 'UPLOAD_NOT_ACTIVE', 'This upload is no longer active.', { status }),
  requestInProgress: () =>
    new ApiError(409, 'REQUEST_IN_PROGRESS', 'Another request for this item is in progress. Try again shortly.'),
  renderInProgress: (renderId) =>
    new ApiError(409, 'RENDER_IN_PROGRESS', 'A render is already running for this project.', { renderId }),
  editVersionConflict: (currentVersion) =>
    new ApiError(409, 'EDIT_VERSION_CONFLICT', 'The edit has changed since this version.', { currentVersion }),
  outputNotReady: (status) =>
    new ApiError(409, 'OUTPUT_NOT_READY', 'The video is not ready yet.', { status }),
  uploadExpired: () => new ApiError(410, 'UPLOAD_EXPIRED', 'This upload has expired. Please upload the file again.'),
  fileTooLarge: (maxBytes) =>
    new ApiError(413, 'FILE_TOO_LARGE', 'This file is too large.', { maxBytes }),
  payloadTooLarge: () => new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.'),
  unsupportedVideoType: (allowed) =>
    new ApiError(415, 'UNSUPPORTED_VIDEO_TYPE', 'This file type is not supported.', { allowed }),
  uploadIncomplete: (missingParts) =>
    new ApiError(422, 'UPLOAD_INCOMPLETE', 'Some parts of the file did not upload. Please upload them again.', { missingParts }),
  layoutNotSupported: (aspect, layout, supported) =>
    new ApiError(422, 'LAYOUT_NOT_SUPPORTED', `The ${layout} layout is not available for ${aspect}.`, { aspect, layout, supported }),
  editInvalid: (issues) =>
    new ApiError(422, 'EDIT_INVALID', 'The edit breaks one or more rules.', { issues }),
  featureNotAvailable: (feature) =>
    new ApiError(422, 'FEATURE_NOT_AVAILABLE', 'This kind of edit is not available yet.', { feature }),
  previewFailed: () => new ApiError(422, 'PREVIEW_FAILED', "We couldn't build a preview for this edit."),
  previewBusy: (retryAfterMs = 1000) =>
    new ApiError(429, 'PREVIEW_BUSY', 'Too many previews are being built. Try again in a moment.', { retryAfterMs }),
  internal: () => new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong.'),
  upstream: (service) =>
    new ApiError(502, 'UPSTREAM_ERROR', 'A storage or processing service failed. Please try again.', { service }),
  previewTimeout: () => new ApiError(504, 'PREVIEW_TIMEOUT', 'Building the preview took too long. Try again.'),
}

// Express 4 does not forward rejected promises to error middleware.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

function send(res, apiError) {
  res.status(apiError.status).json({
    error: { code: apiError.code, message: apiError.message, details: apiError.details ?? null },
  })
}

// Router-level error middleware → envelope for everything.
function errorMiddleware(err, req, res, _next) {
  if (res.headersSent) return
  if (err instanceof ApiError) return send(res, err)

  // body-parser errors
  if (err.type === 'entity.too.large') return send(res, E.payloadTooLarge())
  if (err.type === 'entity.parse.failed') {
    return send(res, E.validation([{ path: '', message: 'Body is not valid JSON.' }]))
  }
  if (err.type && err.status >= 400 && err.status < 500) {
    return send(res, E.validation([{ path: '', message: 'Body could not be read.' }]))
  }

  // AWS SDK failures are tagged with their service by the thin clients.
  if (err.awsService) {
    console.error(`[smartcrop] ${req.method} ${req.originalUrl} → ${err.awsService} error:`, err.name, err.message)
    return send(res, E.upstream(err.awsService))
  }

  console.error(`[smartcrop] ${req.method} ${req.originalUrl} → unexpected error:`, err)
  return send(res, E.internal())
}

module.exports = { ApiError, E, asyncHandler, errorMiddleware }
