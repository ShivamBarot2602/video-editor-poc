const videosService = require('../services/videos')

function list(_req, res) {
  try {
    res.json(videosService.listVideos())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { list }
