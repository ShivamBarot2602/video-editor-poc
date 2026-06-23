const prepareService = require('../services/prepare')

/**
 * POST /api/prepare/:id
 *
 * Extracts audio from the original video to audio.wav exactly once. Subsequent
 * calls are a no-op if audio.wav already exists, so this is safe to call before
 * firing multiple parallel transcription requests.
 *
 * Returns: { ready: true, cached: boolean }
 */
async function prepare(req, res) {
  const { id } = req.params

  if (!prepareService.videoExists(id)) {
    return res.status(404).json({ error: 'Video not found' })
  }
  if (!prepareService.originalExists(id)) {
    return res.status(404).json({ error: 'Original video file missing' })
  }

  // Already extracted — return immediately (idempotent)
  if (prepareService.audioReady(id)) {
    console.log(`[${id}] Audio already prepared (cached)`)
    return res.json({ ready: true, cached: true })
  }

  try {
    await prepareService.extract(id)
    res.json({ ready: true, cached: false })
  } catch (err) {
    console.error(`[${id}] Audio preparation failed:`, err.message)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { prepare }
