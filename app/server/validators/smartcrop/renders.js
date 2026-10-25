// Render endpoint validators (spec 04).

const { RENDER_STATUSES, PROJECT_ID_RE, RENDER_ID_RE } = require('../../config/smartcropConstants')
const { checkUnknown, isInt, bodyObject, validateListQuery, isKeyShape } = require('./common')

// POST /renders  { editVersion? }
function validateCreateRenderBody(body) {
  const issues = []
  const obj = bodyObject(body, issues)
  if (!obj) return { value: null, issues }
  checkUnknown(obj, ['editVersion'], '', issues)
  let editVersion = null
  if (obj.editVersion !== undefined && obj.editVersion !== null) {
    if (!isInt(obj.editVersion) || obj.editVersion < 1) issues.push({ path: 'editVersion', message: 'Must be an integer ≥ 1.' })
    else editVersion = obj.editVersion
  }
  return { value: issues.length ? null : { editVersion }, issues }
}

const isRenderCursorKey = (k) =>
  isKeyShape(k, ['projectId', 'renderId']) && PROJECT_ID_RE.test(k.projectId) && RENDER_ID_RE.test(k.renderId)

function validateRenderListQuery(query) {
  return validateListQuery(query, { statuses: RENDER_STATUSES, checkCursorKey: isRenderCursorKey })
}

module.exports = { validateCreateRenderBody, validateRenderListQuery, isRenderCursorKey }
