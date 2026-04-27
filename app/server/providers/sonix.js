/**
 * Sonix provider — REST API
 * Supports: speaker diarization (up to 30 speakers), word timestamps, 53 languages
 * Pricing: $10/hr pay-as-you-go
 *
 * NOTE: Sonix API endpoints verified from https://sonix.ai/docs/api
 * Auth: Authorization: Bearer {api_key}
 */
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const axios = require('axios')
const { buildMetadata, formatTranscript } = require('./utils')

const PROVIDER = 'sonix'
const MODEL = 'Sonix AI'
const BASE_URL = 'https://api.sonix.ai/v1'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 30 * 60 * 1000 // 30 min

function makeHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` }
}

async function pollUntilDone(apiKey, mediaId) {
  const start = Date.now()
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    const { data } = await axios.get(`${BASE_URL}/media/${mediaId}`, {
      headers: makeHeaders(apiKey),
    })
    console.log(`  [sonix] Status: ${data.status}`)
    if (data.status === 'completed') return data
    if (data.status === 'failed') throw new Error(`Sonix transcription failed: ${data.error || 'unknown error'}`)
  }
  throw new Error('Sonix transcription timed out after 30 minutes')
}

module.exports = async function run({ audioPath, language }) {
  const apiKey = process.env.SONIX_API_KEY
  if (!apiKey) throw new Error('SONIX_API_KEY is not set')

  // Language is required by Sonix API; default to English if not provided
  const languageCode = language || 'en'

  // Upload file
  console.log(`  [sonix] Uploading file…`)
  const form = new FormData()
  form.append('file', fs.createReadStream(audioPath), {
    filename: path.basename(audioPath),
    contentType: 'audio/wav',
  })
  
  form.append('language', languageCode)

  const uploadRes = await axios.post(`${BASE_URL}/media`, form, {
    headers: { ...makeHeaders(apiKey), ...form.getHeaders() },
  })

  const mediaId = uploadRes.data.id
  console.log(`  [sonix] File uploaded. ID: ${mediaId}. Polling for completion…`)

  await pollUntilDone(apiKey, mediaId)

  // Fetch transcription
  const { data: transcriptData } = await axios.get(
    `${BASE_URL}/media/${mediaId}/transcript.json`,
    { headers: makeHeaders(apiKey) }
  )

  // Normalize Sonix output
  // Sonix returns { transcript: [{ speaker, start_time, end_time, words: [{ text, start_time, end_time }] }] }
  const segments = []
  const transcript = transcriptData.transcript || []

  for (const segment of transcript) {
    const words = (segment.words || []).map(w => ({
      word: w.text,
      start: w.start_time,
      end: w.end_time,
    }))

    if (words.length === 0) continue

    segments.push({
      speaker: segment.speaker || 'SPEAKER_00',
      start: segment.start_time,
      end: segment.end_time,
      text: words.map(w => w.word).join(' '),
      words,
    })
  }

  const speakers = [...new Set(segments.map(s => s.speaker))].sort()

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage: languageCode,
      durationS: null,
      confidence: null,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: true,
    }),
    segments,
    full_transcript: formatTranscript(segments),
  }
}
