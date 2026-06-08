const express = require('express')
const path = require('path')
const fs = require('fs')
const { extractAudio } = require('../lib/ffmpeg')
const { writeAll } = require('../lib/subtitleFormats')
const providers = require('../providers')

const router = express.Router()

router.post('/:id', async (req, res) => {
  const { id } = req.params
  const { provider = 'assemblyai', language, skipExtract = false } = req.body

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
    // Skip extraction when the caller already ran /api/prepare (parallel runs),
    // otherwise extract fresh (single-provider calls from the editor).
    if (skipExtract && fs.existsSync(audioPath)) {
      console.log(`[${id}][${provider}] Skipping audio extraction (prepared)`)
    } else {
      console.log(`[${id}][${provider}] Extracting audio…`)
      await extractAudio(originalPath, audioPath)
    }

    // Run transcription
    console.log(`[${id}][${provider}] Running provider…`)
    const result = await providerFn({ audioPath, videoDir, language, videoId: id })

    // Separate raw API response (for debugging) from the normalized result
    const { _raw, ...normalizedResult } = result

    // Preserve speaker aliases if a previous transcription exists
    let preservedAliases = null
    if (fs.existsSync(transcriptionPath)) {
      try {
        const prev = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'))
        const prevAliases = prev?.metadata?.speaker_aliases
        if (prevAliases && typeof prevAliases === 'object' && !Array.isArray(prevAliases)) {
          preservedAliases = prevAliases
        }
      } catch (_) {
        // ignore parse errors
      }
    }

    if (preservedAliases) {
      normalizedResult.metadata = {
        ...(normalizedResult.metadata || {}),
        speaker_aliases: preservedAliases,
      }
    }

    if (_raw !== undefined) {
      const rawPath = path.join(videoDir, `raw_${provider}.json`)
      fs.writeFileSync(rawPath, JSON.stringify(_raw, null, 2), 'utf8')
      console.log(`[${id}] Raw response saved → raw_${provider}.json`)
    }

    fs.writeFileSync(transcriptionPath, JSON.stringify(normalizedResult, null, 2), 'utf8')
    console.log(`[${id}][${provider}] Transcription saved`)

    // Persist all registered export formats (e.g. .srt) next to the JSON.
    writeAll(videoDir, provider, normalizedResult)
    console.log(`[${id}][${provider}] Export formats saved`)

    res.json(normalizedResult)
  } catch (err) {
    console.error(`[${id}][${provider}] Transcription error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
