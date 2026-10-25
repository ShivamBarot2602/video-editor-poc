/**
 * DynamoDB access for the smartcrop tables (spec 00 §4). Status changes are
 * always conditional on the expected current status (spec 00 §2); callers
 * catch dynamo.isConditionalFail(err) and re-read.
 *
 * Attributes that start "absent" and are later tested with attribute_not_exists
 * (upload.completingAt, activeRenderId, deletedAt, cancelRequestedAt) are
 * omitted instead of stored as null, and cleared with REMOVE.
 */

const dynamo = require('../../lib/dynamo')
const sc = require('../../config/smartcrop')
const { LIST_PK } = require('../../config/smartcropConstants')

const T = () => sc.tables

// ─── projects ───────────────────────────────────────────────────────────────

async function createProject(item) {
  await dynamo.put(T().projects, item, { condition: 'attribute_not_exists(#n_projectId)' })
}

async function getProject(projectId) {
  return dynamo.get(T().projects, { projectId })
}

/**
 * Conditional project update. `expect` is { status } or { status: [..] } plus
 * any extra raw condition (`and`) with its `values`.
 */
async function updateProject(projectId, { set, remove, expect = {}, and, values = {} } = {}) {
  const { condition, values: condValues } = buildCondition(expect, and, values)
  return dynamo.update(T().projects, { projectId }, {
    set: { ...set, updatedAt: set?.updatedAt || new Date().toISOString() },
    remove,
    condition,
    values: condValues,
  })
}

function buildCondition(expect, and, values) {
  const clauses = ['attribute_exists(#n_projectId)']
  const v = { ...values }
  if (expect.status) {
    const list = Array.isArray(expect.status) ? expect.status : [expect.status]
    clauses.push(`#n_status IN (${list.map((s, i) => { v[`:x_st${i}`] = s; return `:x_st${i}` }).join(', ')})`)
  }
  if (and) clauses.push(`(${and})`)
  return { condition: clauses.join(' AND '), values: v }
}

async function deleteProjectItem(projectId) {
  await dynamo.del(T().projects, { projectId })
}

/**
 * List projects newest first via GSI byCreated, `statuses` as a filter, hiding
 * items being deleted. Keeps querying until `limit` items or no more; the
 * cursor is the key of the last RETURNED item (null when nothing follows).
 */
async function listProjects({ limit, startKey, statuses }) {
  const values = { ':pk': LIST_PK }
  const filters = ['attribute_not_exists(#n_deletedAt)']
  if (statuses && statuses.length) {
    filters.push(`#n_status IN (${statuses.map((s, i) => { values[`:f${i}`] = s; return `:f${i}` }).join(', ')})`)
  }
  const items = []
  let lastKey = startKey || null
  let more = true
  while (items.length <= limit && more) {
    const page = await dynamo.query(T().projects, {
      index: 'byCreated',
      keyCondition: '#n_listPk = :pk',
      filter: filters.join(' AND '),
      values,
      limit: limit + 1 - items.length,
      startKey: lastKey,
      forward: false,
    })
    items.push(...page.items)
    lastKey = page.lastKey
    more = !!lastKey
  }
  const page = items.slice(0, limit)
  const hasMore = items.length > limit
  const last = page[page.length - 1]
  const nextKey = hasMore && last ? { projectId: last.projectId, listPk: last.listPk, createdAt: last.createdAt } : null
  return { items: page, nextKey }
}

// ─── renders ────────────────────────────────────────────────────────────────

async function createRender(item) {
  await dynamo.put(T().renders, item, { condition: 'attribute_not_exists(#n_renderId)' })
}

async function getRender(projectId, renderId) {
  return dynamo.get(T().renders, { projectId, renderId })
}

async function updateRender(projectId, renderId, { set, remove, expect = {}, and, values = {} } = {}) {
  const clauses = ['attribute_exists(#n_renderId)']
  const v = { ...values }
  if (expect.status) {
    const list = Array.isArray(expect.status) ? expect.status : [expect.status]
    clauses.push(`#n_status IN (${list.map((s, i) => { v[`:x_st${i}`] = s; return `:x_st${i}` }).join(', ')})`)
  }
  if (and) clauses.push(`(${and})`)
  return dynamo.update(T().renders, { projectId, renderId }, { set, remove, condition: clauses.join(' AND '), values: v })
}

// Newest first (render ids are ULIDs, so the sort key orders by time).
async function listRenders(projectId, { limit, startKey, statuses }) {
  const values = { ':p': projectId }
  let filter
  if (statuses && statuses.length) {
    filter = `#n_status IN (${statuses.map((s, i) => { values[`:f${i}`] = s; return `:f${i}` }).join(', ')})`
  }
  const items = []
  let lastKey = startKey || null
  let more = true
  while (items.length <= limit && more) {
    const page = await dynamo.query(T().renders, {
      keyCondition: '#n_projectId = :p',
      filter,
      values,
      limit: limit + 1 - items.length,
      startKey: lastKey,
      forward: false,
      consistent: true,
    })
    items.push(...page.items)
    lastKey = page.lastKey
    more = !!lastKey
  }
  const page = items.slice(0, limit)
  const last = page[page.length - 1]
  const nextKey = items.length > limit && last ? { projectId: last.projectId, renderId: last.renderId } : null
  return { items: page, nextKey }
}

// Every render of a project (no filter, all pages).
async function allRenders(projectId) {
  const out = []
  let startKey = null
  do {
    const page = await dynamo.query(T().renders, {
      keyCondition: '#n_projectId = :p', values: { ':p': projectId }, startKey, consistent: true,
    })
    out.push(...page.items)
    startKey = page.lastKey
  } while (startKey)
  return out
}

async function getRendersByIds(keys) {
  if (!keys.length) return []
  return dynamo.batchGet(T().renders, keys)
}

async function deleteRenderItem(projectId, renderId) {
  await dynamo.del(T().renders, { projectId, renderId })
}

// ─── pipeline jobs table (read only) ────────────────────────────────────────

async function getPipelineRow(jobId) {
  return dynamo.get(T().pipelineJobs, { job_id: jobId })
}

module.exports = {
  createProject, getProject, updateProject, deleteProjectItem, listProjects,
  createRender, getRender, updateRender, listRenders, allRenders, getRendersByIds, deleteRenderItem,
  getPipelineRow,
}
