/**
 * OpenAI provider — gpt-4o-transcribe-diarize
 * Supports: speaker diarization, 99 languages, auto-detect
 * No word-level timestamps (timestamp_granularities is unsupported with the diarize model)
 * Limits: 25 MB per file — audio is compressed to mp3 before sending;
 *         files that still exceed 25 MB get a clear error (chunking not yet implemented)
 *
 * Ref: https://developers.openai.com/api/docs/guides/speech-to-text
 */
const fs = require('fs')
const path = require('path')
const { compressAudio, getFileSizeMB } = require('../lib/ffmpeg')
const { buildMetadata, formatTranscript } = require('./utils')

const PROVIDER = 'openai'
const MODEL = 'gpt-4o-transcribe-diarize'
const LIMIT_MB = 25

module.exports = async function run({ audioPath, videoDir, language }) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey })

  // Compress WAV → MP3 before sending (WAV is huge, MP3 at 128kbps ≈ 1 MB/min)
  const mp3Path = path.join(videoDir, 'audio_compressed.mp3')
  console.log(`  [openai] Compressing audio to mp3…`)
  await compressAudio(audioPath, mp3Path)

  const sizeMB = getFileSizeMB(mp3Path)
  if (sizeMB > LIMIT_MB) {
    throw new Error(
      `Audio is ${sizeMB.toFixed(1)} MB after compression — OpenAI has a ${LIMIT_MB} MB limit. ` +
      `Use AssemblyAI or Deepgram for longer videos.`
    )
  }

  console.log(`  [openai] Sending ${sizeMB.toFixed(1)} MB to ${MODEL}…`)

  // chunking_strategy is required for audio longer than 30 seconds
  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(mp3Path),
    model: MODEL,
    response_format: 'diarized_json',
    chunking_strategy: 'auto',
    ...(language ? { language } : {}),
  })

  // diarized_json response: { segments: [{ speaker, text, start, end }] }
  // Note: timestamp_granularities (word-level) is NOT supported by this model.
  const rawSegments = response.segments || []

  const segments = rawSegments.map(seg => ({
    speaker: `SPEAKER_${seg.speaker}`,
    start: seg.start,
    end: seg.end,
    text: (seg.text || '').trim(),
    words: [], // word timestamps not available with diarize model
  }))

  const speakers = [...new Set(segments.map(s => s.speaker))].sort()

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage: response.language || language || 'unknown',
      durationS: response.duration || null,
      confidence: null,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: false,
    }),
    segments,
    full_transcript: formatTranscript(segments),
  }
}
