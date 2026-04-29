const express = require('express')
const path = require('path')
const fs = require('fs')
const { extractAudio } = require('../lib/ffmpeg')

const router = express.Router()

/**
 * POST /api/prepare/:id
 *
 * Extracts audio from the original video file to audio.wav exactly once.
 * Subsequent calls are a no-op if audio.wav already exists, so this is safe
 * to call before firing multiple parallel transcription requests.
 *
 * Returns: { ready: true, cached: boolean }
 */
router.post('/:id', async (req, res) => {
  const { id } = req.params
  const videoDir = path.join(req.videosDir, id)

  if (!fs.existsSync(videoDir)) {
    return res.status(404).json({ error: 'Video not found' })
  }

  const files = fs.readdirSync(videoDir)
  const originalFile = files.find(f => f.startsWith('original.'))
  if (!originalFile) {
    return res.status(404).json({ error: 'Original video file missing' })
  }

  const originalPath = path.join(videoDir, originalFile)
  const audioPath = path.join(videoDir, 'audio.wav')

  // Already extracted — return immediately (idempotent)
  if (fs.existsSync(audioPath)) {
    console.log(`[${id}] Audio already prepared (cached)`)
    return res.json({ ready: true, cached: true })
  }

  try {
    console.log(`[${id}] Preparing audio (extracting once for parallel run)…`)
    await extractAudio(originalPath, audioPath)
    console.log(`[${id}] Audio prepared → audio.wav`)
    res.json({ ready: true, cached: false })
  } catch (err) {
    console.error(`[${id}] Audio preparation failed:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
