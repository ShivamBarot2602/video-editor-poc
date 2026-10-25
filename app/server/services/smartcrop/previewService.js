/**
 * Preview plan (spec 03 §4) — a synchronous Plan Lambda run, cached in JOBS
 * under previews/{hash}/ and deduped in-process per (project, hash).
 */

const crypto = require('crypto')
const sc = require('../../config/smartcrop')
const lambda = require('../../lib/lambda')
const { E } = require('../../lib/apiError')
const pipeline = require('./pipeline')
const { pickPlan } = require('./statusSync')
const { urlsExpireAt } = require('./serializers')
const { loadAndSync } = require('./projectLoader')
const { smartcrop: store } = require('../../storage/videoStore')
const {
  validateEditDocument, effectiveLayout, outputDurationMs, isIdentityEdit,
} = require('../../validators/smartcrop/editDocument')
const { PROJECT_STATUS, ANALYSIS_FPS } = require('../../config/smartcropConstants')

const FRAME_MS = 1000 / ANALYSIS_FPS

// ─── hashing ────────────────────────────────────────────────────────────────

// JSON with sorted keys, no whitespace.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

// First 32 hex of SHA-256 over what the plan depends on — clip ids excluded.
function previewHash(doc, planVersion = sc.planVersion) {
  const payload = {
    v: planVersion,
    aspect: doc.aspect,
    defaultLayout: doc.defaultLayout,
    options: { background: doc.options.background, fallbackLayout: doc.options.fallbackLayout },
    clips: doc.clips.map(c => [c.sourceStartMs, c.sourceEndMs, effectiveLayout(doc, c)]),
  }
  return crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex').slice(0, 32)
}

// ─── response ───────────────────────────────────────────────────────────────

// Non-fill layouts that fell back to fill on more than 1 frame per clip.
function layoutWarnings(doc, manifestPlan) {
  const layoutFrames = manifestPlan.layout_frames || {}
  const expectedByLayout = {}
  const clipsByLayout = {}
  for (const c of doc.clips) {
    const l = effectiveLayout(doc, c)
    expectedByLayout[l] = (expectedByLayout[l] || 0) + (c.sourceEndMs - c.sourceStartMs) / FRAME_MS
    clipsByLayout[l] = (clipsByLayout[l] || 0) + 1
  }
  // The plan can cover fewer frames than the media duration implies (analysis
  // frame count vs. container duration); compare proportionally.
  const totalExpected = Object.values(expectedByLayout).reduce((a, b) => a + b, 0)
  const scale = manifestPlan.frames && totalExpected ? manifestPlan.frames / totalExpected : 1

  const warnings = []
  for (const layout of Object.keys(expectedByLayout).sort()) {
    if (layout === 'fill') continue
    const expected = Math.round(expectedByLayout[layout] * Math.min(1, scale))
    const actual = Number(layoutFrames[layout] || 0)
    if (expected - actual > clipsByLayout[layout]) {
      warnings.push({
        code: 'LAYOUT_FALLBACK',
        layout,
        fallbackFrames: expected - actual,
        message: 'No faces in some shots; those use fill.',
      })
    }
  }
  return warnings
}

/**
 * Build the 03 §4 response from a manifest in JOBS. `manifestKey` is either a
 * preview's plans.json or the initial {p}/plans/plans.json.
 */
async function buildResponse(project, doc, { previewId, cached, manifestKey, pick }) {
  const p = project.projectId
  const manifest = await store.readJobsJson(manifestKey)
  if (!manifest) return null
  const plan = pick ? pickPlan(manifest, pick) : (manifest.plans || [])[0]
  if (!plan) return null
  const planKey = store.jobsKeyFromUri(p, plan.path)
  if (!planKey) {
    console.error(`[smartcrop] ${p} manifest plan path outside project/jobs bucket`)
    return null
  }
  const head = await store.jobs.head(planKey)
  if (!head) return null
  const url = await store.jobs.presignGet(planKey, { expiresIn: sc.signedUrlTtlSec, responseContentType: 'application/json' })

  return {
    previewId,
    cached,
    aspect: doc.aspect,
    defaultLayout: doc.defaultLayout,
    canvas: plan.canvas || null,
    analysisFps: ANALYSIS_FPS,
    frames: plan.frames ?? null,
    outputDurationMs: outputDurationMs(doc),
    layoutFrames: plan.layout_frames || {},
    plan: { url, sizeBytes: head.size },
    urlsExpireAt: urlsExpireAt(),
    warnings: layoutWarnings(doc, plan),
  }
}

