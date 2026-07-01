/**
 * xAI provider — Grok STT
 * Uses REST API:
 *   POST https://api.x.ai/v1/stt
 *
 * Single synchronous call — no polling required.
 * Params per docs:
 * - diarize: true (speaker labels per word)
 * - language: BCP-47 code when provided, else auto-detect
 *
 * Supports: speaker diarization, word timestamps, 25 languages, 500 MB limit
 * Word field in API response is `text` (mapped to `word` in normalised output)
 */
const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const { getFileSizeMB } = require('../lib/ffmpeg')
const { buildMetadata, formatTranscript, normalizeSpeaker } = require('./utils')

const PROVIDER = 'xai'
const MODEL    = 'grok-stt'
const BASE_URL = 'https://api.x.ai'
const LIMIT_MB = 500

module.exports = async function run({ audioPath, audioUrl, language }) {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) throw new Error('XAI_API_KEY is not set')

  // file must be the last field in the multipart form (per xAI docs)
  const form = new FormData()
  form.append('diarize', 'true')
  if (language) form.append('language', language)

  if (audioUrl) {
    form.append('url', audioUrl)
    console.log(`  [xai] Transcribing via URL with ${MODEL} (no upload)…`)
  } else {
    const sizeMB = getFileSizeMB(audioPath)
    if (sizeMB > LIMIT_MB) {
      throw new Error(
        `Audio is ${sizeMB.toFixed(1)} MB — xAI has a ${LIMIT_MB} MB limit. ` +
        `Use AssemblyAI or Deepgram for longer videos.`
      )
    }
    form.append('file', fs.createReadStream(audioPath), { filename: 'audio.wav' })
    console.log(`  [xai] Transcribing ${sizeMB.toFixed(1)} MB with ${MODEL}…`)
  }

  let response
  try {
    const res = await axios.post(`${BASE_URL}/v1/stt`, form, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
    response = res.data
  } catch (err) {
    console.error('xAI API error:', err.response?.data)
    const data = err.response?.data
    const msg = data?.error?.message || data?.message || data?.error || err.message
    throw new Error(`xAI transcription failed: ${msg}`)
  }

  // Normalise word list — API field is `text`, we use `word` internally
  const rawWords = Array.isArray(response.words) ? response.words : []
  const words = rawWords
    .map(w => ({
      speaker: normalizeSpeaker(w.speaker ?? null),
      word:    String(w.text || '').trim(),
      start:   Number(w.start ?? 0),
      end:     Number(w.end   ?? 0),
    }))
    .filter(w => w.word && Number.isFinite(w.start) && Number.isFinite(w.end))
    .sort((a, b) => a.start - b.start)

  let segments = buildSegments(words)

  // Fallback: single segment from top-level text if words produced nothing
  if (segments.length === 0 && response.text?.trim()) {
    segments = [{
      speaker: 'SPEAKER_00',
      start:   0,
      end:     response.duration ?? 0,
      text:    response.text.trim(),
      words:   [],
    }]
  }

  if (segments.length === 0) {
    throw new Error('xAI returned no transcription segments')
  }

  const speakers = [...new Set(segments.map(s => s.speaker))].sort()

  return {
    metadata: buildMetadata({
      provider:         PROVIDER,
      model:            MODEL,
      detectedLanguage: response.language || language || 'unknown',
      durationS:        response.duration ?? null,
      confidence:       null,
      speakers,
      segmentCount:     segments.length,
      wordTimestamps:   words.length > 0,
    }),
    segments,
    full_transcript: response.text || formatTranscript(segments),
    _raw: response,
  }
}

/**
 * Group normalised words into speaker-attributed segments.
 * Splits on speaker change or silence gap > 1.5 s.
 */
function buildSegments(words) {
  const segments = []
  let current = null

  for (const w of words) {
    const isNewSegment = !current
      || current.speaker !== w.speaker
      || w.start - current.end > 1.5

    if (isNewSegment) {
      if (current) segments.push({ ...current, text: current.text.trim() })
      current = {
        speaker: w.speaker,
        start:   w.start,
        end:     w.end,
        text:    w.word,
        words:   [{ word: w.word, start: w.start, end: w.end }],
      }
    } else {
      current.end = w.end
      current.text += ' ' + w.word
      current.words.push({ word: w.word, start: w.start, end: w.end })
    }
  }

  if (current) segments.push({ ...current, text: current.text.trim() })
  return segments
}
