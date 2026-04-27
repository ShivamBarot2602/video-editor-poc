/**
 * Speechmatics provider — Enhanced operating point
 * Supports: speaker diarization, word timestamps, 55+ languages, auto-detect
 * Limits: 1 GB upload, 2 hr max duration
 * Uses REST API directly (axios + form-data) to avoid ESM/CJS SDK issues
 */
const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const { buildMetadata, formatTranscript } = require('./utils')

const PROVIDER = 'speechmatics'
const BASE_URL = 'https://asr.api.speechmatics.com/v2'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 10 * 60 * 1000 // 10 min

module.exports = async function run({ audioPath, language }) {
  const apiKey = process.env.SPEECHMATICS_API_KEY
  if (!apiKey) throw new Error('SPEECHMATICS_API_KEY is not set')

  const authHeaders = { Authorization: `Bearer ${apiKey}` }

  // Build transcription config — fallback to 'en' if no language provided
  const txConfig = {
    operating_point: 'enhanced',
    diarization: 'speaker',
    language: language || 'en',
  }

  // Submit job via multipart POST
  const form = new FormData()
  form.append('data_file', fs.createReadStream(audioPath))
  form.append('config', JSON.stringify({ type: 'transcription', transcription_config: txConfig }))

  let submitRes;

  console.log(`  [speechmatics] Submitting batch job…`,{ ...authHeaders, ...form.getHeaders() },)
  try {
     submitRes = await axios.post(`${BASE_URL}/jobs/`, form, {
      headers: { ...authHeaders, ...form.getHeaders() },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
  } catch (error) {
    console.log(error)
    throw new Error(`Speechmatics upload failed: ${error.message}`)
  }
  const jobId = submitRes.data.id
  console.log(`  [speechmatics] Job id: ${jobId}`)

  // Poll until done / rejected
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (true) {
    if (Date.now() > deadline) throw new Error('Speechmatics job timed out after 10 minutes')
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    const statusRes = await axios.get(`${BASE_URL}/jobs/${jobId}`, { headers: authHeaders })
    const job = statusRes.data.job
    console.log(`  [speechmatics] Status: ${job.status}`)

    if (job.status === 'done') break
    if (job.status === 'rejected' || job.status === 'deleted') {
      const reason = job.errors?.[0]?.message || 'unknown error'
      throw new Error(`Speechmatics job ${job.status}: ${reason}`)
    }
  }

  // Fetch transcript in json-v2 format
  const transcriptRes = await axios.get(
    `${BASE_URL}/jobs/${jobId}/transcript?format=json-v2`,
    { headers: authHeaders }
  )
  const results = transcriptRes.data.results || []
  const metadata = transcriptRes.data.metadata || {}

  const segments = parseResults(results)
  const speakers = [...new Set(segments.map(s => s.speaker))].sort()
  const detectedLanguage = metadata.language_identified || language || 'unknown'
  const durationS = segments.length ? segments[segments.length - 1].end : null

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: 'enhanced',
      detectedLanguage,
      durationS,
      confidence: null,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: true,
    }),
    segments,
    full_transcript: formatTranscript(segments),
  }
}

/**
 * Convert the flat json-v2 results array into speaker-segmented groups.
 * Segments break on speaker change or sentence boundary (is_eos punctuation).
 *
 * json-v2 result types:
 *   word        — { start_time, end_time, alternatives: [{ content, speaker }] }
 *   punctuation — { is_eos, alternatives: [{ content }] }
 */
function parseResults(results) {
  const segments = []
  let currentWords = []   // raw word result objects in the current segment
  let currentSpeaker = null
  let trailingPunct = ''  // punctuation accumulated after last word

  const flush = () => {
    if (currentWords.length === 0) return
    const words = currentWords.map(r => ({
      word: r.alternatives[0].content,
      start: r.start_time,
      end: r.end_time,
    }))
    segments.push({
      speaker: currentSpeaker,
      start: words[0].start,
      end: words[words.length - 1].end,
      text: words.map(w => w.word).join(' ') + trailingPunct,
      words,
    })
    currentWords = []
    trailingPunct = ''
  }

  for (const r of results) {
    if (r.type === 'word') {
      const speaker = `SPEAKER_${r.alternatives?.[0]?.speaker ?? '00'}`
      // Speaker change → close current segment
      if (currentSpeaker !== null && currentSpeaker !== speaker) flush()
      currentSpeaker = speaker
      currentWords.push(r)
    } else if (r.type === 'punctuation') {
      trailingPunct += r.alternatives?.[0]?.content ?? ''
      // End-of-sentence → close current segment
      if (r.is_eos) flush()
    }
  }
  flush()
  return segments
}
