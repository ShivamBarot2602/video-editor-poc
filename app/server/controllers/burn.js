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

  // Open the SSE stream immediately — the S3 download of the original (before
  // ffmpeg even starts) can take minutes for large videos, and holding the
  // headers back until it finishes leaves the client staring at a dead request.
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  sendEvent({ type: 'start' })

  // SSE comment lines keep proxies (Vercel rewrite, Render) from dropping the
  // connection as idle during phases that emit no progress events.
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n') } catch (_) { /* stream closed */ }
  }, 15000)

  try {
    const burnedUrl = await burnService.run(
      { id, style, transcription },
      {
        onPhase: (phase) => sendEvent({ type: 'phase', phase }),
        onProgress: (progress) => sendEvent({ type: 'progress', percent: progress }),
      }
    )

    sendEvent({ type: 'done', burnedUrl })
    res.end()
  } catch (err) {
    console.error(`[${id}] Burn error:`, err.message)
    try {
      sendEvent({ type: 'error', message: err.message })
      res.end()
    } catch (_) {
      // response may already be closed
    }
  } finally {
    clearInterval(heartbeat)
  }
}

module.exports = { burn }
