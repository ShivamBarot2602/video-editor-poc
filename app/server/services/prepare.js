const path = require('path')
const store = require('../storage/videoStore')
const { withTempDir } = require('../lib/tempWork')
const { extractAudio } = require('../lib/ffmpeg')

async function videoExists(id) {
  return store.videoExists(id)
}

async function originalExists(id) {
  return store.originalExists(id)
}

// True if audio.wav has already been extracted (idempotency check).
async function audioReady(id) {
  return store.audioExists(id)
}

// Download original → extract audio.wav → upload. Throws on failure (→ 500).
async function extract(id) {
  console.log(`[${id}] Preparing audio (extracting once for parallel run)…`)
  await withTempDir(`prep-${id}`, async (dir) => {
    const orig = await store.downloadOriginal(id, dir)
    const audioOut = path.join(dir, 'audio.wav')
    await extractAudio(orig, audioOut)
    await store.uploadAudio(id, audioOut)
  })
  console.log(`[${id}] Audio prepared → audio.wav`)
}

module.exports = { videoExists, originalExists, audioReady, extract }
