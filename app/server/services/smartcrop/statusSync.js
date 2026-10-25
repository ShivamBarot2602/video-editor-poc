/**
 * Status sync — no pipeline callbacks in the POC (spec 00 §6.3, 02 §7, 04 §3).
 *
 * A GET of a non-final project/render calls syncProject / syncRender, which:
 *   - skips unless stale (lastSyncedAt older than STATUS_REFRESH_MIN_MS) or forced,
 *   - dedupes per id in-process (one AWS round per id at a time),
 *   - reads DescribeExecution (+ history / pipeline row as needed),
 *   - writes conditionally on the status it read (no backwards moves),
 *   - on a lost race re-reads and returns the winner's record,
 *   - on AWS errors logs and returns the stored record unchanged.
 */

const sc = require('../../config/smartcrop')
const sfn = require('../../lib/sfn')
const dynamo = require('../../lib/dynamo')
const repo = require('./projectRepo')
const { smartcrop: store } = require('../../storage/videoStore')
const { identityEdit } = require('../../validators/smartcrop/editDocument')
const {
  PROJECT_STATUS, RENDER_STATUS, RENDER_ACTIVE, PROCESSING_STAGES, STATE_TO_STAGE, RENDER_ENCODING_STATES,
  FAILED_STATE_TO_CODE, FAILED_STAGE_BY_CODE, FAILURE_MESSAGES, ANALYSIS_FPS, MAX_SNAP_POINTS,
} = require('../../config/smartcropConstants')

const inflight = new Map()
function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key)
  const p = Promise.resolve().then(fn).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

const iso = (d) => (d instanceof Date ? d.toISOString() : d ? new Date(d).toISOString() : new Date().toISOString())

function isStale(item, now = Date.now()) {
  return !item.lastSyncedAt || now - Date.parse(item.lastSyncedAt) >= sc.statusRefreshMinMs
}

// Never move a processing stage backwards (Step Functions retries re-enter states).
function laterStage(current, next) {
  if (!next) return current || 'QUEUED'
  if (!current) return next
  return PROCESSING_STAGES.indexOf(next) > PROCESSING_STAGES.indexOf(current) ? next : current
}

function failure(code) {
  return { code, message: FAILURE_MESSAGES[code] || FAILURE_MESSAGES.PIPELINE_FAILED, failedStage: FAILED_STAGE_BY_CODE[code] || 'OTHER' }
}

// Initial-plan segment starts (analysis frames) → ms, sorted, unique, incl. 0, ≤ 2000.
function snapPointsFromPlan(plan) {
  const fps = Number(plan?.analysis_fps) > 0 ? Number(plan.analysis_fps) : ANALYSIS_FPS
  const pts = new Set([0])
  for (const seg of plan?.segments || []) {
    if (Number.isFinite(Number(seg?.start))) pts.add(Math.round((Number(seg.start) * 1000) / fps))
  }
  return [...pts].sort((a, b) => a - b).slice(0, MAX_SNAP_POINTS)
}

// The manifest entry for an aspect/layout, falling back to the first plan.
function pickPlan(manifest, { aspect, layout }) {
  const plans = Array.isArray(manifest?.plans) ? manifest.plans : []
  return plans.find(pl => pl.aspect === aspect && pl.layout === layout) || plans[0] || null
}

async function readJsonSafe(key) {
  try { return await store.readJobsJson(key) } catch (err) {
    console.warn(`[smartcrop] could not read ${key}:`, err.message)
    return null
  }
}

// ─── project ────────────────────────────────────────────────────────────────

async function syncProject(item, { force = false } = {}) {
  if (!item || item.status !== PROJECT_STATUS.PROCESSING) return item
  if (!item.processing?.executionArn) return item
  if (!force && !isStale(item)) return item
  return dedupe(`p:${item.projectId}`, () => doSyncProject(item))
}

function processingGuard(item) {
  return {
    expect: { status: PROJECT_STATUS.PROCESSING },
    and: '#n_processing.#n_attempt = :att',
    values: { ':att': item.processing.attempt },
  }
}

