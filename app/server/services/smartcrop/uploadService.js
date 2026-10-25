/**
 * Upload flow (spec 01): create project + multipart upload → refresh part URLs
 * → complete (lock, assemble, probe, start processing) → abort.
 *
 * Decision (user): an UPLOAD_EXPIRED project answers 410 everywhere, whether
 * the expiry was stored earlier or found during this request.
 */

const sc = require('../../config/smartcrop')
const sfn = require('../../lib/sfn')
const dynamo = require('../../lib/dynamo')
const ffmpeg = require('../../lib/ffmpeg')
const { newProjectId } = require('../../lib/ids')
const { E, ApiError } = require('../../lib/apiError')
const repo = require('./projectRepo')
const pipeline = require('./pipeline')
const { analyseProbe } = require('./probe')
const { toProject } = require('./serializers')
const { smartcrop: store } = require('../../storage/videoStore')
const { checkPartNumbersRange, checkCompleteParts } = require('../../validators/smartcrop/uploads')
const { PROJECT_STATUS, COMPLETE_LOCK_MS, LIST_PK } = require('../../config/smartcropConstants')

const MiB = 1024 * 1024
const PROBE_TIMEOUT_MS = 30000

const isNoSuchUpload = (err) => err?.name === 'NoSuchUpload' || err?.Code === 'NoSuchUpload'
const INCOMPLETE_ERRORS = ['InvalidPart', 'InvalidPartOrder', 'EntityTooSmall']

// partCount ≤ 10 000: grow the part size (rounded up to a MiB) when needed.
function partPlan(sizeBytes, configuredPartSize) {
  let partSize = configuredPartSize
  let partCount = Math.ceil(sizeBytes / partSize)
  if (partCount > 10000) {
    partSize = Math.ceil(Math.ceil(sizeBytes / 10000) / MiB) * MiB
    partCount = Math.ceil(sizeBytes / partSize)
  }
  return { partSize, partCount }
}

const urlsExpireAtIso = () => new Date(Date.now() + sc.signedUrlTtlSec * 1000).toISOString()

async function presignParts(key, uploadId, numbers) {
  return Promise.all(numbers.map(async (partNumber) => ({
    partNumber,
    url: await store.in.presignUploadPart(key, uploadId, partNumber, { expiresIn: sc.signedUrlTtlSec }),
  })))
}

// ─── load / expiry helpers (shared with projectService) ──────────────────────

async function loadProject(projectId, { includeDeleted = false } = {}) {
  const item = await repo.getProject(projectId)
  if (!item || (item.deletedAt && !includeDeleted)) throw E.projectNotFound()
  return item
}

const isPastExpiry = (item, now = Date.now()) =>
  item.status === PROJECT_STATUS.UPLOADING && item.upload?.expiresAt && Date.parse(item.upload.expiresAt) <= now

// UPLOADING past expiresAt → UPLOAD_EXPIRED (+ abort the S3 upload). Returns the
// fresh item. Safe to call on any item.
async function expireIfNeeded(item) {
  if (!isPastExpiry(item)) return item
  return markExpired(item)
}

async function markExpired(item) {
  let updated = item
  try {
    updated = await repo.updateProject(item.projectId, {
      set: { status: PROJECT_STATUS.UPLOAD_EXPIRED },
      expect: { status: PROJECT_STATUS.UPLOADING },
    })
  } catch (err) {
    if (!dynamo.isConditionalFail(err)) throw err
    updated = await repo.getProject(item.projectId)
  }
  try {
    await store.in.abortMultipartUpload(item.source.key, item.upload.s3UploadId)
  } catch (err) {
    if (!isNoSuchUpload(err)) console.warn(`[smartcrop] abort of expired upload ${item.projectId} failed:`, err.message)
  }
  return updated
}

// ─── 1. create ───────────────────────────────────────────────────────────────

async function createUpload(v) {
  const projectId = newProjectId()
  const key = store.keys.source(projectId, v.ext)
  const { partSize, partCount } = partPlan(v.sizeBytes, sc.uploadPartSizeBytes)

  const uploadId = await store.in.createMultipartUpload(key, v.contentType)
  const parts = await presignParts(key, uploadId, Array.from({ length: partCount }, (_, i) => i + 1))

  const now = new Date()
  const createdAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + sc.uploadExpiryHours * 3600 * 1000).toISOString()
  const item = {
    projectId,
    listPk: LIST_PK,
    title: v.title,
    status: PROJECT_STATUS.UPLOADING,
    createdAt,
    updatedAt: createdAt,
    source: {
      key, ext: v.ext, fileName: v.fileName, contentType: v.contentType, sizeBytes: v.sizeBytes,
      durationMs: null, width: null, height: null, fps: null, hasAudio: null, videoCodec: null,
    },
    upload: { s3UploadId: uploadId, partSizeBytes: partSize, partCount, expiresAt, completedAt: null },
    initial: { aspect: v.initialAspect, layout: v.initialLayout },
    processing: null,
    edit: null,
    analysis: null,
    lastRenderId: null,
    lastSyncedAt: null,
  }

  try {
    await repo.createProject(item)
  } catch (err) {
    try { await store.in.abortMultipartUpload(key, uploadId) } catch (_) { /* best effort */ }
    throw err
  }

  return {
    project: toProject(item),
    upload: { partSizeBytes: partSize, partCount, parts, urlsExpireAt: urlsExpireAtIso(), expiresAt },
  }
}

