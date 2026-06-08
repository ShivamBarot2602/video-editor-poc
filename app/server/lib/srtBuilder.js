/**
 * Build a SubRip (.srt) subtitle file from a normalized transcription object.
 *
 * One cue per transcription segment. Cue text prefers a user edit
 * (`segment.text_edited`) over the original (`segment.text`), so the exported
 * SRT always reflects the latest edits made in the editor. Empty/whitespace-only
 * segments are skipped, and cues are renumbered sequentially after filtering.
 *
 * SRT timestamp format: HH:MM:SS,mmm  (comma decimal separator).
 */

function pad(num, len) {
  return String(num).padStart(len, '0')
}

function srtTime(seconds) {
  const total = Math.max(0, Math.round((Number(seconds) || 0) * 1000))
  const ms = total % 1000
  const s = Math.floor(total / 1000) % 60
  const m = Math.floor(total / 60000) % 60
  const h = Math.floor(total / 3600000)
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`
}

function buildSrt(transcription) {
  const segments = Array.isArray(transcription?.segments) ? transcription.segments : []

  const cues = []
  for (const seg of segments) {
    const text = String(seg?.text_edited ?? seg?.text ?? '').trim()
    if (!text) continue
    cues.push({ start: seg.start, end: seg.end, text })
  }

  return cues
    .map((cue, i) => `${i + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`)
    .join('\n')
}

module.exports = { buildSrt }