async function doSyncProject(item) {
  const p = item.projectId
  const arn = item.processing.executionArn
  try {
    const desc = await sfn.describeExecution(arn)
    switch (desc.status) {
      case 'RUNNING': {
        const state = await sfn.latestStateEntered(arn)
        const stage = laterStage(item.processing.stage, state ? STATE_TO_STAGE[state] : 'QUEUED')
        return await repo.updateProject(p, {
          set: { 'processing.stage': stage, lastSyncedAt: new Date().toISOString() },
          ...processingGuard(item),
        })
      }
      case 'SUCCEEDED':
        return await becomeReady(item, desc.stopDate)
      case 'FAILED': {
        const row = await repo.getPipelineRow(p)
        const failedState = row?.failed_state
        if (row?.error_message) console.warn(`[smartcrop] ${p} pipeline failed in ${failedState}: ${row.error_message}`)
        // Before pipeline change P1 the initial render can fail after a good plan:
        // the project is still usable.
        if (failedState === 'Render' && !sc.hasFeature('skip_render') && await store.jobs.exists(store.keys.plansManifest(p))) {
          console.warn(`[smartcrop] ${p} initial render failed but plans exist — marking READY`)
          return await becomeReady(item, desc.stopDate)
        }
        return await failProject(item, FAILED_STATE_TO_CODE[failedState] || 'PIPELINE_FAILED', desc.stopDate)
      }
      case 'TIMED_OUT':
        return await failProject(item, 'PIPELINE_TIMED_OUT', desc.stopDate)
      case 'ABORTED':
        return await failProject(item, 'PIPELINE_ABORTED', desc.stopDate)
      default:
        return item
    }
  } catch (err) {
    if (dynamo.isConditionalFail(err)) return (await repo.getProject(p)) || item
    console.warn(`[smartcrop] sync project ${p} failed:`, err.name, err.message)
    return item
  }
}

async function failProject(item, code, stopDate) {
  return repo.updateProject(item.projectId, {
    set: {
      status: PROJECT_STATUS.FAILED,
      'processing.stage': null,
      'processing.finishedAt': iso(stopDate),
      'processing.error': failure(code),
      lastSyncedAt: new Date().toISOString(),
    },
    ...processingGuard(item),
  })
}

// Becoming READY (spec 02 §7) — every step is safe to repeat.
async function becomeReady(item, stopDate) {
  const p = item.projectId
  const manifest = await readJsonSafe(store.keys.plansManifest(p))
  if (!manifest) return failProject(item, 'PIPELINE_FAILED', stopDate)

  const plan = pickPlan(manifest, item.initial)
  if (!plan) console.warn(`[smartcrop] ${p} plans.json has no plans`)
  const planKey = plan ? store.jobsKeyFromUri(p, plan.path) : null
  const planJson = planKey ? await readJsonSafe(planKey) : null
  const decision = await readJsonSafe(store.keys.decision(p))

  const now = new Date().toISOString()
  return repo.updateProject(p, {
    set: {
      status: PROJECT_STATUS.READY,
      'processing.stage': null,
      'processing.finishedAt': iso(stopDate),
      'processing.error': null,
      analysis: {
        snapPointsMs: snapPointsFromPlan(planJson),
        peopleCount: Array.isArray(decision?.people) ? decision.people.length : null,
      },
      edit: {
        version: 1,
        updatedAt: now,
        document: identityEdit({ aspect: item.initial.aspect, layout: item.initial.layout, durationMs: item.source.durationMs }),
      },
      lastSyncedAt: now,
    },
    ...processingGuard(item),
  })
}

// ─── render ─────────────────────────────────────────────────────────────────

async function syncRender(render, { force = false } = {}) {
  if (!render || !RENDER_ACTIVE.includes(render.status)) return render
  if (!render.executionArn) return render
  if (!force && !isStale(render)) return render
  return dedupe(`r:${render.renderId}`, () => doSyncRender(render))
}

