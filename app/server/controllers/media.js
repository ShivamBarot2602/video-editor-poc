const mediaService = require('../services/media')
const { SAFE_TOKEN } = require('../config/constants')

// GET /api/video/:id — serve the original video file
function serveOriginal(req, res) {
  const { id } = req.params
  if (!mediaService.videoExists(id)) return res.status(404).json({ error: 'Video not found' })
  const filePath = mediaService.originalPath(id)
  if (!filePath) return res.status(404).json({ error: 'Original file missing' })
  res.sendFile(filePath)
}

// GET /api/video/:id/burned — serve the burned video file
function serveBurned(req, res) {
  const { id } = req.params
  if (!mediaService.videoExists(id)) return res.status(404).json({ error: 'Video not found' })
  const filePath = mediaService.burnedPath(id)
  if (!filePath) return res.status(404).json({ error: 'Burned video not ready' })
  res.sendFile(filePath)
}

// GET /api/video/:id/clip/:clipId — serve an exported clip file
function serveClip(req, res) {
  const { clipId } = req.params
  if (!SAFE_TOKEN.test(clipId)) return res.status(400).json({ error: 'Invalid clip id' })
  const filePath = mediaService.clipPath(req.params.id, clipId)
  if (!filePath) return res.status(404).json({ error: 'Clip not exported yet' })
  res.sendFile(filePath)
}

// GET /api/video/:id/thumbnail — serve or generate the list/grid thumbnail
async function thumbnail(req, res) {
  try {
    const { id } = req.params
    if (!mediaService.videoExists(id)) return res.status(404).json({ error: 'Video not found' })
    if (!mediaService.originalPath(id)) return res.status(404).json({ error: 'Original file missing' })

    const thumbPath = await mediaService.getOrCreateThumbnail(id)
    res.sendFile(thumbPath)
  } catch (err) {
    console.error('Thumbnail generation error:', err)
    res.status(500).json({ error: 'Failed to generate thumbnail' })
  }
}

module.exports = { serveOriginal, serveBurned, serveClip, thumbnail }
