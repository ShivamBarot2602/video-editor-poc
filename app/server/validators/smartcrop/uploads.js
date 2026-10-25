/**
 * Upload validators (spec 01).
 *
 * Precedence when a request breaks several rules: 400 shape → 415 type →
 * 413 size → 422 layout. Non-400 outcomes come back as `error`
 * ({ kind, ... }) for the controller to raise; `issues` are the 400s.
 */

const {
  ASPECTS, LAYOUTS, LAYOUT_SUPPORT, VIDEO_TYPES, ALLOWED_EXTENSIONS, ALLOWED_CONTENT_TYPES,
} = require('../../config/smartcropConstants')
const { checkUnknown, CONTROL_RE, isInt, bodyObject } = require('./common')

const CREATE_FIELDS = ['fileName', 'contentType', 'sizeBytes', 'title', 'initialAspect', 'initialLayout']

/**
 * POST /uploads body.
 * context: { maxBytes }
 * → { value: { fileName, ext, contentType, sizeBytes, title, initialAspect, initialLayout }, issues, error }
 *   error: null | { kind: 'UNSUPPORTED_VIDEO_TYPE' } | { kind: 'FILE_TOO_LARGE' }
 *        | { kind: 'LAYOUT_NOT_SUPPORTED', aspect, layout, supported }
 */
function validateCreateUpload(body, { maxBytes }) {
  const issues = []
  const obj = bodyObject(body, issues)
  if (!obj) return { value: null, issues, error: null }
  checkUnknown(obj, CREATE_FIELDS, '', issues)

  // fileName
  let fileName = null
  if (typeof obj.fileName !== 'string') {
    issues.push({ path: 'fileName', message: 'Required string.' })
  } else {
    fileName = obj.fileName.trim()
    if (fileName.length < 1 || fileName.length > 255) issues.push({ path: 'fileName', message: 'Must be 1–255 characters.' })
    else if (/[/\\]/.test(fileName) || CONTROL_RE.test(fileName)) {
      issues.push({ path: 'fileName', message: 'Must not contain / \\ or control characters.' })
      fileName = null
    }
  }

  // contentType (missing / not a string → 400; wrong value → 415 below)
  if (typeof obj.contentType !== 'string' || !obj.contentType.trim()) {
    issues.push({ path: 'contentType', message: 'Required string.' })
  }

  // sizeBytes
  if (!isInt(obj.sizeBytes) || obj.sizeBytes < 1) {
    issues.push({ path: 'sizeBytes', message: 'Required integer ≥ 1.' })
  }

  // title
  let title
  if (obj.title === undefined || obj.title === null) title = null
  else if (typeof obj.title !== 'string' || obj.title.trim().length < 1 || obj.title.trim().length > 200) {
    issues.push({ path: 'title', message: 'Must be null or 1–200 characters.' })
  } else title = obj.title.trim()

  // initialAspect / initialLayout
  let aspect = '9:16'
  if (obj.initialAspect !== undefined && obj.initialAspect !== null) {
    if (!ASPECTS.includes(obj.initialAspect)) issues.push({ path: 'initialAspect', message: `Must be one of ${ASPECTS.join(', ')}.` })
    else aspect = obj.initialAspect
  }
  let layout = 'fill'
  if (obj.initialLayout !== undefined && obj.initialLayout !== null) {
    if (!LAYOUTS.includes(obj.initialLayout)) issues.push({ path: 'initialLayout', message: `Must be one of ${LAYOUTS.join(', ')}.` })
    else layout = obj.initialLayout
  }

  if (issues.length) return { value: null, issues, error: null }

  // 415 — extension, then content type matching it
  const dot = fileName.lastIndexOf('.')
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ''
  const contentType = obj.contentType.trim().toLowerCase()
  if (!VIDEO_TYPES[ext] || !VIDEO_TYPES[ext].includes(contentType)) {
    return { value: null, issues, error: { kind: 'UNSUPPORTED_VIDEO_TYPE', allowed: ALLOWED_EXTENSIONS, contentTypes: ALLOWED_CONTENT_TYPES } }
  }

  // 413
  if (obj.sizeBytes > maxBytes) return { value: null, issues, error: { kind: 'FILE_TOO_LARGE', maxBytes } }

  // 422
  if (!LAYOUT_SUPPORT[aspect].includes(layout)) {
    return { value: null, issues, error: { kind: 'LAYOUT_NOT_SUPPORTED', aspect, layout, supported: LAYOUT_SUPPORT[aspect] } }
  }

  if (title === null) title = (dot > 0 ? fileName.slice(0, dot) : fileName).trim() || fileName

  return {
    value: { fileName, ext, contentType, sizeBytes: obj.sizeBytes, title, initialAspect: aspect, initialLayout: layout },
    issues,
    error: null,
  }
}

