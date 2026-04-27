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

module.exports = { buildMetadata, formatTranscript }
