/**
 * DynamoDB items → public `Project` (spec 02 §1) and `Render` (04 §1) objects.
 * Every documented field is present (null when empty) and nothing leaks S3
 * keys, bucket names or ARNs.
 */

const sc = require('../../config/smartcrop')
const { smartcrop: store } = require('../../storage/videoStore')
const { PROJECT_STATUS, RENDER_STATUS, MAX_PROCESSING_ATTEMPTS } = require('../../config/smartcropConstants')

const nn = (v) => (v === undefined ? null : v)
const ms = (iso) => (iso ? Date.parse(iso) : null)

const urlsExpireAt = (now = Date.now()) => new Date(now + sc.signedUrlTtlSec * 1000).toISOString()

function elapsed(startedAt, finishedAt, now) {
  if (!startedAt) return null
  return Math.max(0, (finishedAt ? ms(finishedAt) : now) - ms(startedAt))
}

function projectProcessing(item, now) {
  const s = item.status
  if (s === PROJECT_STATUS.UPLOADING || s === PROJECT_STATUS.UPLOAD_ABORTED || s === PROJECT_STATUS.UPLOAD_EXPIRED) return null
  const p = item.processing || {}
  return {
    stage: s === PROJECT_STATUS.PROCESSING ? nn(p.stage) : null,
    attempt: nn(p.attempt),
    startedAt: nn(p.startedAt),
    finishedAt: nn(p.finishedAt),
    elapsedMs: elapsed(p.startedAt, p.finishedAt, now),
    error: p.error ? { code: p.error.code, message: p.error.message, failedStage: nn(p.error.failedStage) } : null,
    retryable: s === PROJECT_STATUS.FAILED && (p.attempt || 0) < MAX_PROCESSING_ATTEMPTS,
  }
}

function lastRenderSummary(render) {
  if (!render) return null
  return {
    renderId: render.renderId,
    status: render.status,
    aspect: render.aspect,
    createdAt: render.createdAt,
    finishedAt: nn(render.finishedAt),
  }
}

/** item + (optional) its last render item → Project */
function toProject(item, { lastRender = null, now = Date.now() } = {}) {
  const src = item.source || {}
  const up = item.upload || {}
  return {
    projectId: item.projectId,
    title: item.title,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    initial: { aspect: item.initial.aspect, layout: item.initial.layout },
    source: {
      fileName: nn(src.fileName),
      contentType: nn(src.contentType),
      sizeBytes: nn(src.sizeBytes),
      durationMs: nn(src.durationMs),
      width: nn(src.width),
      height: nn(src.height),
      fps: nn(src.fps),
      hasAudio: nn(src.hasAudio),
      videoCodec: nn(src.videoCodec),
    },
    upload: {
      partCount: nn(up.partCount),
      partSizeBytes: nn(up.partSizeBytes),
      expiresAt: nn(up.expiresAt),
      completedAt: nn(up.completedAt),
    },
    processing: projectProcessing(item, now),
    edit: item.status === PROJECT_STATUS.READY && item.edit ? { version: item.edit.version, updatedAt: item.edit.updatedAt } : null,
    activeRenderId: nn(item.activeRenderId),
    lastRender: lastRender && lastRender.renderId === item.lastRenderId ? lastRenderSummary(lastRender) : null,
    lastSyncedAt: nn(item.lastSyncedAt),
  }
}

// RFC 5987 ext-value for filename*= — encodeURIComponent leaves ' ( ) * as-is.
const rfc5987 = (s) => encodeURIComponent(s).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

// "{title} ({aspect with : → x}).mp4", chars outside [A-Za-z0-9 ._()-] → _, max 120.
function renderFileName(title, aspect) {
  const suffix = ` (${aspect.replace(':', 'x')}).mp4`
  const clean = (s) => String(s || '').replace(/[^A-Za-z0-9 ._()-]/g, '_')
  const base = clean(title || 'video').slice(0, 120 - suffix.length)
  return base + suffix
}

/**
 * render item → Render. SUCCEEDED renders get freshly signed output URLs
 * (needs the project title for the download file name).
 */
async function toRender(render, { title, now = Date.now() } = {}) {
  let output = null
  if (render.status === RENDER_STATUS.SUCCEEDED && render.output?.key) {
    const fileName = renderFileName(title, render.aspect)
    const expiresIn = sc.signedUrlTtlSec
    const [url, downloadUrl] = await Promise.all([
      store.out.presignGet(render.output.key, { expiresIn, responseContentType: 'video/mp4' }),
      store.out.presignGet(render.output.key, {
        expiresIn,
        responseContentType: 'video/mp4',
        responseContentDisposition: `attachment; filename*=UTF-8''${rfc5987(fileName)}`,
      }),
    ])
    output = {
      url,
      downloadUrl,
      fileName,
      sizeBytes: nn(render.output.sizeBytes),
      width: nn(render.output.width),
      height: nn(render.output.height),
      urlsExpireAt: urlsExpireAt(now),
    }
  }
  return {
    renderId: render.renderId,
    projectId: render.projectId,
    status: render.status,
    editVersion: render.editVersion,
    aspect: render.aspect,
    layouts: render.layouts || [],
    outputDurationMs: nn(render.outputDurationMs),
    stage: nn(render.stage),
    createdAt: render.createdAt,
    startedAt: nn(render.startedAt),
    finishedAt: nn(render.finishedAt),
    elapsedMs: elapsed(render.startedAt, render.finishedAt, now),
    output,
    error: render.error ? { code: render.error.code, message: render.error.message, failedStage: nn(render.error.failedStage) } : null,
    cancelRequestedAt: nn(render.cancelRequestedAt),
  }
}

module.exports = { toProject, toRender, renderFileName, urlsExpireAt, lastRenderSummary }
