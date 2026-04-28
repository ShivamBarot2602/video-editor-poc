const express = require('express')
const path = require('path')
const fs = require('fs')
const { extractAudio } = require('../lib/ffmpeg')
const providers = require('../providers')

const router = express.Router()

router.post('/:id', async (req, res) => {
  const { id } = req.params
  const { provider = 'assemblyai', language } = req.body

  const videoDir = path.join(req.videosDir, id)
  if (!fs.existsSync(videoDir)) {
    return res.status(404).json({ error: 'Video not found' })
  }

  // Find the original file
  const files = fs.readdirSync(videoDir)
  const originalFile = files.find(f => f.startsWith('original.'))
  if (!originalFile) {
    return res.status(404).json({ error: 'Original video file missing' })
  }

  const providerFn = providers[provider]
  if (!providerFn) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` })
  }

  const originalPath = path.join(videoDir, originalFile)
  const audioPath = path.join(videoDir, 'audio.wav')
  const transcriptionPath = path.join(videoDir, `transcription_${provider}.json`)

  try {
    // Extract audio (always re-extract so the wav is fresh)
    console.log(`[${id}] Extracting audio…`)
    await extractAudio(originalPath, audioPath)

    // Run transcription
    console.log(`[${id}] Running provider: ${provider}`)
    const result = await providerFn({ audioPath, videoDir, language, videoId: id })

    // Persist result
    fs.writeFileSync(transcriptionPath, JSON.stringify(result, null, 2), 'utf8')

    console.log(`[${id}] Transcription saved`)
    res.json(result)
  } catch (err) {
    console.error(`[${id}] Transcription error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
