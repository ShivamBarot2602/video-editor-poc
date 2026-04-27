const express = require('express')
const path = require('path')
const fs = require('fs')
const { buildAss } = require('../lib/assBuilder')
const { burnSubtitles } = require('../lib/ffmpeg')

const router = express.Router()

router.post('/:id', async (req, res) => {
  const { id } = req.params
  const { style, provider } = req.body

  if (!style) return res.status(400).json({ error: 'style payload required' })

  const videoDir = path.join(req.videosDir, id)
  if (!fs.existsSync(videoDir)) return res.status(404).json({ error: 'Video not found' })

  const files = fs.readdirSync(videoDir)
  const originalFile = files.find(f => f.startsWith('original.'))

  if (!originalFile) return res.status(404).json({ error: 'Original video missing' })

  // Prefer provider-specific file; fall back to legacy transcription.json
  const providerFile = provider ? path.join(videoDir, `transcription_${provider}.json`) : null
  const legacyFile = path.join(videoDir, 'transcription.json')
  const transcriptionFile = (providerFile && fs.existsSync(providerFile))
    ? providerFile
    : fs.existsSync(legacyFile) ? legacyFile : null

  if (!transcriptionFile) {
    return res.status(400).json({ error: 'Run transcription first' })
  }

  const originalPath = path.join(videoDir, originalFile)
  const ext = path.extname(originalFile)
  const burnedPath = path.join(videoDir, `burned${ext}`)
  const assPath = path.join(videoDir, 'subtitles.ass')

  const transcription = JSON.parse(fs.readFileSync(transcriptionFile, 'utf8'))

  try {
    // Generate .ass file
    const assContent = buildAss(transcription, style)
    fs.writeFileSync(assPath, assContent, 'utf8')

    // Set up SSE so the client can receive progress
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

    sendEvent({ type: 'start' })

    await burnSubtitles(originalPath, assPath, burnedPath, (progress) => {
      sendEvent({ type: 'progress', percent: progress })
    })

    sendEvent({ type: 'done', burnedUrl: `/api/video/${id}/burned` })
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
})

module.exports = router