// ─── 2. parts ────────────────────────────────────────────────────────────────

function assertUploading(item) {
  if (item.status === PROJECT_STATUS.UPLOAD_EXPIRED) throw E.uploadExpired()
  if (item.status !== PROJECT_STATUS.UPLOADING) throw E.uploadNotActive(item.status)
}

async function refreshParts(projectId, { partNumbers }) {
  let item = await loadProject(projectId)
  assertUploading(item)
  if (isPastExpiry(item)) {
    await markExpired(item)
    throw E.uploadExpired()
  }
  const rangeIssues = checkPartNumbersRange(partNumbers, item.upload.partCount)
  if (rangeIssues.length) throw E.validation(rangeIssues)

  const { key } = item.source
  let uploaded
  try {
    uploaded = await store.in.listParts(key, item.upload.s3UploadId)
  } catch (err) {
    if (isNoSuchUpload(err)) {
      await markExpired(item)
      throw E.uploadExpired()
    }
    throw err
  }

  const have = new Set(uploaded.map(p => p.partNumber))
  const wanted = partNumbers
    || Array.from({ length: item.upload.partCount }, (_, i) => i + 1).filter(n => !have.has(n))

  return {
    partSizeBytes: item.upload.partSizeBytes,
    partCount: item.upload.partCount,
    uploadedParts: uploaded,
    parts: await presignParts(key, item.upload.s3UploadId, wanted),
    urlsExpireAt: urlsExpireAtIso(),
    expiresAt: item.upload.expiresAt,
  }
}

// ─── 3. complete ─────────────────────────────────────────────────────────────

async function rejectProject(item, code, message) {
  try { await store.in.deleteObject(item.source.key) } catch (err) {
    console.warn(`[smartcrop] could not delete rejected source ${item.projectId}:`, err.message)
  }
  await repo.updateProject(item.projectId, {
    set: {
      status: PROJECT_STATUS.REJECTED,
      processing: { executionArn: null, attempt: null, stage: null, startedAt: null, finishedAt: null, error: { code, message, failedStage: null } },
    },
    remove: ['upload.completingAt'],
    expect: { status: PROJECT_STATUS.UPLOADING },
  })
}

async function missingParts(item, parts) {
  const inS3 = await store.in.listParts(item.source.key, item.upload.s3UploadId)
  const byNumber = new Map(inS3.map(p => [p.partNumber, p.etag]))
  const sent = new Map(parts.map(p => [p.partNumber, p.etag]))
  const missing = []
  for (let n = 1; n <= item.upload.partCount; n++) {
    const etag = byNumber.get(n)
    if (!etag || (sent.has(n) && sent.get(n) !== etag)) missing.push(n)
  }
  return missing
}

async function completeUpload(projectId, { parts }) {
  let item = await loadProject(projectId)

  // Step 1 — status gate
  if ([PROJECT_STATUS.PROCESSING, PROJECT_STATUS.READY, PROJECT_STATUS.FAILED].includes(item.status) && item.upload?.completedAt) {
    return { project: toProject(item) }
  }
  assertUploading(item)
  if (isPastExpiry(item)) {
    await markExpired(item)
    throw E.uploadExpired()
  }
  const shapeIssues = checkCompleteParts(parts, item.upload.partCount)
  if (shapeIssues.length) throw E.validation(shapeIssues)

  // Step 2 — lock (stale after 2 min)
  const lockAt = new Date()
  try {
    item = await repo.updateProject(projectId, {
      set: { 'upload.completingAt': lockAt.toISOString() },
      expect: { status: PROJECT_STATUS.UPLOADING },
      and: 'attribute_not_exists(#n_upload.#n_completingAt) OR #n_upload.#n_completingAt < :stale',
      values: { ':stale': new Date(lockAt.getTime() - COMPLETE_LOCK_MS).toISOString() },
    })
  } catch (err) {
    if (dynamo.isConditionalFail(err)) throw E.requestInProgress()
    throw err
  }

  let released = false
  const release = async () => {
    if (released) return
    released = true
    try {
      await repo.updateProject(projectId, {
        remove: ['upload.completingAt'],
        and: '#n_upload.#n_completingAt = :lock',
        values: { ':lock': lockAt.toISOString() },
      })
    } catch (err) {
      if (!dynamo.isConditionalFail(err)) console.warn(`[smartcrop] lock release failed for ${projectId}:`, err.message)
    }
  }

  try {
    // Steps 3–6 run only once: a resumed call (completedAt set) skips to step 7.
    if (!item.upload.completedAt) {
      item = await assembleAndProbe(item, parts)
    }
    // Step 7 — start processing
    const name = pipeline.processingExecutionName(projectId, 1)
    const { executionArn, startDate } = await sfn.startExecution(name, pipeline.processingInput(item, 1))

    // Step 8 — UPLOADING → PROCESSING (also drops the lock)
    try {
      item = await repo.updateProject(projectId, {
        set: {
          status: PROJECT_STATUS.PROCESSING,
          processing: {
            executionArn, attempt: 1, stage: 'QUEUED',
            startedAt: (startDate instanceof Date ? startDate : new Date()).toISOString(),
            finishedAt: null, error: null,
          },
        },
        remove: ['upload.completingAt'],
        expect: { status: PROJECT_STATUS.UPLOADING },
      })
      released = true
    } catch (err) {
      if (!dynamo.isConditionalFail(err)) throw err
      item = await repo.getProject(projectId) // someone else already moved it
    }
    return { project: toProject(item) }
  } finally {
    await release()
  }
}

