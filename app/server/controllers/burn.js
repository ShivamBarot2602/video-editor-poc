const burnService = require('../services/burn')

// POST /api/burn/:id  { style, provider } — burns subtitles, streaming SSE progress.
async function burn(req, res) {
  const { id } = req.params
  const { style, provider } = req.body

  if (!style) return res.status(400).json({ error: 'style payload required' })
  if (!await burnService.videoExists(id)) return res.status(404).json({ error: 'Video not found' })
  if (!await burnService.originalExists(id)) return res.status(404).json({ error: 'Original video missing' })

  // Resolve + read the transcription up front (outside the stream try, as before)
  // so a "no transcription" case returns a clean 400 instead of an SSE error.
  let transcription
  try {
    transcription = await burnService.resolveTranscription(id, provider)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  if (transcription === null) return res.status(400).json({ error: 'Run transcription first' })

  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    const burnedUrl = await burnService.run(
      { id, style, transcription },
      {
        // Fires after the .ass is written, before burning — matches original order.
        onStreamStart: () => {
          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')
          res.flushHeaders()
          sendEvent({ type: 'start' })
        },
        onProgress: (progress) => sendEvent({ type: 'progress', percent: progress }),
      }
    )

    sendEvent({ type: 'done', burnedUrl })
    res.end()
  } catch (err) {
    console.error(`[${id}] Burn error:`, err.message)
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
      res.end()
    } catch (_) {
      // response may already be closed
    }
  }
}

module.exports = { burn }
