/**
 * Projects (spec 02): list, status, editor bootstrap, retry, delete.
 */

const sc = require('../../config/smartcrop')
const sfn = require('../../lib/sfn')
const dynamo = require('../../lib/dynamo')
const { E } = require('../../lib/apiError')
const repo = require('./projectRepo')
const pipeline = require('./pipeline')
const previewService = require('./previewService')
const { toProject, urlsExpireAt } = require('./serializers')
const { loadProject, expireIfNeeded, isPastExpiry } = require('./uploadService')
const { loadAndSync, serialize } = require('./projectLoader')
const { smartcrop: store } = require('../../storage/videoStore')
const { encodeCursor } = require('../../validators/smartcrop/common')
const {
  PROJECT_STATUS, RENDER_ACTIVE, ASPECTS, LAYOUT_SUPPORT, MAX_PROCESSING_ATTEMPTS, ANALYSIS_FPS,
} = require('../../config/smartcropConstants')

// Mutable so tests can shorten the 25 s foreground window.
const settings = { deleteForegroundMs: 25000 }
const PROXY_SHORT_SIDE = 540

// ─── list ───────────────────────────────────────────────────────────────────

async function list({ limit, startKey, statuses }) {
  const { items, nextKey } = await repo.listProjects({ limit, startKey, statuses })
  const fresh = []
  for (const it of items) fresh.push(isPastExpiry(it) ? await expireIfNeeded(it) : it)

  const renderKeys = fresh.filter(i => i.lastRenderId).map(i => ({ projectId: i.projectId, renderId: i.lastRenderId }))
  const renders = await repo.getRendersByIds(renderKeys)
  const byId = new Map(renders.map(r => [r.renderId, r]))
  return {
    items: fresh.map(i => toProject(i, { lastRender: byId.get(i.lastRenderId) || null })),
    nextCursor: nextKey ? encodeCursor(nextKey) : null,
  }
}

// ─── get ────────────────────────────────────────────────────────────────────

async function get(projectId) {
  return { project: await serialize(await loadAndSync(projectId)) }
}

// ─── editor ─────────────────────────────────────────────────────────────────

function proxySize(width, height) {
  const short = Math.min(width, height)
  const scale = PROXY_SHORT_SIDE / short
  const even = (n) => Math.max(2, Math.round(n / 2) * 2)
  return width >= height
    ? { width: even(width * scale), height: PROXY_SHORT_SIDE }
    : { width: PROXY_SHORT_SIDE, height: even(height * scale) }
}

async function editorMedia(item) {
  const p = item.projectId
  const ttl = { expiresIn: sc.signedUrlTtlSec }
  const editorMediaOn = sc.hasFeature('editor_media')

  let video
  if (editorMediaOn && await store.jobs.exists(store.keys.proxy(p))) {
    video = {
      url: await store.jobs.presignGet(store.keys.proxy(p), { ...ttl, responseContentType: 'video/mp4' }),
      kind: 'proxy',
      ...proxySize(item.source.width, item.source.height),
      contentType: 'video/mp4',
    }
  } else {
    video = {
      url: await store.in.presignGet(item.source.key, { ...ttl, responseContentType: item.source.contentType }),
      kind: 'source',
      width: item.source.width,
      height: item.source.height,
      contentType: item.source.contentType,
    }
  }

  let waveform = null
  let thumbnails = null
  if (editorMediaOn) {
    if (await store.jobs.exists(store.keys.waveform(p))) {
      waveform = { url: await store.jobs.presignGet(store.keys.waveform(p), { ...ttl, responseContentType: 'application/json' }) }
    }
    if (await store.jobs.exists(store.keys.thumbsJpg(p))) {
      let meta = null
      try { meta = await store.readJobsJson(store.keys.thumbsJson(p)) } catch (_) { meta = null }
      if (meta) {
        thumbnails = {
          url: await store.jobs.presignGet(store.keys.thumbsJpg(p), { ...ttl, responseContentType: 'image/jpeg' }),
          intervalMs: meta.intervalMs ?? null,
          tileWidth: meta.tileWidth ?? null,
          tileHeight: meta.tileHeight ?? null,
          columns: meta.columns ?? null,
          count: meta.count ?? null,
        }
      }
    }
  }
  return { video, waveform, thumbnails, urlsExpireAt: urlsExpireAt() }
}

async function editor(projectId) {
  const item = await loadAndSync(projectId)
  if (item.status !== PROJECT_STATUS.READY) throw E.invalidState(item.status, [PROJECT_STATUS.READY])

  const doc = item.edit.document
  return {
    project: await serialize(item),
    media: await editorMedia(item),
    timing: { durationMs: item.source.durationMs, sourceFps: item.source.fps, analysisFps: ANALYSIS_FPS },
    analysis: {
      snapPointsMs: item.analysis?.snapPointsMs || [0],
      peopleCount: item.analysis?.peopleCount ?? null,
    },
    capabilities: {
      aspects: ASPECTS,
      layoutsByAspect: LAYOUT_SUPPORT,
      minClipMs: sc.minClipMs,
      maxClips: sc.maxClips,
      features: { edit: sc.hasFeature('edit'), editorMedia: sc.hasFeature('editor_media') },
    },
    edit: { version: item.edit.version, updatedAt: item.edit.updatedAt, document: doc },
    preview: await previewService.cachedPreviewFor(item, doc),
  }
}