/**
 * Editor bootstrap (02 §4 step 4): a cached preview of the current edit, else
 * the initial plan when the edit is the identity edit with the initial
 * aspect/layout, else null.
 */
async function cachedPreviewFor(project, doc) {
  const p = project.projectId
  const h = previewHash(doc)
  const cached = await buildResponse(project, doc, { previewId: h, cached: true, manifestKey: store.keys.previewManifest(p, h) })
  if (cached) return cached
  if (isIdentityEdit(doc, project.source.durationMs)
    && doc.aspect === project.initial.aspect && doc.defaultLayout === project.initial.layout) {
    return buildResponse(project, doc, {
      previewId: 'initial', cached: true, manifestKey: store.keys.plansManifest(p), pick: project.initial,
    })
  }
  return null
}

// ─── preview-plan ───────────────────────────────────────────────────────────

const inflight = new Map() // `${p}:${h}` → Promise<response>

function inflightCount(p) {
  let n = 0
  for (const k of inflight.keys()) if (k.startsWith(`${p}:`)) n++
  return n
}

function ensureFeature(doc, durationMs) {
  if (!sc.hasFeature('edit') && !isIdentityEdit(doc, durationMs)) throw E.featureNotAvailable('edit')
}

async function runPlan(project, doc, h) {
  const p = project.projectId
  await store.writeJobsJson(store.keys.previewEdit(p, h), doc)

  const event = pipeline.previewEvent(project, h, doc, { featureEdit: sc.hasFeature('edit') })
  let result
  try {
    result = await lambda.invoke(sc.planLambdaFunction, event, { timeoutMs: sc.previewTimeoutMs })
  } catch (err) {
    if (err?.code === 'LAMBDA_TIMEOUT') throw E.previewTimeout()
    if (err?.name === 'TooManyRequestsException') throw E.previewBusy(1000)
    throw err // tagged lambda → 502
  }

  if (!result.ok) {
    if (result.errorType === 'StageFailed') {
      console.warn(`[smartcrop] preview ${p}/${h} StageFailed: ${result.errorMessage}`)
      throw E.previewFailed()
    }
    console.error(`[smartcrop] preview ${p}/${h} Lambda error ${result.errorType}: ${result.errorMessage}`)
    throw E.upstream('lambda')
  }
  const out = result.payload || {}
  if (!Array.isArray(out.plans) || out.plans.length !== 1 || (Array.isArray(out.skipped) && out.skipped.length)) {
    console.error(`[smartcrop] preview ${p}/${h} unexpected Lambda result: plans=${out.plans?.length} skipped=${JSON.stringify(out.skipped)}`)
    throw E.upstream('lambda')
  }

  const response = await buildResponse(project, doc, { previewId: h, cached: false, manifestKey: store.keys.previewManifest(p, h) })
  if (!response) {
    console.error(`[smartcrop] preview ${p}/${h} Lambda succeeded but manifest/plan is missing`)
    throw E.upstream('lambda')
  }
  return response
}

async function previewPlan(projectId, body) {
  const project = await loadAndSync(projectId)
  if (project.status !== PROJECT_STATUS.READY) throw E.invalidState(project.status, [PROJECT_STATUS.READY])

  let doc
  if (body.editVersion !== undefined) {
    if (body.editVersion !== project.edit.version) throw E.editVersionConflict(project.edit.version)
    doc = project.edit.document
  } else {
    const v = validateEditDocument(body.document, {
      durationMs: project.source.durationMs, minClipMs: sc.minClipMs, maxClips: sc.maxClips,
    })
    if (v.issues.length) throw E.validation(v.issues)
    if (v.ruleIssues.length) throw E.editInvalid(v.ruleIssues)
    doc = v.value
  }
  ensureFeature(doc, project.source.durationMs)

  const h = previewHash(doc)
  const key = `${projectId}:${h}`

  if (inflight.has(key)) return inflight.get(key)

  const cached = await buildResponse(project, doc, { previewId: h, cached: true, manifestKey: store.keys.previewManifest(projectId, h) })
  if (cached) return cached

  if (inflight.has(key)) return inflight.get(key) // raced in while we checked the cache
  if (inflightCount(projectId) >= sc.previewMaxInflightPerProject) throw E.previewBusy(1000)

  const promise = runPlan(project, doc, h).finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

module.exports = {
  previewPlan, cachedPreviewFor, previewHash, canonicalJson, layoutWarnings, ensureFeature, _inflight: inflight,
}