async function doSyncRender(render) {
  const { projectId: p, renderId: r } = render
  try {
    const desc = await sfn.describeExecution(render.executionArn)
    switch (desc.status) {
      case 'RUNNING': {
        const state = await sfn.latestStateEntered(render.executionArn)
        const encoding = render.status === RENDER_STATUS.RENDERING || RENDER_ENCODING_STATES.includes(state)
        return await repo.updateRender(p, r, {
          set: {
            status: encoding ? RENDER_STATUS.RENDERING : RENDER_STATUS.QUEUED,
            stage: encoding ? 'ENCODING' : 'PLANNING',
            lastSyncedAt: new Date().toISOString(),
          },
          expect: { status: render.status },
        })
      }
      case 'SUCCEEDED':
        return await completeRender(render, desc.stopDate)
      case 'FAILED': {
        const row = await repo.getPipelineRow(r)
        const fs = row?.failed_state
        if (row?.error_message) console.warn(`[smartcrop] render ${r} failed in ${fs}: ${row.error_message}`)
        const code = fs === 'Plan' ? 'PLAN_FAILED' : (fs === 'Render' || fs === 'RenderOne') ? 'RENDER_FAILED' : 'PIPELINE_FAILED'
        return await finishRender(render, RENDER_STATUS.FAILED, { error: failure(code) }, desc.stopDate)
      }
      case 'TIMED_OUT':
        return await finishRender(render, RENDER_STATUS.FAILED, { error: failure('PIPELINE_TIMED_OUT') }, desc.stopDate)
      case 'ABORTED':
        return render.cancelRequestedAt
          ? await finishRender(render, RENDER_STATUS.CANCELLED, {}, desc.stopDate)
          : await finishRender(render, RENDER_STATUS.FAILED, { error: failure('PIPELINE_ABORTED') }, desc.stopDate)
      default:
        return render
    }
  } catch (err) {
    if (dynamo.isConditionalFail(err)) return (await repo.getRender(p, r)) || render
    console.warn(`[smartcrop] sync render ${r} failed:`, err.name, err.message)
    return render
  }
}

async function completeRender(render, stopDate) {
  const { projectId: p, renderId: r } = render
  const objects = (await store.out.listObjects(store.keys.renderOutPrefix(p, r))).filter(o => o.key.endsWith('.mp4'))
  if (!objects.length) return finishRender(render, RENDER_STATUS.FAILED, { error: failure('OUTPUT_MISSING') }, stopDate)

  let chosen = objects[0]
  if (objects.length > 1) {
    const preferred = `${render.aspect.replace(':', 'x')}_${render.defaultLayout}.mp4`
    chosen = objects.find(o => o.key.endsWith(`/${preferred}`)) || [...objects].sort((a, b) => a.key.localeCompare(b.key))[0]
    console.warn(`[smartcrop] render ${r} produced ${objects.length} mp4s; using ${chosen.key.split('/').pop()}`)
  }

  const manifest = await readJsonSafe(store.keys.renderPlansManifest(p, r))
  const canvas = pickPlan(manifest, { aspect: render.aspect, layout: render.defaultLayout })?.canvas || null
  return finishRender(render, RENDER_STATUS.SUCCEEDED, {
    output: { key: chosen.key, sizeBytes: chosen.size, width: canvas?.width ?? null, height: canvas?.height ?? null },
  }, stopDate)
}

// Terminal write + release the project's activeRenderId if it is this render.
async function finishRender(render, status, { output = null, error = null }, stopDate) {
  const { projectId: p, renderId: r } = render
  const updated = await repo.updateRender(p, r, {
    set: { status, stage: null, finishedAt: iso(stopDate), output, error, lastSyncedAt: new Date().toISOString() },
    expect: { status: render.status },
  })
  await clearActiveRender(p, r)
  if (status === RENDER_STATUS.CANCELLED) await deletePartialOutput(p, r)
  return updated
}

async function clearActiveRender(projectId, renderId) {
  try {
    await repo.updateProject(projectId, {
      remove: ['activeRenderId'],
      and: '#n_activeRenderId = :rid',
      values: { ':rid': renderId },
    })
  } catch (err) {
    if (!dynamo.isConditionalFail(err)) throw err
  }
}

async function deletePartialOutput(projectId, renderId) {
  try {
    await store.out.deleteByPrefix(store.keys.renderOutPrefix(projectId, renderId))
  } catch (err) {
    console.warn(`[smartcrop] could not delete partial output of ${renderId}:`, err.message)
  }
}

module.exports = {
  syncProject,
  syncRender,
  finishRender,
  clearActiveRender,
  deletePartialOutput,
  snapPointsFromPlan,
  pickPlan,
  laterStage,
  isStale,
  failure,
  _inflight: inflight,
}