// ─── retry ──────────────────────────────────────────────────────────────────

const START_AT_BY_STAGE = { PREPARE: 1, ANALYZE: 2, DECIDE: 3, PLAN: 4 }

// Inputs each start_at needs (spec 02 §5 step 2).
function inputsFor(p, startAt) {
  const k = store.keys
  return {
    2: [k.media(p), k.audioMfcc(p)],
    3: [k.analysis(p)],
    4: [k.decision(p)],
  }[startAt] || []
}

async function resolveStartAt(p, failedStage) {
  let startAt = START_AT_BY_STAGE[failedStage] || 1
  while (startAt > 1) {
    const present = await Promise.all(inputsFor(p, startAt).map(key => store.jobs.exists(key)))
    if (present.every(Boolean)) break
    startAt -= 1
  }
  return startAt
}

async function retry(projectId) {
  const item = await loadAndSync(projectId, { force: true })
  if (item.status !== PROJECT_STATUS.FAILED) throw E.invalidState(item.status, [PROJECT_STATUS.FAILED])
  const attempt = item.processing?.attempt || 1
  if (attempt >= MAX_PROCESSING_ATTEMPTS) {
    throw E.invalidState(item.status, [PROJECT_STATUS.FAILED], `This video failed ${MAX_PROCESSING_ATTEMPTS} times. Please upload it again.`)
  }

  const startAt = await resolveStartAt(projectId, item.processing?.error?.failedStage)
  const nextAttempt = attempt + 1
  const { executionArn, startDate } = await sfn.startExecution(
    pipeline.processingExecutionName(projectId, nextAttempt),
    pipeline.processingInput(item, startAt),
  )

  try {
    const updated = await repo.updateProject(projectId, {
      set: {
        status: PROJECT_STATUS.PROCESSING,
        processing: {
          executionArn, attempt: nextAttempt, stage: 'QUEUED',
          startedAt: (startDate instanceof Date ? startDate : new Date()).toISOString(),
          finishedAt: null, error: null,
        },
        lastSyncedAt: null,
      },
      expect: { status: PROJECT_STATUS.FAILED },
      and: '#n_processing.#n_attempt = :att',
      values: { ':att': attempt },
    })
    return { project: await serialize(updated) }
  } catch (err) {
    if (!dynamo.isConditionalFail(err)) throw err
    try { await sfn.stopExecution(executionArn, { error: 'Superseded', cause: 'Concurrent retry' }) } catch (stopErr) {
      console.warn(`[smartcrop] could not stop superseded retry ${projectId}:`, stopErr.message)
    }
    throw E.requestInProgress()
  }
}

// ─── delete ─────────────────────────────────────────────────────────────────

async function stopQuietly(arn) {
  try {
    await sfn.stopExecution(arn, { error: 'Deleted', cause: 'Project deleted' })
  } catch (err) {
    if (!sfn.isDoesNotExist(err)) throw err
  }
}

// Order: stop spending → files → records (spec 02 §6). Every step is repeatable.
async function deleteEverything(item) {
  const p = item.projectId
  if (item.status === PROJECT_STATUS.UPLOADING && item.upload?.s3UploadId) {
    try {
      await store.in.abortMultipartUpload(item.source.key, item.upload.s3UploadId)
    } catch (err) {
      if (!(err?.name === 'NoSuchUpload' || err?.Code === 'NoSuchUpload')) throw err
    }
  }
  if (item.status === PROJECT_STATUS.PROCESSING && item.processing?.executionArn) await stopQuietly(item.processing.executionArn)
  const renders = await repo.allRenders(p)
  for (const r of renders) {
    if (RENDER_ACTIVE.includes(r.status) && r.executionArn) await stopQuietly(r.executionArn)
  }

  await store.deleteProjectFiles(p)

  for (const r of renders) await repo.deleteRenderItem(p, r.renderId)
  await repo.deleteProjectItem(p)
}

/**
 * Returns { status: 204 } or { status: 202, body: { status: 'DELETING' } } when
 * it runs past 25 s (the rest finishes in the background). A second DELETE of an
 * item still marked deletedAt resumes the work (decision: DELETE ignores
 * deletedAt; every other endpoint 404s on it).
 */
async function remove(projectId) {
  let item = await loadProject(projectId, { includeDeleted: true })
  if (!item.deletedAt) {
    item = await repo.updateProject(projectId, { set: { deletedAt: new Date().toISOString() } })
  }

  const work = deleteEverything(item)
  let timer
  const slow = new Promise(resolve => { timer = setTimeout(() => resolve('slow'), settings.deleteForegroundMs) })
  try {
    const first = await Promise.race([work.then(() => 'done'), slow])
    if (first === 'slow') {
      work.catch(err => console.error(`[smartcrop] background delete of ${projectId} failed:`, err.name, err.message))
      return { status: 202, body: { status: 'DELETING' } }
    }
    return { status: 204 }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { list, get, editor, retry, remove, loadAndSync, serialize, proxySize, resolveStartAt, settings }
