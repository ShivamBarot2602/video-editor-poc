const transcribeService = require('../services/transcribe')

// POST /api/transcribe/:id  { provider, language, skipExtract }
async function run(req, res) {
  const { id } = req.params
  const { provider = 'assemblyai', language, skipExtract = false } = req.body

  if (!await transcribeService.videoExists(id)) {
    return res.status(404).json({ error: 'Video not found' })
  }
  if (!await transcribeService.originalExists(id)) {
    return res.status(404).json({ error: 'Original video file missing' })
  }
  if (!transcribeService.providerExists(provider)) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` })
  }

  try {
    const result = await transcribeService.run({ id, provider, language, skipExtract })
    res.json(result)
  } catch (err) {
    console.error(`[${id}][${provider}] Transcription error:`, err.message)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { run }
