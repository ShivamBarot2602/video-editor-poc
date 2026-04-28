/**
 * Deepgram provider — Nova-3 model
 * Supports: speaker diarization, word timestamps, 100+ languages, auto-detect
 * Limits: 2 GB file, 10–20 min duration (Nova-3)
 */
const fs = require('fs')
const { buildMetadata, formatTranscript } = require('./utils')

const PROVIDER = 'deepgram'
const MODEL = 'nova-3'

module.exports = async function run({ audioPath, language }) {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set')

  const { createClient } = await import('@deepgram/sdk')
  const client = createClient(apiKey)

  console.log(`  [deepgram] Uploading to Nova-3…`)
  const audioBuffer = fs.readFileSync(audioPath)

  const { result, error } = await client.listen.prerecorded.transcribeFile(
    audioBuffer,
    {
      model: MODEL,
      smart_format: true,
      diarize: true,
      utterances: true,
      words: true,
      ...(language ? { language } : { detect_language: true }),
    }
  )

  if (error) throw new Error(`Deepgram error: ${JSON.stringify(error)}`)

  const channel = result.results?.channels?.[0]?.alternatives?.[0]
  const utterances = result.results?.utterances || []
  const metadata = result.metadata || {}

  let segments = []

  if (utterances.length > 0) {
    // Use utterances (diarized segments)
    segments = utterances.map(utt => ({
      speaker: `SPEAKER_${String(utt.speaker).padStart(2, '0')}`,
      start: utt.start,
      end: utt.end,
      text: utt.transcript,
      words: (utt.words || []).map(w => ({
        word: w.punctuated_word || w.word,
        start: w.start,
        end: w.end,
      })),
    }))
  } else if (channel) {
    // Fallback: single segment from channel
    segments = [{
      speaker: 'SPEAKER_00',
      start: 0,
      end: metadata.duration || 0,
      text: channel.transcript,
      words: (channel.words || []).map(w => ({
        word: w.punctuated_word || w.word,
        start: w.start,
        end: w.end,
      })),
    }]
  }

  const speakers = [...new Set(segments.map(s => s.speaker))].sort()
  const detectedLang = result.results?.channels?.[0]?.detected_language || language || 'unknown'

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage: detectedLang,
      durationS: metadata.duration || null,
      confidence: channel?.confidence ? Math.round(channel.confidence * 10000) / 10000 : null,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: true,
    }),
    segments,
    full_transcript: formatTranscript(segments),
    _raw: result,
  }
}
