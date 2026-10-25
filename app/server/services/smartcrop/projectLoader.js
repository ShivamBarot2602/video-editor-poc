/**
 * Shared "load a project for an endpoint" step: 404 → expire a stale upload →
 * sync processing → sync the active render (spec 02 §3). Separate module so
 * project / edit / preview / render services can all use it without cycles.
 */

const repo = require('./projectRepo')
const statusSync = require('./statusSync')
const { toProject } = require('./serializers')
const { loadProject, expireIfNeeded } = require('./uploadService')
const { RENDER_ACTIVE } = require('../../config/smartcropConstants')

async function lastRenderFor(item) {
  if (!item.lastRenderId) return null
  return repo.getRender(item.projectId, item.lastRenderId)
}

/**
 * Load → expire stale upload → sync processing → sync the active render.
 * Returns the fresh project item. Used by every project-scoped endpoint.
 */
async function loadAndSync(projectId, { force = false } = {}) {
  let item = await loadProject(projectId)
  item = await expireIfNeeded(item)
  item = await statusSync.syncProject(item, { force })
  if (item.activeRenderId) {
    const render = await repo.getRender(projectId, item.activeRenderId)
    if (render) {
      const synced = await statusSync.syncRender(render, { force })
      if (synced && !RENDER_ACTIVE.includes(synced.status)) item = (await repo.getProject(projectId)) || item
    }
  }
  return item
}

async function serialize(item) {
  return toProject(item, { lastRender: await lastRenderFor(item) })
}

module.exports = { loadAndSync, serialize, lastRenderFor }
