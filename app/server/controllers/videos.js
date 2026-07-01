const videosService = require('../services/videos')

async function list(_req, res) {
  try {
    res.json(await videosService.listVideos())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { list }
