/**
 * ElevenLabs provider — Scribe v2
 * Uses official REST API:
 *   POST /v1/speech-to-text
 *
 * Single synchronous call — no polling required.
 * Params per docs:
 * - diarize: true (speaker labels per word)
 * - timestamps_granularity: "word"
 * - language_code: ISO-639-1/3 code when provided, else auto-detect
 */
const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const { buildMetadata, formatTranscript, normalizeSpeaker } = require('./utils')

const PROVIDER = 'elevenlabs'
const MODEL = 'scribe_v2'
const BASE_URL = 'https://api.elevenlabs.io/v1'

module.exports = async function run({ audioPath, audioUrl, language }) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')

  const form = new FormData()
  form.append('model_id', MODEL)
  // source_url (current field, replaces deprecated cloud_storage_url) fetches
  // audio.wav from S3 directly — no upload. Falls back to a file part otherwise.
  if (audioUrl) form.append('source_url', audioUrl)
  else form.append('file', fs.createReadStream(audioPath), { filename: 'audio.wav' })
  form.append('diarize', 'true')
  form.append('timestamps_granularity', 'word')
  if (language) form.append('language_code', language)

  console.log(audioUrl ? `  [elevenlabs] Transcribing via source_url with ${MODEL} (no upload)…` : `  [elevenlabs] Transcribing with ${MODEL}…`)

  let response
  try {
    const res = await axios.post(`${BASE_URL}/speech-to-text`, form, {
      headers: {
        'xi-api-key': apiKey,
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
    response = res.data
  } catch (err) {
    const data = err.response?.data
    const msg = data?.detail?.message || data?.detail || data?.message || err.message
    throw new Error(`ElevenLabs transcription failed: ${msg}`)
  }

  // Filter to only 'word' type items — skip 'spacing' and 'audio_event'
  // Actual field names from API: text, speaker_id, logprob, start/end in seconds
  const rawWords = Array.isArray(response.words) ? response.words : []
  const words = rawWords
    .filter(w => w.type === 'word')
    .map(w => ({
      speaker: normalizeSpeaker(w.speaker_id),
      word: String(w.text || '').trim(),
      start: Number(w.start ?? 0),
      end: Number(w.end ?? 0),
      // logprob ≤ 0 → linear probability via exp()
      confidence: typeof w.logprob === 'number' ? Math.exp(w.logprob) : null,
    }))
    .filter(w => w.word && Number.isFinite(w.start) && Number.isFinite(w.end))
    .sort((a, b) => a.start - b.start)

  // Build speaker-attributed segments from word groups
  let segments = buildSegments(words)

  // Fallback: single segment from top-level text if words produced nothing
  if (segments.length === 0 && response.text?.trim()) {
    segments = [{
      speaker: 'SPEAKER_00',
      start: 0,
      end: response.audio_duration_secs ?? 0,
      text: response.text.trim(),
      words: [],
    }]
  }

  if (segments.length === 0) {
    throw new Error('ElevenLabs returned no transcription segments')
  }

  const speakers = [...new Set(segments.map(s => s.speaker))].sort()
  const durationS = segments[segments.length - 1]?.end ?? null

  const wordConfidences = words.map(w => w.confidence).filter(v => v !== null)
  const confidence = wordConfidences.length > 0
    ? wordConfidences.reduce((sum, v) => sum + v, 0) / wordConfidences.length
    : null

  const detectedLanguage = response.language_code || language || 'unknown'

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage,
      durationS: response.audio_duration_secs ?? durationS,
      confidence: confidence != null ? Math.round(confidence * 10000) / 10000 : null,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: words.length > 0,
    }),
    segments,
    full_transcript: response.text || formatTranscript(segments),
    _raw: response,
  }
}

function buildSegments(words) {
  const segments = []
  let current = null

  for (const w of words) {
    const isNewSegment = !current
      || current.speaker !== w.speaker
      || w.start - current.end > 1.5

    if (isNewSegment) {
      if (current) segments.push(current)
      current = {
        speaker: w.speaker,
        start: w.start,
        end: w.end,
        text: w.word,
        words: [{ word: w.word, start: w.start, end: w.end }],
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
