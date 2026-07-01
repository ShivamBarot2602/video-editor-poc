/**
 * Registry of downloadable export formats derived from a transcription.
 *
 * To add a new subtitle/text export (e.g. VTT, ASS):
 *   1. Write a `buildX(transcription) => string` builder (see srtBuilder.js).
 *   2. Register it in SUBTITLE_FORMATS below.
 * The download endpoint, the on-transcribe write, and the on-edit regeneration
 * all iterate this registry — no route changes or client wiring needed.
 *
 * Builders are PURE (transcription → string). Persistence (S3) lives in
 * storage/videoStore.js, which stores each as `transcription_<provider>.<ext>`.
 */

const { buildSrt } = require('./srtBuilder')

const SUBTITLE_FORMATS = {
  srt: {
    label: 'SubRip',
    ext: 'srt',
    contentType: 'application/x-subrip; charset=utf-8',
    build: buildSrt,
  },
  // Future formats slot in here, e.g.:
  // vtt: { label: 'WebVTT', ext: 'vtt', contentType: 'text/vtt; charset=utf-8', build: buildVtt },
}

function getFormat(id) {
  return SUBTITLE_FORMATS[String(id || '').toLowerCase()] || null
}

function listFormatIds() {
  return Object.keys(SUBTITLE_FORMATS)
}

// Filename (relative to a video) for a provider's export in a given format.
function fileName(provider, formatId) {
  const fmt = getFormat(formatId)
  return fmt ? `transcription_${provider}.${fmt.ext}` : null
}

// Build a single format → { fileName, ext, contentType, content }, or null if
// the format id is unknown.
function buildFormat(provider, formatId, transcription) {
  const fmt = getFormat(formatId)
  if (!fmt) return null
  return {
    fileName: `transcription_${provider}.${fmt.ext}`,
    ext: fmt.ext,
    contentType: fmt.contentType,
    content: fmt.build(transcription),
  }
}

// Build every registered format for a provider. Skips (and logs) any builder
// that throws, mirroring the previous best-effort writeAll behaviour.
function buildAll(provider, transcription) {
  const out = []
  for (const id of listFormatIds()) {
    try {
      out.push(buildFormat(provider, id, transcription))
    } catch (err) {
      console.error(`[${provider}] ${id} generation failed:`, err.message)
    }
  }
  return out
}

module.exports = { SUBTITLE_FORMATS, getFormat, listFormatIds, fileName, buildFormat, buildAll }
