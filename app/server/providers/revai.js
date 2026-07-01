/**
 * Rev AI provider — Reverb ASR
 * Supports: speaker diarization (premium), word timestamps, 57+ languages
 * Limits: 2 GB upload / 5 TB URL, 17 hr max duration
 * Diarization: on by default; using premium tier for better accuracy
 * Language: BCP-47 code (e.g. "en", "en-US"); defaults to "en" (no auto-detect)
 */
const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const { buildMetadata, formatTranscript } = require('./utils')

const PROVIDER = 'revai'
const MODEL    = 'reverb-asr'
const BASE_URL = 'https://api.rev.ai/speechtotext/v1'

const POLL_INTERVAL_MS = 5000
const MAX_POLLS        = 720  // 1 hr max wait

module.exports = async function run({ audioPath, audioUrl, language }) {
  const apiKey = process.env.REVAI_ACCESS_TOKEN
  if (!apiKey) throw new Error('REVAI_ACCESS_TOKEN is not set')

  const authHeaders = { Authorization: `Bearer ${apiKey}` }

  const jobOptions = {
    diarization_type: 'premium',
    remove_disfluencies: false,
    language: language || 'en',
  }

  // ── Step 1: Submit job — via source_config (URL, no upload) or multipart ──
  let jobId
  try {
    let res
    if (audioUrl) {
      console.log(`  [revai] Submitting job via source_config (language=${jobOptions.language}, no upload)…`)
      res = await axios.post(`${BASE_URL}/jobs`,
        { source_config: { url: audioUrl }, ...jobOptions },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } })
    } else {
      const form = new FormData()
      form.append('media', fs.createReadStream(audioPath), { filename: 'audio.wav' })
      form.append('options', JSON.stringify(jobOptions), { contentType: 'application/json' })

      console.log(`  [revai] Submitting job (language=${jobOptions.language})…`)
      res = await axios.post(`${BASE_URL}/jobs`, form, {
        headers: { ...authHeaders, ...form.getHeaders() },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      })
    }
    jobId = res.data.id
  } catch (err) {
    const msg = err.response?.data?.title || err.response?.data?.message || err.message
    throw new Error(`Rev AI job submission failed: ${msg}`)
  }

  console.log(`  [revai] Job ${jobId} submitted, polling…`)

  // ── Step 2: Poll until transcribed ────────────────────────────────────────
  let durationS = null
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    let job
    try {
      const res = await axios.get(`${BASE_URL}/jobs/${jobId}`, { headers: authHeaders })
      job = res.data
    } catch (err) {
      const msg = err.response?.data?.title || err.response?.data?.message || err.message
      throw new Error(`Rev AI polling failed: ${msg}`)
    }

    if (job.status === 'failed') {
      throw new Error(`Rev AI job failed: ${job.failure_detail || job.failure || 'unknown error'}`)
    }

    if (job.status === 'transcribed') {
      durationS = job.duration_seconds ?? null
      console.log(`  [revai] Job ${jobId} complete (${durationS}s)`)
      break
    }

    if (i === MAX_POLLS - 1) throw new Error('Rev AI job timed out after 1 hour')
  }

  // ── Step 3: Fetch transcript ───────────────────────────────────────────────
  let transcript
  try {
    const res = await axios.get(`${BASE_URL}/jobs/${jobId}/transcript`, {
      headers: {
        ...authHeaders,
        Accept: 'application/vnd.rev.transcript.v1.0+json',
      },
    })
    transcript = res.data
  } catch (err) {
    const msg = err.response?.data?.title || err.response?.data?.message || err.message
    throw new Error(`Rev AI transcript fetch failed: ${msg}`)
  }

  // ── Step 4: Parse monologues → unified segment format ─────────────────────
  // Each monologue = one speaker turn; elements = interleaved text words + punct
  const segments = (transcript.monologues || []).map(mono => {
    const speaker      = `SPEAKER_${String(mono.speaker).padStart(2, '0')}`
    const textElements = (mono.elements || []).filter(e => e.type === 'text')

    if (textElements.length === 0) return null

    const start = textElements[0].ts ?? 0
    const end   = textElements[textElements.length - 1].end_ts ?? 0

    // Rebuild readable text: words separated by spaces, punct appended directly
    let text = ''
    for (const el of mono.elements || []) {
      if (el.type === 'text')  text += (text ? ' ' : '') + el.value
      else if (el.type === 'punct') text += el.value
    }

    const words = textElements.map(el => ({
      word:  el.value,
      start: el.ts     ?? 0,
      end:   el.end_ts ?? 0,
    }))

    return { speaker, start, end, text: text.trim(), words }
  }).filter(Boolean)

  // Average word-level confidence across entire transcript
  const allConfidences = (transcript.monologues || [])
    .flatMap(m => (m.elements || [])
      .filter(e => e.type === 'text' && e.confidence != null)
      .map(e => e.confidence))
  const confidence = allConfidences.length
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : null

  const speakers = [...new Set(segments.map(s => s.speaker))].sort()

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage: jobOptions.language,
      durationS,
      confidence: confidence != null ? Math.round(confidence * 10000) / 10000 : null,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: true,
    }),
    segments,
    full_transcript: formatTranscript(segments),
    _raw: transcript,
  }
}
