/**
 * Renders (spec 04): Save → frozen edit + Step Functions from stage 4, status /
 * history / download / cancel. One active render per project (activeRenderId).
 */

const sc = require('../../config/smartcrop')
const sfn = require('../../lib/sfn')
const dynamo = require('../../lib/dynamo')
const { newRenderId } = require('../../lib/ids')
const { E } = require('../../lib/apiError')
const repo = require('./projectRepo')
const pipeline = require('./pipeline')
const statusSync = require('./statusSync')
const { toRender } = require('./serializers')
const { loadProject } = require('./uploadService')
const { loadAndSync } = require('./projectLoader')
const { ensureFeature } = require('./previewService')
const { smartcrop: store } = require('../../storage/videoStore')
const { encodeCursor } = require('../../validators/smartcrop/common')
const {
  validateEditDocument, effectiveLayouts, outputDurationMs,
} = require('../../validators/smartcrop/editDocument')
const { PROJECT_STATUS, RENDER_STATUS, RENDER_ACTIVE } = require('../../config/smartcropConstants')

const location = (p, r) => `/api/smartcrop/projects/${p}/renders/${r}`

async function loadRender(projectId, renderId) {
  const render = await repo.getRender(projectId, renderId)
  if (!render) throw E.renderNotFound()
  return render
}

// ─── create (Save) ──────────────────────────────────────────────────────────

async function createRender(projectId, { editVersion }) {
  let project = await loadAndSync(projectId, { force: true })
  if (project.status !== PROJECT_STATUS.READY) throw E.invalidState(project.status, [PROJECT_STATUS.READY])

  // Step 2 — loadAndSync already force-synced the active render; still active → 409.
  if (project.activeRenderId) {
    const active = await repo.getRender(projectId, project.activeRenderId)
    if (active && RENDER_ACTIVE.includes(active.status)) throw E.renderInProgress(active.renderId)
    // Finished (or missing) but not cleared — clear it so the claim below can win.
    await statusSync.clearActiveRender(projectId, project.activeRenderId)
    project = await repo.getProject(projectId)
  }

  const version = project.edit.version
  if (editVersion !== null && editVersion !== version) throw E.editVersionConflict(version)

  // Step 3 — re-validate the stored edit
  const v = validateEditDocument(project.edit.document, {
    durationMs: project.source.durationMs, minClipMs: sc.minClipMs, maxClips: sc.maxClips,
  })
  if (v.issues.length || v.ruleIssues.length) {
    console.error(`[smartcrop] ${projectId} stored edit v${version} is invalid:`, JSON.stringify([...v.issues, ...v.ruleIssues]))
    throw E.editInvalid(v.ruleIssues.length ? v.ruleIssues : v.issues.map(i => ({ ...i, rule: 'SHAPE' })))
  }
  const doc = v.value
  ensureFeature(doc, project.source.durationMs)

  // Step 4 — claim
  const renderId = newRenderId()
  try {
    await repo.updateProject(projectId, {
      set: { activeRenderId: renderId, lastRenderId: renderId },
      expect: { status: PROJECT_STATUS.READY },
      and: 'attribute_not_exists(#n_activeRenderId) AND #n_edit.#n_version = :ver',
      values: { ':ver': version },
    })
  } catch (err) {
    if (!dynamo.isConditionalFail(err)) throw err
    const fresh = await repo.getProject(projectId)
    if (!fresh || fresh.deletedAt) throw E.projectNotFound()
    if (fresh.activeRenderId) throw E.renderInProgress(fresh.activeRenderId)
    if (fresh.status !== PROJECT_STATUS.READY) throw E.invalidState(fresh.status, [PROJECT_STATUS.READY])
    throw E.editVersionConflict(fresh.edit.version)
  }

  const now = new Date().toISOString()
  const render = {
    projectId,
    renderId,
    status: RENDER_STATUS.QUEUED,
    stage: 'PLANNING',
    editVersion: version,
    aspect: doc.aspect,
    defaultLayout: doc.defaultLayout,
    layouts: effectiveLayouts(doc),
    outputDurationMs: outputDurationMs(doc),
    executionArn: null,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    lastSyncedAt: null,
    output: null,
    error: null,
  }

  // Step 5 — frozen edit + render item (undo the claim if either fails)
  try {
    await store.writeJobsJson(store.keys.renderEdit(projectId, renderId), doc)
    await repo.createRender(render)
  } catch (err) {
    await statusSync.clearActiveRender(projectId, renderId).catch(() => {})
    throw err
  }

  // Step 6 — start
  let execution
  try {
    execution = await sfn.startExecution(
      pipeline.renderExecutionName(renderId),
      pipeline.renderInput(project, renderId, doc, { featureEdit: sc.hasFeature('edit') }),
    )
  } catch (err) {
    console.error(`[smartcrop] render ${renderId} StartExecution failed:`, err.name, err.message)
    await repo.updateRender(projectId, renderId, {
      set: { status: RENDER_STATUS.FAILED, stage: null, finishedAt: new Date().toISOString(), error: statusSync.failure('PIPELINE_FAILED') },
      expect: { status: RENDER_STATUS.QUEUED },
    }).catch(() => {})
    await statusSync.clearActiveRender(projectId, renderId).catch(() => {})
    throw err
  }

  // Step 7 — save the ARN, unless a cancel landed in between (then stop it).
  let saved
  try {
    saved = await repo.updateRender(projectId, renderId, {
      set: { executionArn: execution.executionArn, startedAt: (execution.startDate instanceof Date ? execution.startDate : new Date()).toISOString() },
      expect: { status: RENDER_STATUS.QUEUED },
      and: 'attribute_not_exists(#n_cancelRequestedAt)',
    })
  } catch (err) {
    if (!dynamo.isConditionalFail(err)) throw err
    await sfn.stopExecution(execution.executionArn, { error: 'Cancelled', cause: 'Cancelled before start' }).catch(() => {})
    saved = await repo.getRender(projectId, renderId)
  }

  return { location: location(projectId, renderId), render: await toRender(saved, { title: project.title }) }
}

