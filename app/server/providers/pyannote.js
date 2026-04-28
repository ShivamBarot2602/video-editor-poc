/**
 * pyannoteAI provider — precision-2 + speaker-attributed transcription
 * Uses official REST API:
 *   POST /v1/media/input (get pre-signed upload URL)
 *   PUT  <pre-signed-url> (upload audio bytes)
 *   POST /v1/diarize
 *   GET  /v1/jobs/{jobId}
 */
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { buildMetadata, formatTranscript, normalizeSpeaker } = require('./utils')

const PROVIDER = 'pyannote'
const MODEL = 'precision-2'
const TRANSCRIPTION_MODEL = 'faster-whisper-large-v3-turbo'
const BASE_URL = 'https://api.pyannote.ai/v1'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 20 * 60 * 1000 // 20 min

module.exports = async function run({ audioPath, videoId, language }) {
  const apiKey = process.env.PYANNOTE_API_KEY
  if (!apiKey) throw new Error('PYANNOTE_API_KEY is not set')
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error('pyannote input audio file is missing')

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  const mediaRef = buildMediaRef(audioPath, videoId)
  const uploadUrl = await createUploadUrl({ headers, mediaRef })
  await uploadAudio({ uploadUrl, audioPath })

  const payload = {
    url: mediaRef,
    model: MODEL,
    confidence: true,
    transcription: true,
    transcriptionConfig: {
      model: TRANSCRIPTION_MODEL,
      ...(language ? { language } : {}),
    },
  }

  console.log(`  [pyannote] Submitting diarization job…`)

  let submitRes
  try {
    submitRes = await axios.post(`${BASE_URL}/diarize`, payload, { headers })
  } catch (err) {
    throw new Error(`pyannote job submission failed: ${extractApiError(err)}`)
  }
  const jobId = submitRes.data?.jobId
  if (!jobId) throw new Error('pyannote did not return a jobId')

  console.log(`  [pyannote] Job id: ${jobId}`)

  const deadline = Date.now() + POLL_TIMEOUT_MS
  let job = null

  while (true) {
    if (Date.now() > deadline) throw new Error('pyannote job timed out after 20 minutes')
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    let statusRes
    try {
      statusRes = await axios.get(`${BASE_URL}/jobs/${jobId}`, { headers })
    } catch (err) {
      throw new Error(`pyannote polling failed: ${extractApiError(err)}`)
    }
    job = statusRes.data || {}
    const status = String(job.status || '').toLowerCase()

    console.log(`  [pyannote] Status: ${job.status || 'unknown'}`)

    if (['succeeded', 'success', 'completed', 'done'].includes(status)) break
    if (['failed', 'error', 'errored', 'rejected', 'deleted', 'cancelled', 'canceled'].includes(status)) {
      const reason = job.output?.error || job.output?.warning || 'unknown error'
      throw new Error(`pyannote job ${job.status}: ${reason}`)
    }
  }

  const output = job?.output || {}
  const words = normalizeWordLevel(output.wordLevelTranscription || [])
  let segments = normalizeTurnLevel(output.turnLevelTranscription || [], words)

  if (segments.length === 0 && words.length > 0) {
    segments = buildSegmentsFromWords(words)
  }
  if (segments.length === 0) {
    segments = normalizeDiarization(output.exclusiveDiarization || output.diarization || [])
  }
  if (segments.length === 0) {
    throw new Error('pyannote returned no usable diarization/transcription segments')
  }

  const speakers = [...new Set(segments.map(s => s.speaker))].sort()
  const durationS = segments[segments.length - 1]?.end ?? null
  const confidence = estimateConfidence(output)

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage: output.language || language || 'unknown',
      durationS,
      confidence,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: segments.some(s => s.words.length > 0),
    }),
    segments,
    full_transcript: formatTranscript(segments),
  }
}

async function createUploadUrl({ headers, mediaRef }) {
  console.log(`  [pyannote] Creating media upload URL…`)

  try {
    const res = await axios.post(`${BASE_URL}/media/input`, { url: mediaRef }, { headers })
    const uploadUrl = res.data?.url || res.data?.putUrl
    if (!uploadUrl) throw new Error('pyannote did not return a pre-signed upload URL')
    return uploadUrl
  } catch (err) {
    throw new Error(`pyannote media URL creation failed: ${extractApiError(err)}`)
  }
}

