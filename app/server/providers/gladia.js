/**
 * Gladia provider — Solaria-1 (pre-recorded v2)
 * Uses official REST API:
 *   POST /v2/upload
 *   POST /v2/pre-recorded
 *   GET  result_url
 *
 * Params follow docs recommendations:
 * - diarization enabled
 * - language_config with explicit language when provided, else auto-detect
 * - sentences enabled for better segmentation/readability
 */
const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const { buildMetadata, formatTranscript, normalizeSpeaker } = require('./utils')

const PROVIDER = 'gladia'
const MODEL = 'solaria-1'
const BASE_URL = 'https://api.gladia.io/v2'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 20 * 60 * 1000 // 20 min

module.exports = async function run({ audioPath, language }) {
  const apiKey = process.env.GLADIA_API_KEY
  if (!apiKey) throw new Error('GLADIA_API_KEY is not set')

  const authHeaders = { 'x-gladia-key': apiKey }

  // Step 1: Upload local media file to Gladia file storage
  const uploadForm = new FormData()
  uploadForm.append('audio', fs.createReadStream(audioPath), { filename: 'audio.wav' })

  console.log('  [gladia] Uploading audio…')

  let uploaded
  try {
    const uploadRes = await axios.post(`${BASE_URL}/upload`, uploadForm, {
      headers: { ...authHeaders, ...uploadForm.getHeaders() },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
    uploaded = uploadRes.data || {}
  } catch (err) {
    throw new Error(`Gladia upload failed: ${extractApiError(err)}`)
  }

  const audioUrl = uploaded.audio_url
  if (!audioUrl) throw new Error('Gladia upload did not return audio_url')

  // Step 2: Start pre-recorded transcription job
  const payload = {
    audio_url: audioUrl,
    diarization: true,
    sentences: true,
    ...(language ? { language_config: { languages: [language], code_switching: true } } : {}),
  }

  console.log('  [gladia] Submitting pre-recorded job…')

  let jobId
  let resultUrl
  try {
    const initRes = await axios.post(`${BASE_URL}/pre-recorded`, payload, {
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
    })
    jobId = initRes.data?.id
    resultUrl = initRes.data?.result_url
  } catch (err) {
    throw new Error(`Gladia job submission failed: ${extractApiError(err)}`)
  }

  if (!jobId || !resultUrl) {
    throw new Error('Gladia did not return expected job id/result_url')
  }

  console.log(`  [gladia] Job id: ${jobId}`)

  // Step 3: Poll result URL until done/error
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let job = null

  while (true) {
    if (Date.now() > deadline) throw new Error('Gladia job timed out after 20 minutes')
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    try {
      const statusRes = await axios.get(resultUrl, { headers: authHeaders })
      job = statusRes.data || {}
    } catch (err) {
      throw new Error(`Gladia polling failed: ${extractApiError(err)}`)
    }

    const status = String(job.status || '').toLowerCase()
    console.log(`  [gladia] Status: ${status || 'unknown'}`)

    if (status === 'done') break
    if (status === 'error') {
      throw new Error(`Gladia job failed: ${extractJobError(job)}`)
    }
  }

  // Step 4: Normalize Gladia output to app transcript format
  const result = job.result || {}
  const tx = result.transcription || {}
  const utterances = Array.isArray(tx.utterances) ? tx.utterances : []

  let segments = utterances
    .map(utt => {
      const start = Number(utt.start)
      const end = Number(utt.end)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null

      const text = String(utt.text || '').trim()
      if (!text) return null

      return {
        speaker: normalizeSpeaker(utt.speaker),
        start,
        end,
        text,
        words: (utt.words || [])
          .map(w => ({
            word: String(w.word || '').trim(),
            start: Number(w.start),
            end: Number(w.end),
          }))
          .filter(w => w.word && Number.isFinite(w.start) && Number.isFinite(w.end)),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  if (segments.length === 0 && tx.full_transcript) {
    const duration = Number(result?.metadata?.audio_duration)
    segments = [{
      speaker: 'SPEAKER_00',
      start: 0,
      end: Number.isFinite(duration) ? duration : 0,
      text: String(tx.full_transcript).trim(),
      words: [],
    }]
  }

  if (segments.length === 0) {
    throw new Error('Gladia returned no usable transcription utterances')
  }

  const speakers = [...new Set(segments.map(s => s.speaker))].sort()
  const durationS = Number.isFinite(Number(result?.metadata?.audio_duration))
    ? Number(result.metadata.audio_duration)
    : segments[segments.length - 1]?.end ?? null

  const utteranceConfidences = utterances
    .map(utt => Number(utt.confidence))
    .filter(v => Number.isFinite(v))
  const confidence = utteranceConfidences.length
    ? utteranceConfidences.reduce((sum, v) => sum + v, 0) / utteranceConfidences.length
    : null

  const detectedLanguage = tx.languages?.[0] ||
    utterances.find(utt => typeof utt.language === 'string' && utt.language.trim())?.language ||
    language ||
    'unknown'

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage,
      durationS,
      confidence: confidence != null ? Math.round(confidence * 10000) / 10000 : null,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: segments.some(s => s.words.length > 0),
    }),
    segments,
    full_transcript: tx.full_transcript || formatTranscript(segments),
  }
}

function extractJobError(job) {
  const raw = job?.error
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw.message === 'string' && raw.message.trim()) return raw.message.trim()
  if (raw && typeof raw.detail === 'string' && raw.detail.trim()) return raw.detail.trim()
  if (job?.error_code) return `HTTP ${job.error_code}`
  return 'unknown error'
}

function extractApiError(err) {
  const data = err.response?.data
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim()
  if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim()
  return err.message
}