// ─── get / download / list ──────────────────────────────────────────────────

async function loadSynced(projectId, renderId) {
  const project = await loadProject(projectId)
  let render = await loadRender(projectId, renderId)
  render = await statusSync.syncRender(render)
  return { project, render }
}

async function getRender(projectId, renderId) {
  const { project, render } = await loadSynced(projectId, renderId)
  return { render: await toRender(render, { title: project.title }) }
}

async function downloadUrl(projectId, renderId) {
  const { project, render } = await loadSynced(projectId, renderId)
  if (render.status !== RENDER_STATUS.SUCCEEDED) throw E.outputNotReady(render.status)
  const view = await toRender(render, { title: project.title })
  return view.output.downloadUrl
}

async function listRenders(projectId, { limit, startKey, statuses }) {
  const project = await loadProject(projectId)
  const { items, nextKey } = await repo.listRenders(projectId, { limit, startKey, statuses })
  const out = []
  for (const r of items) {
    const synced = r.renderId === project.activeRenderId ? await statusSync.syncRender(r) : r
    out.push(await toRender(synced, { title: project.title }))
  }
  return { items: out, nextCursor: nextKey ? encodeCursor(nextKey) : null }
}

// ─── cancel ─────────────────────────────────────────────────────────────────

const ACTIVE_ALLOWED = [RENDER_STATUS.QUEUED, RENDER_STATUS.RENDERING]

function terminalAnswer(render, title) {
  if (render.status === RENDER_STATUS.CANCELLED) return toRender(render, { title }).then(r => ({ render: r }))
  throw E.invalidState(render.status, ACTIVE_ALLOWED)
}

async function cancelRender(projectId, renderId) {
  const { project, render: synced } = await loadSynced(projectId, renderId)
  let render = synced
  if (!RENDER_ACTIVE.includes(render.status)) return terminalAnswer(render, project.title)

  // Step 3 — record the request
  try {
    render = await repo.updateRender(projectId, renderId, {
      set: { cancelRequestedAt: render.cancelRequestedAt || new Date().toISOString() },
      expect: { status: ACTIVE_ALLOWED },
    })
  } catch (err) {
    if (!dynamo.isConditionalFail(err)) throw err
    return terminalAnswer(await loadRender(projectId, renderId), project.title)
  }

  if (render.executionArn) {
    // Step 4 — stop; if it had already closed, sync and report what happened.
    try {
      await sfn.stopExecution(render.executionArn, { error: 'Cancelled', cause: 'Cancelled by user' })
    } catch (err) {
      if (!sfn.isDoesNotExist(err)) throw err
    }
    const desc = await sfn.describeExecution(render.executionArn)
    if (desc.status !== 'ABORTED' && desc.status !== 'RUNNING') {
      const after = await statusSync.syncRender(render, { force: true })
      if (!RENDER_ACTIVE.includes(after.status)) return terminalAnswer(after, project.title)
    }
  }

  // Step 5 — finalize
  try {
    render = await statusSync.finishRender(render, RENDER_STATUS.CANCELLED, {}, new Date())
  } catch (err) {
    if (!dynamo.isConditionalFail(err)) throw err
    return terminalAnswer(await loadRender(projectId, renderId), project.title)
  }
  return { render: await toRender(render, { title: project.title }) }
}

module.exports = { createRender, getRender, downloadUrl, listRenders, cancelRender }
