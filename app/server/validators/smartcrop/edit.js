/**
 * Edit endpoint body validators (spec 03 §3–4). Document rules run in the
 * service once the project's durationMs is known; these check body shape and
 * the document shape (400).
 */

const { checkUnknown, isInt, bodyObject } = require('./common')
const { validateEditDocument } = require('./editDocument')

// PUT /edit  { document }
function validatePutEditBody(body) {
  const issues = []
  const obj = bodyObject(body, issues)
  if (!obj) return { value: null, issues }
  checkUnknown(obj, ['document'], '', issues)
  if (obj.document === undefined) {
    issues.push({ path: 'document', message: 'Required.' })
    return { value: null, issues }
  }
  const shape = validateEditDocument(obj.document, { durationMs: null, base: 'document' })
  issues.push(...shape.issues)
  return { value: issues.length ? null : { document: obj.document }, issues }
}

// POST /preview-plan  exactly one of { document } | { editVersion }
function validatePreviewBody(body) {
  const issues = []
  const obj = bodyObject(body, issues)
  if (!obj) return { value: null, issues }
  checkUnknown(obj, ['document', 'editVersion'], '', issues)
  const hasDoc = obj.document !== undefined && obj.document !== null
  const hasVer = obj.editVersion !== undefined && obj.editVersion !== null
  if (hasDoc === hasVer) {
    issues.push({ path: '', message: 'Send exactly one of "document" or "editVersion".' })
    return { value: null, issues }
  }
  if (hasVer) {
    if (!isInt(obj.editVersion) || obj.editVersion < 1) issues.push({ path: 'editVersion', message: 'Must be an integer ≥ 1.' })
    return { value: issues.length ? null : { editVersion: obj.editVersion }, issues }
  }
  const shape = validateEditDocument(obj.document, { durationMs: null, base: 'document' })
  issues.push(...shape.issues)
  return { value: issues.length ? null : { document: obj.document }, issues }
}

module.exports = { validatePutEditBody, validatePreviewBody }
