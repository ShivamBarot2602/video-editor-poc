const path = require('path')
const store = require('../storage/videoStore')
const { buildAss } = require('../lib/assBuilder')
const { burnSubtitles } = require('../lib/ffmpeg')
const { normalizeVideoExtension } = require('../lib/videoExtensions')

function videoExists(id) {
  return store.videoExists(id)
}

function originalExists(id) {
  return !!store.findOriginalPath(id)
}

// Parsed transcription preferred provider file, else legacy transcription.json.
// Returns null when neither exists (controller → 400). THROWS on parse error.
function resolveTranscription(id, provider) {
  return store.readBurnTranscription(id, provider)
}

/**
 * Build the .ass, then burn subtitles into the video, streaming progress.
 * Ordering matches the original route exactly: buildAss + write .ass happen
 * BEFORE the stream starts (onStreamStart fires the SSE headers + 'start'),
 * then burnSubtitles runs with onProgress. Returns the burned video URL.
 */
async function run({ id, style, transcription }, { onStreamStart, onProgress }) {
  const originalPath = store.findOriginalPath(id)
  const ext = normalizeVideoExtension(path.extname(store.findOriginalName(id)))
  const burnedPath = store.burnedPath(id, ext)

  const assContent = buildAss(transcription, style)
  store.writeAss(id, assContent)

  onStreamStart()
  await burnSubtitles(originalPath, store.assPath(id), burnedPath, onProgress)
  return `/api/video/${id}/burned`
}

module.exports = { videoExists, originalExists, resolveTranscription, run }
