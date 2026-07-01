const videosService = require('../services/videos')

async function list(_req, res) {
  try {
    res.json(await videosService.listVideos())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/videos/:id — single video's card metadata (avoids fetching the
// whole list just to find one entry, e.g. from EditorPage).
async function get(req, res) {
  try {
    const video = await videosService.getVideo(req.params.id)
    if (!video) return res.status(404).json({ error: 'Video not found' })
    res.json(video)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { list, get }
