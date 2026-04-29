/**
 * Mistral Voxtral provider — voxtral-mini-latest
 * Supports: speaker diarization, word timestamps, 13 languages, auto-detect
 * Limits: ~30 min per request; no explicit file size limit documented
 *
 * API Compatibility Rules:
 * - language: Optional string. When omitted, auto-detects. When provided, disables word timestamps.
 * - timestamp_granularities: Only available when language is NOT specified. Values: ["word", "segment"]
 * - diarize: Optional boolean/string. Always available, returns speaker labels in segments.
 *
 * Behavior:
 * - With language: diarization only, no word-level timestamps
 * - Without language: diarization + word timestamps (auto-detects language)
 */
const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const { buildMetadata, formatTranscript, normalizeSpeaker } = require('./utils')

const PROVIDER = 'mistral'
const MODEL    = 'voxtral-mini-latest'
const BASE_URL = 'https://api.mistral.ai'

module.exports = async function run({ audioPath, language }) {
  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not set')

  const wantWordTimestamps = !language
  const wantDiarize = true
  const allowWordTimestamps = wantWordTimestamps && !wantDiarize

  const form = new FormData()
  form.append('model', MODEL)
  form.append('file', fs.createReadStream(audioPath), { filename: 'audio.wav' })
  form.append('diarize', String(wantDiarize))

  if (language) {
    form.append('language', language)
  }

  if (wantDiarize) {
    form.append('timestamp_granularities[]', 'segment')
  } else if (allowWordTimestamps) {
    // Word-level timestamps only available when language is auto-detected
    form.append('timestamp_granularities[]', 'word')
  } else if (!language) {
    form.append('timestamp_granularities[]', 'segment')
  }

  let response
  try {
    const res = await axios.post(`${BASE_URL}/v1/audio/transcriptions`, form, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
    response = res.data
  } catch (err) {
    console.dir({err:err.response?.data || err.message}, {depth:null})
    const msg = err.response?.data?.message || err.response?.data?.error || err.message
    throw new Error(`Mistral transcription failed: ${msg}`)
  }

  const rawSegments = response.segments || []
  const detectedLanguage = response.language || language || 'unknown'

  const segments = rawSegments.map(seg => {
    // Mistral diarization label currently arrives as `speaker_id` (e.g. "speaker_1").
    // Normalize to our cross-provider format: SPEAKER_00, SPEAKER_01, ...
    const speaker = normalizeSpeaker(
      seg.speaker ?? seg.speaker_id ?? seg.speakerId ?? seg.speakerID
    )

    const words = allowWordTimestamps
      ? (seg.words || []).map(w => ({
          word:  w.word  ?? w.text ?? '',
          start: w.start ?? 0,
          end:   w.end   ?? 0,
        }))
      : []

    return {
      speaker,
      start: seg.start ?? 0,
      end:   seg.end   ?? 0,
      text:  (seg.text || '').trim(),
      words,
    }
  })

  // Fallback: if the API returned a flat transcript with no segments, wrap it
  if (segments.length === 0 && response.text) {
    segments.push({
      speaker: 'SPEAKER_00',
      start: 0,
      end: response.usage?.prompt_audio_seconds ?? 0,
      text: response.text.trim(),
      words: [],
    })
  }

  const speakers = [...new Set(segments.map(s => s.speaker))].sort()

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage,
      durationS: response.usage?.prompt_audio_seconds ?? null,
      confidence: null,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: allowWordTimestamps && segments.some(s => s.words.length > 0),
    }),
    segments,
    full_transcript: formatTranscript(segments),
    _raw: response,
  }
}
