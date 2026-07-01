const path = require('path')
const store = require('../storage/videoStore')
const { withTempDir } = require('../lib/tempWork')
const { extractThumbnail } = require('../lib/ffmpeg')

async function videoExists(id) {
  return store.videoExists(id)
}

async function originalExists(id) {
  return store.originalExists(id)
}

// Presigned GET URL for the original video, or null if none.
async function presignOriginal(id) {
  return store.presignOriginal(id)
}

// Presigned GET URL for the burned video, or null if not ready.
async function presignBurned(id) {
  return store.presignBurned(id)
}

// Presigned GET URL for an exported clip, or null if not cut yet.
async function presignClip(id, clipId) {
  return store.presignClipOutput(id, clipId)
}

// Serve-or-generate the list/grid thumbnail; returns a presigned URL. Generates
// the thumbnail (download original → first frame → upload) on a cache miss.
async function getOrCreateThumbnailUrl(id) {
  if (!(await store.thumbnailV2Exists(id))) {
    await withTempDir(`thumb-${id}`, async (dir) => {
      const orig = await store.downloadOriginal(id, dir)
      const out = path.join(dir, 'thumbnail_v2.jpg')
      await extractThumbnail(orig, out)
      await store.uploadThumbnailV2(id, out)
    })
  }
  return store.presignThumbnailV2(id)
}

module.exports = {
  videoExists, originalExists,
  presignOriginal, presignBurned, presignClip, getOrCreateThumbnailUrl,
}