// Steps 4–6 + saving media fields and completedAt.
async function assembleAndProbe(item, parts) {
  const { key } = item.source
  // Step 4 — assemble
  try {
    await store.in.completeMultipartUpload(key, item.upload.s3UploadId, parts.map(p => ({ partNumber: p.partNumber, eTag: p.etag })))
  } catch (err) {
    const name = err?.name || err?.Code
    if (INCOMPLETE_ERRORS.includes(name)) throw E.uploadIncomplete(await missingParts(item, parts))
    if (isNoSuchUpload(err)) {
      const head = await store.in.head(key)
      if (!head || head.size !== item.source.sizeBytes) {
        await markExpired(item)
        throw E.uploadExpired()
      }
      // Already assembled by an earlier call that died before saving — carry on.
    } else throw err
  }

  // Step 5 — size check
  const head = await store.in.head(key)
  if (!head || head.size !== item.source.sizeBytes) {
    await rejectProject(item, 'UPLOAD_INCOMPLETE', 'The uploaded file is not the size that was declared.')
    throw E.uploadIncomplete([])
  }

  // Step 6 — probe through a presigned GET
  const url = await store.in.presignGet(key, { expiresIn: 600 })
  let probeJson = null
  try {
    probeJson = await ffmpeg.probe(url, { timeoutMs: PROBE_TIMEOUT_MS })
  } catch (err) {
    console.warn(`[smartcrop] ffprobe failed for ${item.projectId}:`, err.code, err.message)
  }
  const result = analyseProbe(probeJson, item.source.ext, {
    minDurationMs: sc.videoMinDurationMs,
    maxDurationMs: sc.videoMaxDurationMs,
    minShortSidePx: sc.videoMinShortSidePx,
    maxLongSidePx: sc.videoMaxLongSidePx,
  })
  if (result.error) {
    await rejectProject(item, result.error.code, result.error.message)
    const status = 422
    throw new ApiError(status, result.error.code, result.error.message, result.error.details)
  }

  // Step 7 (first half) — persist media + completedAt so a retry never re-probes.
  const m = result.media
  return repo.updateProject(item.projectId, {
    set: {
      'source.durationMs': m.durationMs,
      'source.width': m.width,
      'source.height': m.height,
      'source.fps': m.fps,
      'source.hasAudio': m.hasAudio,
      'source.videoCodec': m.videoCodec,
      'upload.completedAt': new Date().toISOString(),
    },
    expect: { status: PROJECT_STATUS.UPLOADING },
  })
}

// ─── 4. abort ────────────────────────────────────────────────────────────────

async function abortUpload(projectId) {
  const item = await loadProject(projectId)
  if (item.status === PROJECT_STATUS.UPLOAD_ABORTED || item.status === PROJECT_STATUS.UPLOAD_EXPIRED) return
  if (item.status !== PROJECT_STATUS.UPLOADING) throw E.uploadNotActive(item.status)
  const lock = item.upload?.completingAt
  if (lock && Date.now() - Date.parse(lock) < COMPLETE_LOCK_MS) throw E.requestInProgress()

  try {
    await store.in.abortMultipartUpload(item.source.key, item.upload.s3UploadId)
  } catch (err) {
    if (!isNoSuchUpload(err)) throw err
  }
  await store.in.deleteObject(item.source.key)
  try {
    await repo.updateProject(projectId, {
      set: { status: PROJECT_STATUS.UPLOAD_ABORTED },
      expect: { status: PROJECT_STATUS.UPLOADING },
    })
  } catch (err) {
    if (!dynamo.isConditionalFail(err)) throw err
    const fresh = await repo.getProject(projectId)
    if (fresh && fresh.status !== PROJECT_STATUS.UPLOAD_ABORTED) throw E.uploadNotActive(fresh.status)
  }
}

module.exports = {
  createUpload, refreshParts, completeUpload, abortUpload,
  loadProject, expireIfNeeded, isPastExpiry, partPlan,
}
