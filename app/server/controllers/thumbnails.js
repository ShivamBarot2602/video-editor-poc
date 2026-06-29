const thumbnailService = require('../services/thumbnails')

// In-flight pipeline runs keyed by videoId. EventSource auto-reconnects ~3s
// after a stream close — without this guard, a transient disconnect would
// silently fire another full Gemini + image-gen run (~$0.25/run wasted).
// Lives here because it is tied to the SSE connection lifecycle.
const inFlightRuns = new Set()

// GET /api/thumbnails/:videoId
function get(req, res) {
  const state = thumbnailService.getState(req.params.videoId)
  if (!state) return res.status(404).json({ error: 'No thumbnails generated yet' })
  res.json(state)
}

// PATCH /api/thumbnails/:videoId  { selectedKey }
function patch(req, res) {
  const { videoId } = req.params
  const state = thumbnailService.getState(videoId)
  if (!state) return res.status(404).json({ error: 'No thumbnails generated yet' })

  const { selectedKey } = req.body || {}
  if (selectedKey !== null && typeof selectedKey !== 'string') {
    return res.status(400).json({ error: 'selectedKey must be string or null' })
  }
  const prev = state.selectedKey
  const updated = thumbnailService.setSelectedKey(videoId, state, selectedKey)
  console.log(`[${videoId}][thumbnails] selectedKey: ${prev ?? 'null'} → ${updated.selectedKey ?? 'null'}`)
  res.json(updated)
}

// GET /api/thumbnails/:videoId/file/:relpath — traversal-guarded file serve
function serveFile(req, res) {
  try {
    const target = thumbnailService.resolveFile(req.params.videoId, req.params.relpath)
    res.sendFile(target)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
}

// GET /api/thumbnails/:videoId/stream — SSE pipeline
async function stream(req, res) {
  const { videoId } = req.params
  const origPath = thumbnailService.originalPath(videoId)
  if (!origPath) return res.status(404).json({ error: 'Original video missing' })

  const tag = `[${videoId}][thumbnails]`
  const runStart = Date.now()

  // Reject re-entry while a pipeline is already in-flight for this video.
  if (inFlightRuns.has(videoId)) {
    console.warn(`${tag} stream rejected: pipeline already in-flight for this videoId`)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Pipeline already running for this video. Wait for it to finish or refresh the page.' })}\n\n`)
    res.end()
    return
  }
  inFlightRuns.add(videoId)
  const releaseInFlight = () => inFlightRuns.delete(videoId)

  // ─── SSE setup ─────────────────────────────────────────────────────────────
  // Counter-measures against proxy/Nagle buffering on long pipelines:
  //   X-Accel-Buffering: no, Cache-Control: no-transform, setNoDelay, heartbeat,
  //   and a 2KB pad so the browser's first-chunk buffer overflows immediately.
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  try { res.socket?.setNoDelay?.(true) } catch (_) { /* not all transports */ }

  res.write(`: ${'_'.repeat(2048)}\n\n`)

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const heartbeat = setInterval(() => {
    try { res.write(`: hb ${Date.now()}\n\n`) } catch (_) { clearInterval(heartbeat) }
  }, 10000)
  const stopHeartbeat = () => clearInterval(heartbeat)
  // Release the in-flight slot on ANY disconnect path.
  const cleanup = () => {
    stopHeartbeat()
    releaseInFlight()
  }
  req.on('close', cleanup)
  res.on('close', cleanup)

  try {
    await thumbnailService.runPipeline({ videoId, origPath, reranker: req.query.reranker, runStart }, sendEvent)
    cleanup()
    res.end()
  } catch (err) {
    console.error(`${tag} Pipeline error after ${Date.now() - runStart}ms:`, err)
    try {
      sendEvent({ type: 'error', message: err.message })
    } catch (_) { /* connection already closed */ }
    cleanup()
    try { res.end() } catch (_) { /* already ended */ }
  }
}

module.exports = { get, patch, serveFile, stream }
