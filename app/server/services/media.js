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

// Public GET URL for the original video, or null if none.
async function originalUrl(id) {
  return store.publicUrlOriginal(id)
}

// Public GET URL for the burned video, or null if not ready.
async function burnedUrl(id) {
  return store.publicUrlBurned(id)
}

// Public GET URL for an exported clip, or null if not cut yet.
async function clipUrl(id, clipId) {
  return store.publicUrlClipOutput(id, clipId)
}

// Serve-or-generate the list/grid thumbnail; returns a public URL. Generates the
// thumbnail (download original → first frame → upload) on a cache miss.
async function getOrCreateThumbnailUrl(id) {
  if (!(await store.thumbnailV2Exists(id))) {
    await withTempDir(`thumb-${id}`, async (dir) => {
      const orig = await store.downloadOriginal(id, dir)
      const out = path.join(dir, 'thumbnail_v2.jpg')
      await extractThumbnail(orig, out)
      await store.uploadThumbnailV2(id, out)
    })
  }
  return store.publicUrlThumbnailV2(id)
}

module.exports = {
  videoExists, originalExists,
  originalUrl, burnedUrl, clipUrl, getOrCreateThumbnailUrl,
}
