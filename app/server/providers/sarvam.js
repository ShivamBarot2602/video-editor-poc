/**
 * Sarvam AI provider — Saaras v3
 * Uses Batch API (async, polling) — REST API is limited to 30s audio.
 *
 *   POST /speech-to-text/job/v1               → create job
 *   POST /speech-to-text/job/v1/upload-files  → get presigned Azure upload URL
 *   PUT  <presigned_url>                       → upload audio to Blob Storage
 *   POST /speech-to-text/job/v1/{id}/start    → start processing
 *   GET  /speech-to-text/job/v1/{id}/status   → poll until completed/failed
 *   POST /speech-to-text/job/v1/download-files → get presigned download URL
 *   GET  <presigned_url>                       → fetch result JSON
 *
 * Auth: api-subscription-key header
 * Result JSON fields: transcript, language_code,
 *   timestamps.words[], timestamps.start_time_seconds[], timestamps.end_time_seconds[],
 *   diarized_transcript[].{transcript, start_time_seconds, end_time_seconds, speaker_id}
 */
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { buildMetadata, formatTranscript, normalizeSpeaker } = require('./utils')

const PROVIDER = 'sarvam'
const MODEL = 'saaras:v3'
const BASE_URL = 'https://api.sarvam.ai'
const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 20 * 60 * 1000 // 20 min

const MIME_TYPES = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
}

module.exports = async function run({ audioPath, language }) {
  const apiKey = process.env.SARVAM_API_KEY
  if (!apiKey) throw new Error('SARVAM_API_KEY is not set')

  const authHeaders = { 'api-subscription-key': apiKey }
  const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' }

  // Step 1: Create batch job
  console.log('  [sarvam] Creating job…')
  let jobId
  try {
    const res = await axios.post(`${BASE_URL}/speech-to-text/job/v1`, {
      job_parameters: {
        model: MODEL,
        mode: 'transcribe',
        with_diarization: true,
        with_timestamps: true,
        ...(language ? { language_code: language } : {}),
      },
    }, { headers: jsonHeaders })
    jobId = res.data?.job_id
  } catch (err) {
    throw new Error(`Sarvam job creation failed: ${extractError(err)}`)
  }
  if (!jobId) throw new Error('Sarvam did not return a job_id')

  console.log(`  [sarvam] Job id: ${jobId}`)

  // Step 2: Get presigned upload URL
  const fileName = path.basename(audioPath)
  let uploadUrl
  try {
    const res = await axios.post(`${BASE_URL}/speech-to-text/job/v1/upload-files`, {
      job_id: jobId,
      files: [fileName],
    }, { headers: jsonHeaders })
    uploadUrl = res.data?.upload_urls?.[fileName]?.file_url
  } catch (err) {
    throw new Error(`Sarvam upload-files request failed: ${extractError(err)}`)
  }
  if (!uploadUrl) throw new Error('Sarvam did not return an upload URL')

  // Step 3: Upload audio directly to Azure Blob Storage
  console.log('  [sarvam] Uploading audio…')
  try {
    const fileBuffer = fs.readFileSync(audioPath)
    const mimeType = MIME_TYPES[path.extname(audioPath).toLowerCase()] || 'audio/wav'
    await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': mimeType,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
  } catch (err) {
    throw new Error(`Sarvam audio upload failed: ${extractError(err)}`)
  }

  // Step 4: Start job
  console.log('  [sarvam] Starting job…')
  try {
    await axios.post(`${BASE_URL}/speech-to-text/job/v1/${jobId}/start`, {}, { headers: jsonHeaders })
  } catch (err) {
    throw new Error(`Sarvam job start failed: ${extractError(err)}`)
  }

  // Step 5: Poll for completion
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let jobStatus = null
  while (true) {
    if (Date.now() > deadline) throw new Error('Sarvam job timed out after 20 minutes')
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    try {
      const res = await axios.get(`${BASE_URL}/speech-to-text/job/v1/${jobId}/status`, { headers: authHeaders })
      jobStatus = res.data
    } catch (err) {
      throw new Error(`Sarvam status polling failed: ${extractError(err)}`)
    }

    const state = String(jobStatus?.job_state || '').toLowerCase()
    console.log(`  [sarvam] Status: ${state || 'unknown'}`)

    if (state === 'completed') break
    if (state === 'failed') throw new Error('Sarvam job failed')
  }

  // Step 6: Find output filename from job details
  const details = jobStatus?.job_details || []
  const successDetail = details.find(d => d.state === 'Success' && d.outputs?.length > 0)
  if (!successDetail) throw new Error('Sarvam job completed but no successful output files found')
  const outputFileName = successDetail.outputs[0].file_name

  // Step 7: Get presigned download URL
  let downloadUrl
  try {
    const res = await axios.post(`${BASE_URL}/speech-to-text/job/v1/download-files`, {
      job_id: jobId,
      files: [outputFileName],
    }, { headers: jsonHeaders })
    downloadUrl = res.data?.download_urls?.[outputFileName]?.file_url
  } catch (err) {
    throw new Error(`Sarvam download-files request failed: ${extractError(err)}`)
  }
  if (!downloadUrl) throw new Error('Sarvam did not return a download URL')

  // Step 8: Download and parse result JSON
  console.log('  [sarvam] Downloading result…')
  let result
  try {
    const res = await axios.get(downloadUrl)
    result = res.data
  } catch (err) {
    throw new Error(`Sarvam result download failed: ${extractError(err)}`)
  }

  // Build word list from parallel timestamp arrays
  const ts = result.timestamps || {}
  const rawWords = (Array.isArray(ts.words) ? ts.words : [])
    .map((word, i) => ({
      word: String(word || '').trim(),
      start: Number(ts.start_time_seconds?.[i] ?? 0),
      end: Number(ts.end_time_seconds?.[i] ?? 0),
    }))
    .filter(w => w.word && Number.isFinite(w.start) && Number.isFinite(w.end))

  // Build segments from diarized_transcript
  const diarizedSegments = Array.isArray(result.diarized_transcript) ? result.diarized_transcript : []
  let segments = diarizedSegments
    .map(seg => {
      const start = Number(seg.start_time_seconds ?? 0)
      const end = Number(seg.end_time_seconds ?? 0)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null

      const text = String(seg.transcript || '').trim()
      if (!text) return null

      // Match words whose midpoint falls within this segment's time window
      const segWords = rawWords.filter(w => {
        const mid = (w.start + w.end) / 2
        return mid >= start - 0.05 && mid <= end + 0.05
      })

      return {
        speaker: normalizeSpeaker(seg.speaker_id),
        start,
        end,
        text,
        words: segWords,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  // Fallback: single segment from top-level transcript
  if (segments.length === 0 && result.transcript?.trim()) {
    segments = [{
      speaker: 'SPEAKER_00',
      start: 0,
      end: rawWords.length > 0 ? rawWords[rawWords.length - 1].end : 0,
      text: result.transcript.trim(),
      words: rawWords,
    }]
  }

  if (segments.length === 0) {
    throw new Error('Sarvam returned no transcription segments')
  }

  const speakers = [...new Set(segments.map(s => s.speaker))].sort()
  const durationS = segments[segments.length - 1]?.end ?? null
  const detectedLanguage = result.language_code || language || 'unknown'

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage,
      durationS,
      confidence: null,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: rawWords.length > 0,
    }),
    segments,
    full_transcript: result.transcript || formatTranscript(segments),
    _raw: result,
  }
}

function extractError(err) {
  const data = err.response?.data
  if (!data) return err.message
  if (typeof data === 'string') return data.trim()
  return data?.message || data?.error?.message || data?.detail || err.message
}