/**
 * POST /uploads/{id}/parts body shape: { partNumbers?: int[1..1000] | null }.
 * The 1…partCount range needs the project → checkPartNumbersRange.
 */
function validatePartsBody(body) {
  const issues = []
  const obj = bodyObject(body, issues)
  if (!obj) return { value: null, issues }
  checkUnknown(obj, ['partNumbers'], '', issues)
  let partNumbers = null
  if (obj.partNumbers !== undefined && obj.partNumbers !== null) {
    if (!Array.isArray(obj.partNumbers) || obj.partNumbers.length < 1 || obj.partNumbers.length > 1000) {
      issues.push({ path: 'partNumbers', message: 'Must be an array of 1–1000 part numbers.' })
    } else {
      obj.partNumbers.forEach((n, i) => {
        if (!isInt(n) || n < 1) issues.push({ path: `partNumbers.${i}`, message: 'Must be an integer ≥ 1.' })
      })
      if (!issues.length) partNumbers = [...new Set(obj.partNumbers)].sort((a, b) => a - b)
    }
  }
  return { value: { partNumbers }, issues }
}

function checkPartNumbersRange(partNumbers, partCount) {
  const issues = []
  if (!partNumbers) return issues
  partNumbers.forEach((n) => {
    if (n > partCount) issues.push({ path: 'partNumbers', message: `Part ${n} is out of range (1–${partCount}).` })
  })
  return issues
}

/**
 * POST /uploads/{id}/complete body: { parts: [{ partNumber, etag }] }.
 * Shape here; count / range / uniqueness need partCount → checkCompleteParts.
 * ETags are normalised to quoted form.
 */
function validateCompleteBody(body) {
  const issues = []
  const obj = bodyObject(body, issues)
  if (!obj) return { value: null, issues }
  checkUnknown(obj, ['parts'], '', issues)
  if (!Array.isArray(obj.parts) || obj.parts.length < 1) {
    issues.push({ path: 'parts', message: 'Required non-empty array.' })
    return { value: null, issues }
  }
  const parts = []
  obj.parts.forEach((p, i) => {
    if (p === null || typeof p !== 'object' || Array.isArray(p)) {
      issues.push({ path: `parts.${i}`, message: 'Must be an object.' })
      return
    }
    checkUnknown(p, ['partNumber', 'etag'], `parts.${i}`, issues)
    if (!isInt(p.partNumber) || p.partNumber < 1) issues.push({ path: `parts.${i}.partNumber`, message: 'Must be an integer ≥ 1.' })
    if (typeof p.etag !== 'string' || p.etag.length < 1 || p.etag.length > 128) {
      issues.push({ path: `parts.${i}.etag`, message: 'Must be a string of 1–128 characters.' })
    }
    parts.push({ partNumber: p.partNumber, etag: normaliseEtag(p.etag) })
  })
  if (issues.length) return { value: null, issues }
  return { value: { parts: parts.sort((a, b) => a.partNumber - b.partNumber) }, issues }
}

function normaliseEtag(etag) {
  if (typeof etag !== 'string') return etag
  const bare = etag.replace(/^"+|"+$/g, '')
  return `"${bare}"`
}

function checkCompleteParts(parts, partCount) {
  const issues = []
  if (parts.length !== partCount) {
    issues.push({ path: 'parts', message: `Expected exactly ${partCount} parts, got ${parts.length}.` })
  }
  const seen = new Set()
  for (const p of parts) {
    if (p.partNumber > partCount) issues.push({ path: 'parts', message: `Part ${p.partNumber} is out of range (1–${partCount}).` })
    if (seen.has(p.partNumber)) issues.push({ path: 'parts', message: `Part ${p.partNumber} is listed more than once.` })
    seen.add(p.partNumber)
  }
  return issues
}

module.exports = {
  validateCreateUpload,
  validatePartsBody,
  checkPartNumbersRange,
  validateCompleteBody,
  checkCompleteParts,
  normaliseEtag,
}
