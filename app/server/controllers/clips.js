const clipService = require('../services/clips')
const { SAFE_TOKEN } = require('../config/constants')

// In-flight lock for the (expensive) video-understanding run, keyed by videoId.
// Lives here because it is tied to the SSE connection lifecycle, not the logic.
const runningVideo = new Set()

const sseHeaders = (res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
}

// POST /api/clips/:id/suggest  { suggestProvider, transcriptProvider, bucket, count }
async function suggest(req, res) {
  const { id } = req.params
  const { suggestProvider, transcriptProvider, bucket = 'auto', count } = req.body || {}
  try {
    const obj = await clipService.suggest({ id, suggestProvider, transcriptProvider, bucket, count })
    res.json(obj)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error(`[${id}] clip suggest error:`, err.message)
    res.status(500).json({ error: err.message })
  }
}

// GET /api/clips/:id/saved
async function listSaved(req, res) {
  res.json(await clipService.listSaved(req.params.id))
}

// POST /api/clips/:id/saved  { clip, transcriptProvider, bucket }
async function saveClip(req, res) {
  const { id } = req.params
  const { clip, transcriptProvider, bucket } = req.body || {}
  try {
    res.json(await clipService.saveClip({ id, clip, transcriptProvider, bucket }))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error(`[${id}] save clip error:`, err.message)
    res.status(500).json({ error: err.message })
  }
}

// DELETE /api/clips/:id/saved/:savedId
async function deleteSaved(req, res) {
  const { id, savedId } = req.params
  if (!SAFE_TOKEN.test(savedId)) return res.status(400).json({ error: 'Invalid saved id' })
  try {
    res.json(await clipService.deleteSaved(id, savedId))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/clips/:id/:suggestProvider
async function getSuggestions(req, res) {
  const { id, suggestProvider } = req.params
  if (!SAFE_TOKEN.test(suggestProvider)) return res.status(400).json({ error: 'Invalid provider' })
  if (!await clipService.hasSuggestions(id, suggestProvider)) {
    return res.status(404).json({ error: 'No clips generated yet' })
  }
  try {
    res.json(await clipService.getSuggestions(id, suggestProvider))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/clips/:id/export/stream?suggestProvider=&clipId=&source=
async function exportStream(req, res) {
  const { id } = req.params
  const { suggestProvider, clipId, source } = req.query

  sseHeaders(res)
  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    await clipService.exportClip({ id, clipId, suggestProvider, source }, sendEvent)
    res.end()
  } catch (err) {
    console.error(`[${id}] clip export error:`, err.message)
    try {
      sendEvent({ type: 'error', message: err.message })
      res.end()
    } catch (_) {}
  }
}

// GET /api/clips/:id/suggest/stream?method=video&count=&bucket=&res=
async function suggestStream(req, res) {
  const { id } = req.params
  const { method, bucket = 'auto', count, model } = req.query

  sseHeaders(res)
  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  if (method !== 'video') {
    sendEvent({ type: 'error', message: 'Unsupported method for streaming suggest' })
    return res.end()
  }
  if (runningVideo.has(id)) {
    sendEvent({ type: 'error', message: 'A video analysis is already running for this video. Wait for it to finish or refresh the page.' })
    return res.end()
  }

  runningVideo.add(id)
  try {
    await clipService.suggestFromVideo({ id, bucket, count, model }, sendEvent)
    res.end()
  } catch (err) {
    console.error(`[${id}] video suggest error:`, err.message)
    try { sendEvent({ type: 'error', message: err.message }); res.end() } catch (_) {}
  } finally {
    runningVideo.delete(id)
  }
}

// GET /api/clips/:id/thumb/:clipId/:n — redirect to the clip thumbnail in S3
async function serveThumb(req, res) {
  const { id, clipId, n } = req.params
  if (!SAFE_TOKEN.test(clipId)) return res.status(400).json({ error: 'Invalid clip id' })
  const idx = parseInt(n, 10)
  if (!Number.isInteger(idx) || idx < 0 || idx > 9) return res.status(400).json({ error: 'Invalid index' })
  const url = await clipService.thumbUrl(id, clipId, idx)
  if (!url) return res.status(404).json({ error: 'Thumbnail not found' })
  res.redirect(302, url)
}

module.exports = {
  suggest, listSaved, saveClip, deleteSaved, getSuggestions,
  exportStream, suggestStream, serveThumb,
}
