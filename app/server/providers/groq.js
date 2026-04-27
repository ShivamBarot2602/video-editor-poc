/**
 * Groq provider — Whisper Large v3 Turbo (fastest + cheapest on Groq LPU)
 * Supports: word timestamps, 99 languages, auto-detect, code-mixing
 * No speaker diarization — all segments labeled SPEAKER_00
 * Limits: 100 MB per file — audio is compressed to mp3 before sending
 */
const fs = require('fs')
const path = require('path')
const { compressAudio, getFileSizeMB } = require('../lib/ffmpeg')
const { buildMetadata, formatTranscript } = require('./utils')

const PROVIDER = 'groq'
const MODEL = 'whisper-large-v3-turbo'
const LIMIT_MB = 100

module.exports = async function run({ audioPath, videoDir, language }) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')

  const { default: Groq } = await import('groq-sdk')
  const client = new Groq({ apiKey })

  const mp3Path = path.join(videoDir, 'audio_compressed.mp3')
  console.log(`  [groq] Compressing audio to mp3…`)
  await compressAudio(audioPath, mp3Path)

  const sizeMB = getFileSizeMB(mp3Path)
  if (sizeMB > LIMIT_MB) {
    throw new Error(
      `Audio is ${sizeMB.toFixed(1)} MB after compression — Groq has a ${LIMIT_MB} MB limit. ` +
      `Use AssemblyAI or Deepgram for longer videos.`
    )
  }

  console.log(`  [groq] Sending ${sizeMB.toFixed(1)} MB to Groq…`)
  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(mp3Path),
    model: MODEL,
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
    ...(language ? { language } : {}),
  })

  const words = response.words || []

  // Group words into segments (~sentence boundaries) using silence gaps > 1s
  const segments = []
  let current = null
  for (const w of words) {
    if (!current || w.start - current.end > 1.0) {
      if (current) segments.push(current)
      current = { speaker: 'SPEAKER_00', start: w.start, end: w.end, text: w.word, words: [{ word: w.word, start: w.start, end: w.end }] }
    } else {
      current.end = w.end
      current.text += ` ${w.word}`
      current.words.push({ word: w.word, start: w.start, end: w.end })
    }
  }
  if (current) segments.push(current)

  // Fallback: if no word-level data, use segments from response directly
  if (segments.length === 0 && response.segments) {
    response.segments.forEach(seg => {
      segments.push({
        speaker: 'SPEAKER_00',
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        words: [],
      })
    })
  }

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage: response.language || language || 'unknown',
      durationS: response.duration || null,
      confidence: null,
      speakers: ['SPEAKER_00'],
      segmentCount: segments.length,
      wordTimestamps: words.length > 0,
    }),
    segments,
    full_transcript: formatTranscript(segments),
  }
}