async function uploadAudio({ uploadUrl, audioPath }) {
  const size = fs.statSync(audioPath).size
  const contentType = inferAudioContentType(audioPath)

  console.log(`  [pyannote] Uploading audio (${Math.round(size / 1024)} KB)…`)

  try {
    await axios.put(uploadUrl, fs.createReadStream(audioPath), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': size,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
  } catch (err) {
    throw new Error(`pyannote media upload failed: ${extractApiError(err)}`)
  }
}

function normalizeWordLevel(items) {
  return items
    .map(w => ({
      speaker: normalizeSpeaker(w.speaker),
      start: Number(w.start ?? 0),
      end: Number(w.end ?? 0),
      word: String(w.text || '').trim(),
    }))
    .filter(w => w.word && Number.isFinite(w.start) && Number.isFinite(w.end))
    .sort((a, b) => a.start - b.start)
}

function normalizeTurnLevel(turns, words) {
  const wordsBySpeaker = words.reduce((acc, w) => {
    if (!acc[w.speaker]) acc[w.speaker] = []
    acc[w.speaker].push(w)
    return acc
  }, {})

  return turns
    .map(turn => {
      const speaker = normalizeSpeaker(turn.speaker)
      const start = Number(turn.start ?? 0)
      const end = Number(turn.end ?? 0)
      const text = String(turn.text || '').trim()
      if (!text || !Number.isFinite(start) || !Number.isFinite(end)) return null

      const segmentWords = (wordsBySpeaker[speaker] || [])
        .filter(w => w.start >= start - 0.05 && w.end <= end + 0.05)
        .map(w => ({ word: w.word, start: w.start, end: w.end }))

      return { speaker, start, end, text, words: segmentWords }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
}

function buildSegmentsFromWords(words) {
  const segments = []
  let current = null

  for (const w of words) {
    const startsNewSegment =
      !current ||
      current.speaker !== w.speaker ||
      w.start - current.end > 1.0

    if (startsNewSegment) {
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
      current.text += ` ${w.word}`
      current.words.push({ word: w.word, start: w.start, end: w.end })
    }
  }

  if (current) segments.push(current)
  return segments
}

function normalizeDiarization(items) {
  return items
    .map(seg => {
      const start = Number(seg.start ?? 0)
      const end = Number(seg.end ?? 0)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null
      return {
        speaker: normalizeSpeaker(seg.speaker),
        start,
        end,
        text: '',
        words: [],
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
}

function estimateConfidence(output) {
  const timelineScores = output?.confidence?.score
  if (Array.isArray(timelineScores) && timelineScores.length > 0) {
    const avg = timelineScores.reduce((sum, v) => sum + Number(v || 0), 0) / timelineScores.length
    if (Number.isFinite(avg)) return avg > 1 ? Math.round(avg) / 100 : Math.round(avg * 10000) / 10000
  }

  const perTurn = (output.turnLevelTranscription || [])
    .map(t => Number(t.confidence))
    .filter(v => Number.isFinite(v))
  if (perTurn.length > 0) {
    const avg = perTurn.reduce((sum, v) => sum + v, 0) / perTurn.length
    return avg > 1 ? Math.round(avg) / 100 : Math.round(avg * 10000) / 10000
  }

  const diarizationScores = (output.diarization || [])
    .flatMap(s => Object.values(s.confidence || {}))
    .map(Number)
    .filter(v => Number.isFinite(v))
  if (diarizationScores.length > 0) {
    const avg = diarizationScores.reduce((sum, v) => sum + v, 0) / diarizationScores.length
    return avg > 1 ? Math.round(avg) / 100 : Math.round(avg * 10000) / 10000
  }

  return null
}

function extractApiError(err) {
  return err.response?.data?.error || err.response?.data?.message || err.message
}

function buildMediaRef(audioPath, videoId) {
  const ext = (path.extname(audioPath).toLowerCase() || '.wav').replace(/[^a-z0-9.]/g, '')
  const safeVideoId = String(videoId || 'unknown').replace(/[^a-zA-Z0-9\-_]/g, '-')
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `media://sp-video-editor/${safeVideoId}/${unique}${ext}`
}

function inferAudioContentType(audioPath) {
  switch (path.extname(audioPath).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg'
    case '.m4a':
      return 'audio/mp4'
    case '.flac':
      return 'audio/flac'
    case '.ogg':
      return 'audio/ogg'
    case '.webm':
      return 'audio/webm'
    case '.wav':
    default:
      return 'audio/wav'
  }
}
