const mediaService = require('../services/media')
const { SAFE_TOKEN } = require('../config/constants')

// All media is stored in S3 and delivered via a 302 redirect to a short-lived
// presigned URL — the browser range-requests S3 directly (native scrubbing),
// the server never proxies the bytes.

// GET /api/video/:id — redirect to the original video
async function serveOriginal(req, res) {
  const { id } = req.params
  if (!await mediaService.videoExists(id)) return res.status(404).json({ error: 'Video not found' })
  const url = await mediaService.originalUrl(id)
  if (!url) return res.status(404).json({ error: 'Original file missing' })
  res.redirect(302, url)
}

// GET /api/video/:id/burned — redirect to the burned video
async function serveBurned(req, res) {
  const { id } = req.params
  if (!await mediaService.videoExists(id)) return res.status(404).json({ error: 'Video not found' })
  const url = await mediaService.burnedUrl(id)
  if (!url) return res.status(404).json({ error: 'Burned video not ready' })
  res.redirect(302, url)
}

// GET /api/video/:id/clip/:clipId — redirect to an exported clip
async function serveClip(req, res) {
  const { clipId } = req.params
  if (!SAFE_TOKEN.test(clipId)) return res.status(400).json({ error: 'Invalid clip id' })
  const url = await mediaService.clipUrl(req.params.id, clipId)
  if (!url) return res.status(404).json({ error: 'Clip not exported yet' })
  res.redirect(302, url)
}

// GET /api/video/:id/thumbnail — redirect to the list/grid thumbnail (generated on miss)
async function thumbnail(req, res) {
  try {
    const { id } = req.params
    if (!await mediaService.videoExists(id)) return res.status(404).json({ error: 'Video not found' })
    if (!await mediaService.originalExists(id)) return res.status(404).json({ error: 'Original file missing' })

    const url = await mediaService.getOrCreateThumbnailUrl(id)
    res.redirect(302, url)
  } catch (err) {
    console.error('Thumbnail generation error:', err)
    res.status(500).json({ error: 'Failed to generate thumbnail' })
  }
}

module.exports = { serveOriginal, serveBurned, serveClip, thumbnail }
