function buildMetadata({ provider, model, detectedLanguage, durationS, confidence, speakers, segmentCount, wordTimestamps }) {
  return {
    provider,
    model,
    detected_language: detectedLanguage,
    audio_duration_s: durationS,
    confidence,
    speakers,
    segment_count: segmentCount,
    word_timestamps: wordTimestamps,
    timestamp: new Date().toISOString(),
  }
}

function formatTranscript(segments) {
  return segments.map(seg => {
    const start = fmtTime(seg.start)
    const end = fmtTime(seg.end)
    return `[${start} → ${end}]  ${seg.speaker}: ${seg.text}`
  }).join('\n')
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(2).padStart(5, '0')
  return `${String(m).padStart(2, '0')}:${s}`
}

const MAX_SEGMENT_DURATION_S = 12
const MAX_SEGMENT_WORDS = 40

/**
 * Hard backstop against runaway segments. Some providers hand us a segment
 * per diarized turn / sentence — fine, normally. But fast back-and-forth
 * dialogue with no long pauses (and no reliable speaker split, e.g. Whisper's
 * flat SPEAKER_00) can produce a single 60s+ block covering a dozen exchanges,
 * because the only break conditions upstream are "speaker changed" or "gap >
 * threshold" — neither fires. Re-chunk anything over the cap using its own
 * word timestamps (accurate); segments without word timestamps fall back to
 * an even text/time split (same approach as assBuilder's display pagination).
 * Applied once, uniformly, to every provider's final segments before persisting.
 */
function splitLongSegments(segments, { maxDurationS = MAX_SEGMENT_DURATION_S, maxWords = MAX_SEGMENT_WORDS } = {}) {
  const out = []

  for (const seg of segments) {
    const duration = seg.end - seg.start
    const wordCount = (seg.words || []).length

    if (duration <= maxDurationS && wordCount <= maxWords) {
      out.push(seg)
      continue
    }

    if (wordCount > 0) {
      let chunk = []
      const flush = () => {
        if (chunk.length === 0) return
        out.push({
          speaker: seg.speaker,
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
          text: chunk.map(w => w.word).join(' '),
          words: chunk,
        })
        chunk = []
      }
      for (const w of seg.words) {
        const wouldExceedDuration = chunk.length > 0 && (w.end - chunk[0].start) > maxDurationS
        const wouldExceedWords = chunk.length >= maxWords
        if (wouldExceedDuration || wouldExceedWords) flush()
        chunk.push(w)
      }
      flush()
    } else {
      // No word timestamps to chunk by — best-effort even split by text/time.
      const textWords = seg.text.split(/\s+/).filter(Boolean)
      const numChunks = Math.max(1, Math.ceil(duration / maxDurationS))
      const chunkSize = Math.max(1, Math.min(maxWords, Math.ceil(textWords.length / numChunks)))
      const timePerWord = duration / textWords.length
      for (let i = 0; i < textWords.length; i += chunkSize) {
        out.push({
          speaker: seg.speaker,
          start: seg.start + i * timePerWord,
          end: seg.start + Math.min(i + chunkSize, textWords.length) * timePerWord,
          text: textWords.slice(i, i + chunkSize).join(' '),
          words: [],
        })
      }
    }
  }

  return out
}

function normalizeSpeaker(speaker) {
  if (speaker == null || speaker === '') return 'SPEAKER_00'
  const n = Number(speaker)
  if (Number.isFinite(n)) return `SPEAKER_${String(Math.trunc(n)).padStart(2, '0')}`
  const value = String(speaker).trim()
  const m = value.match(/^SPEAKER_(\d+)$/i)
  if (m) return `SPEAKER_${m[1].padStart(2, '0')}`
  return value.toUpperCase()
}

module.exports = { buildMetadata, formatTranscript, normalizeSpeaker, splitLongSegments }
