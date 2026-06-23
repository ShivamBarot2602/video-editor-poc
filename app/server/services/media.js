const store = require('../storage/videoStore')
const { extractThumbnail } = require('../lib/ffmpeg')

function videoExists(id) {
  return store.videoExists(id)
}

// Absolute path to the original video, or null if none.
function originalPath(id) {
  return store.findOriginalPath(id)
}

// Absolute path to the burned video, or null if not ready.
function burnedPath(id) {
  return store.findBurnedPath(id)
}

// Absolute path to an exported clip, or null if not cut yet.
function clipPath(id, clipId) {
  return store.clipOutputExists(id, clipId) ? store.clipOutputPath(id, clipId) : null
}

// Serve-or-generate the list/grid thumbnail. Caller must have confirmed the
// original exists. Returns the thumbnail's absolute path.
async function getOrCreateThumbnail(id) {
  const thumbPath = store.thumbnailV2Path(id)
  if (store.thumbnailV2Exists(id)) return thumbPath
  await extractThumbnail(store.findOriginalPath(id), thumbPath)
  return thumbPath
}

module.exports = { videoExists, originalPath, burnedPath, clipPath, getOrCreateThumbnail }
