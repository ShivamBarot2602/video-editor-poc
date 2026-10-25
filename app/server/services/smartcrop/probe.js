/**
 * ffprobe JSON → media fields + ordered acceptance checks (spec 01 §3 step 6).
 *
 * analyseProbe(json, ext, limits) → { media } | { error: { code, message, details } }
 * Checks, first failure wins: unreadable / wrong container → VIDEO_UNREADABLE;
 * no video stream → VIDEO_NO_VIDEO_STREAM; duration → VIDEO_TOO_SHORT/LONG;
 * size → VIDEO_RESOLUTION_UNSUPPORTED. Silent video is accepted.
 */

const { FORMAT_NAMES } = require('../../config/smartcropConstants')

const unreadable = () => ({
  error: { code: 'VIDEO_UNREADABLE', message: "We couldn't read this file as a video.", details: null },
})

function parseRate(rate) {
  if (typeof rate !== 'string') return null
  const [num, den] = rate.split('/').map(Number)
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0 || num === 0) return null
  return Math.round((num / den) * 1000) / 1000
}

function rotationOf(stream) {
  for (const sd of stream.side_data_list || []) {
    if (sd && sd.rotation != null && Number.isFinite(Number(sd.rotation))) return Number(sd.rotation)
  }
  const tag = stream.tags?.rotate
  return tag != null && Number.isFinite(Number(tag)) ? Number(tag) : 0
}

function humanDuration(ms) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`
  const m = Math.round(s / 60)
  return `${m} minute${m === 1 ? '' : 's'}`
}

function analyseProbe(json, ext, limits) {
  if (!json || typeof json !== 'object' || !json.format) return unreadable()

  const formats = String(json.format.format_name || '').split(',').map(s => s.trim())
  if (!formats.some(f => (FORMAT_NAMES[ext] || []).includes(f))) return unreadable()

  const streams = Array.isArray(json.streams) ? json.streams : []
  const video = streams.find(s => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic === 1))
  if (!video) {
    return { error: { code: 'VIDEO_NO_VIDEO_STREAM', message: 'This file has no video picture in it.', details: null } }
  }

  let durationS = Number(json.format.duration)
  if (!Number.isFinite(durationS) || durationS <= 0) durationS = Number(video.duration)
  if (!Number.isFinite(durationS) || durationS <= 0) return unreadable()
  const durationMs = Math.round(durationS * 1000)

  let width = Number(video.width)
  let height = Number(video.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return unreadable()
  if (Math.abs(rotationOf(video)) % 180 === 90) [width, height] = [height, width]

  const avg = video.avg_frame_rate && video.avg_frame_rate !== '0/0' ? parseRate(video.avg_frame_rate) : null
  const fps = avg ?? parseRate(video.r_frame_rate)

  const media = {
    durationMs,
    width,
    height,
    fps,
    hasAudio: streams.some(s => s.codec_type === 'audio'),
    videoCodec: video.codec_name || null,
  }

  if (durationMs < limits.minDurationMs) {
    return { error: { code: 'VIDEO_TOO_SHORT', message: `This video is ${humanDuration(durationMs)} long; the minimum is ${humanDuration(limits.minDurationMs)}.`, details: { durationMs, limitMs: limits.minDurationMs } } }
  }
  if (durationMs > limits.maxDurationMs) {
    return { error: { code: 'VIDEO_TOO_LONG', message: `This video is ${humanDuration(durationMs)} long; the limit is ${humanDuration(limits.maxDurationMs)}.`, details: { durationMs, limitMs: limits.maxDurationMs } } }
  }
  const short = Math.min(width, height)
  const long = Math.max(width, height)
  if (short < limits.minShortSidePx || long > limits.maxLongSidePx) {
    return { error: { code: 'VIDEO_RESOLUTION_UNSUPPORTED', message: `This video is ${width}×${height}; videos must be at least ${limits.minShortSidePx}p and at most ${limits.maxLongSidePx} pixels wide.`, details: { width, height } } }
  }

  return { media }
}

module.exports = { analyseProbe, parseRate }
