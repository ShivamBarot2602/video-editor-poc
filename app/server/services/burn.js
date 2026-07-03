const fs = require('fs')
const path = require('path')
const store = require('../storage/videoStore')
const { withTempDir } = require('../lib/tempWork')
const { buildAss } = require('../lib/assBuilder')
const { burnSubtitles } = require('../lib/ffmpeg')

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
 * The caller opens the SSE stream before calling this; phase transitions are
 * reported via onPhase so the client isn't left staring at 0% during the
 * S3 download (large originals take minutes) or the final upload.
 * Returns the burned video URL.
 */
async function run({ id, style, transcription }, { onPhase, onProgress }) {
  const assContent = buildAss(transcription, style)
  await store.writeAss(id, assContent)

  // Each phase gets its own 0–100 progress; the client keys the bar off the
  // phase event that precedes it. Phase transitions are logged server-side so
  // a stalled burn can be located in the logs without client access.
  const phase = (name) => {
    console.log(`[${id}] burn: ${name}`)
    onPhase(name)
  }

  // Output container follows the user's chosen format (mp4|webm), NOT the source
  // extension — the burn always re-encodes (ass filter), so we pick the target.
  const format = style?.outputFormat === 'webm' ? 'webm' : 'mp4'

  return withTempDir(`burn-${id}`, async (dir) => {
    phase('preparing') // pulling the original from S3
    const orig = await store.downloadOriginal(id, dir, onProgress)
    const ext = format === 'webm' ? '.webm' : '.mp4'
    const assPath = path.join(dir, 'subtitles.ass')
    fs.writeFileSync(assPath, assContent, 'utf8')
    const burnedPath = path.join(dir, `burned${ext}`)

    phase('burning')
    await burnSubtitles(orig, assPath, burnedPath, onProgress, { format, quality: style?.quality })

    phase('uploading') // pushing burned file back to S3
    await store.uploadBurned(id, ext, burnedPath, onProgress)
    console.log(`[${id}] burn: done`)
    return `/api/video/${id}/burned`
  })
}

module.exports = { videoExists, originalExists, resolveTranscription, run }
