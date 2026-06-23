const store = require('../storage/videoStore')
const { extractAudio } = require('../lib/ffmpeg')

function videoExists(id) {
  return store.videoExists(id)
}

function originalExists(id) {
  return !!store.findOriginalPath(id)
}

// True if audio.wav has already been extracted (idempotency check).
function audioReady(id) {
  return store.audioExists(id)
}

// Extract audio to audio.wav. Throws on failure (controller surfaces 500).
async function extract(id) {
  console.log(`[${id}] Preparing audio (extracting once for parallel run)…`)
  await extractAudio(store.findOriginalPath(id), store.audioPath(id))
  console.log(`[${id}] Audio prepared → audio.wav`)
}

module.exports = { videoExists, originalExists, audioReady, extract }
