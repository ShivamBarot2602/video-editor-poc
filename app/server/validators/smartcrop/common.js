/**
 * Hand-written validation primitives (no schema library — spec 00 §1).
 * Validators are pure: validateX(input, context) → { value, issues, ... }
 * where issues = [{ path, message }] (400 VALIDATION_ERROR when non-empty).
 */

const { PROJECT_ID_RE, RENDER_ID_RE } = require('../../config/smartcropConstants')

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Push an issue for every key of `obj` not in `allowed`.
function checkUnknown(obj, allowed, base, issues) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) issues.push({ path: join(base, k), message: 'Unknown field.' })
  }
}

const join = (base, key) => (base === '' || base == null ? String(key) : `${base}.${key}`)

// Control characters (C0 + DEL + C1).
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/

const isInt = (v) => typeof v === 'number' && Number.isInteger(v)

// Body must be a plain object (an empty / absent JSON body arrives as {}).
function bodyObject(body, issues) {
  if (body === undefined || body === null) return {}
  if (!isPlainObject(body)) {
    issues.push({ path: '', message: 'Body must be a JSON object.' })
    return null
  }
  return body
}

function validateProjectId(projectId) {
  return PROJECT_ID_RE.test(String(projectId || ''))
    ? []
    : [{ path: 'projectId', message: 'Must look like prj_ followed by 26 lowercase letters or digits.' }]
}

function validateRenderId(renderId) {
  return RENDER_ID_RE.test(String(renderId || ''))
    ? []
    : [{ path: 'renderId', message: 'Must look like rnd_ followed by 26 lowercase letters or digits.' }]
}

// Body that must be empty ({} allowed, no fields).
function validateEmptyBody(body) {
  const issues = []
  const obj = bodyObject(body, issues)
  if (obj) checkUnknown(obj, [], '', issues)
  return { value: {}, issues }
}

/**
 * Shared list query: limit (1–100, default 20), cursor (opaque base64url JSON
 * of a DynamoDB key, checked by `checkCursorKey`), status (comma list from
 * `statuses`).
 */
function validateListQuery(query, { statuses, checkCursorKey }) {
  const issues = []
  const q = query || {}
  checkUnknown(q, ['limit', 'cursor', 'status'], '', issues)

  let limit = 20
  if (q.limit !== undefined) {
    const s = String(q.limit)
    const n = Number(s)
    if (!/^\d+$/.test(s) || !Number.isInteger(n) || n < 1 || n > 100) {
      issues.push({ path: 'limit', message: 'Must be an integer from 1 to 100.' })
    } else limit = n
  }

  let startKey = null
  if (q.cursor !== undefined) {
    startKey = decodeCursor(q.cursor)
    if (!startKey || !checkCursorKey(startKey)) {
      startKey = null
      issues.push({ path: 'cursor', message: 'Invalid cursor.' })
    }
  }

  let statusFilter = null
  if (q.status !== undefined) {
    const list = String(q.status).split(',').map(s => s.trim()).filter(Boolean)
    const bad = list.filter(s => !statuses.includes(s))
    if (!list.length || bad.length) {
      issues.push({ path: 'status', message: `Unknown status. Allowed: ${statuses.join(', ')}.` })
    } else statusFilter = [...new Set(list)]
  }

  return { value: { limit, startKey, statuses: statusFilter }, issues }
}

const encodeCursor = (key) => Buffer.from(JSON.stringify(key)).toString('base64url')

function decodeCursor(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw)) return null
  try {
    const obj = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'))
    return isPlainObject(obj) ? obj : null
  } catch {
    return null
  }
}

// Exact key set with string values.
function isKeyShape(obj, keys) {
  const k = Object.keys(obj)
  return k.length === keys.length && keys.every(name => typeof obj[name] === 'string' && obj[name].length > 0)
}

module.exports = {
  isPlainObject,
  checkUnknown,
  join,
  CONTROL_RE,
  isInt,
  bodyObject,
  validateProjectId,
  validateRenderId,
  validateEmptyBody,
  validateListQuery,
  encodeCursor,
  decodeCursor,
  isKeyShape,
}
