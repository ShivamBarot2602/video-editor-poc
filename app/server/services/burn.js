const fs = require('fs')
const path = require('path')
const store = require('../storage/videoStore')
const { withTempDir } = require('../lib/tempWork')
const { buildAss } = require('../lib/assBuilder')
const { burnSubtitles } = require('../lib/ffmpeg')
const { normalizeVideoExtension } = require('../lib/videoExtensions')

async function videoExists(id) {
  return store.videoExists(id)
}

async function originalExists(id) {
  return store.originalExists(id)
}

// Parsed transcription: preferred provider file, else legacy transcription.json.
// Returns null when neither exists (controller → 400). REJECTS on parse error.
async function resolveTranscription(id, provider) {
  return store.readBurnTranscription(id, provider)
}

/**
 * Build the .ass, then burn subtitles into the video, streaming progress.
 * The .ass is written (to S3 + a temp file) BEFORE the stream starts, matching
 * the original order: onStreamStart fires the SSE headers + 'start', then
 * burnSubtitles runs with onProgress. Returns the burned video URL.
 */
async function run({ id, style, transcription }, { onStreamStart, onProgress }) {
  const assContent = buildAss(transcription, style)
  await store.writeAss(id, assContent)

  return withTempDir(`burn-${id}`, async (dir) => {
    const orig = await store.downloadOriginal(id, dir)
    const ext = normalizeVideoExtension(path.extname(orig))
    const assPath = path.join(dir, 'subtitles.ass')
    fs.writeFileSync(assPath, assContent, 'utf8')
    const burnedPath = path.join(dir, `burned${ext}`)

    onStreamStart()
    await burnSubtitles(orig, assPath, burnedPath, onProgress)
    await store.uploadBurned(id, ext, burnedPath)
    return `/api/video/${id}/burned`
  })
}

module.exports = { videoExists, originalExists, resolveTranscription, run }
