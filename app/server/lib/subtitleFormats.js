/**
 * Registry of downloadable export formats derived from a transcription.
 *
 * To add a new subtitle/text export (e.g. VTT, ASS):
 *   1. Write a `buildX(transcription) => string` builder (see srtBuilder.js).
 *   2. Register it in SUBTITLE_FORMATS below.
 * The download endpoint, the on-transcribe write, and the on-edit regeneration
 * all iterate this registry — no route changes or client wiring needed.
 *
 * Files are persisted next to the transcription JSON as
 * `transcription_<provider>.<ext>`.
 */

const fs = require('fs')
const path = require('path')
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
  // ass: { label: 'Advanced SubStation', ext: 'ass', contentType: 'text/x-ssa; charset=utf-8', build: buildAssPlain },
}

function getFormat(id) {
  return SUBTITLE_FORMATS[String(id || '').toLowerCase()] || null
}

function listFormatIds() {
  return Object.keys(SUBTITLE_FORMATS)
}

function pathFor(videoDir, provider, formatId) {
  const fmt = getFormat(formatId)
  if (!fmt) return null
  return path.join(videoDir, `transcription_${provider}.${fmt.ext}`)
}

// Build + persist a single format. Returns the file path, or null if unknown.
function writeFormat(videoDir, provider, formatId, transcription) {
  const fmt = getFormat(formatId)
  if (!fmt) return null
  const filePath = pathFor(videoDir, provider, formatId)
  fs.writeFileSync(filePath, fmt.build(transcription), 'utf8')
  return filePath
}

// Regenerate every registered format for a provider (after transcribe / edit).
function writeAll(videoDir, provider, transcription) {
  for (const id of listFormatIds()) {
    try {
      writeFormat(videoDir, provider, id, transcription)
    } catch (err) {
      console.error(`[${provider}] ${id} generation failed:`, err.message)
    }
  }
}

module.exports = { SUBTITLE_FORMATS, getFormat, listFormatIds, pathFor, writeFormat, writeAll }
