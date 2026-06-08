/**
 * Prompt + bucket helpers for the clip-suggestion stage.
 * Both clipSuggest providers (openai, gemini) receive the same brief; the
 * provider wrappers only differ in transport + response parsing.
 */

/**
 * Duration buckets the user can pick. Seconds are the target clip length range
 * the model must honor. `auto` lets the model pick the natural length.
 */
const BUCKETS = {
  auto:   { min: 8,  max: 90, label: 'Auto (8-90s)' },
  short:  { min: 8,  max: 30, label: '<=30s' },
  medium: { min: 30, max: 60, label: '30-60s' },
  long:   { min: 60, max: 90, label: '60-90s' },
}

function resolveBucket(key) {
  return BUCKETS[key] || BUCKETS.auto
}

// Cap the transcript we send to the model. gpt-4.1-mini is the tighter context
// window of the two providers; ~120k chars keeps us comfortably inside it.
const TRANSCRIPT_CHAR_CAP = 120000

/**
 * Render segments as compact lines the model can map clip ranges onto:
 *   [12] 34.5-39.2 SPEAKER_00: some text
 * Prefers the user-edited text (text_edited) over the raw transcript text.
 * Returns { lines, truncated }.
 */
function buildSegmentLines(segments) {
  const all = (Array.isArray(segments) ? segments : []).map((s, i) => {
    const start = Number(s.start) || 0
    const end = Number(s.end) || 0
    const speaker = s.speaker ? `${s.speaker}: ` : ''
    const text = String(s.text_edited ?? s.text ?? '').replace(/\s+/g, ' ').trim()
    return `[${i}] ${start.toFixed(1)}-${end.toFixed(1)} ${speaker}${text}`
  })

  let joined = all.join('\n')
  let truncated = false
  if (joined.length > TRANSCRIPT_CHAR_CAP) {
    truncated = true
    // Down-sample evenly so we keep coverage across the whole video, not just
    // the opening, then re-clip to the cap as a hard safety net.
    const keepRatio = TRANSCRIPT_CHAR_CAP / joined.length
    const step = Math.max(1, Math.round(1 / keepRatio))
    const sampled = all.filter((_, i) => i % step === 0)
    joined = sampled.join('\n').slice(0, TRANSCRIPT_CHAR_CAP)
  }
  return { lines: joined, truncated }
}

/**
 * Build the clip-suggestion prompt.
 *
 * @param {object} opts
 * @param {Array}  opts.segments      - transcription segments [{start,end,speaker,text,text_edited}]
 * @param {string} opts.bucket        - bucket key (auto|short|medium|long)
 * @param {number} opts.count         - desired clip count (3-5)
 * @param {number} opts.videoDuration - total video duration in seconds
 * @param {string} [opts.language]
 * @param {string} [opts.filename]
 * @returns {{ prompt: string, truncated: boolean }}
 */
function buildClipPrompt({ segments, bucket, count, videoDuration, language, filename } = {}) {
  const b = resolveBucket(bucket)
  const maxLen = Math.min(b.max, Math.max(2, Math.floor(videoDuration)))
  const { lines, truncated } = buildSegmentLines(segments)

  const context = []
  if (filename) context.push(`Source video: "${filename}".`)
  if (language) context.push(`Spoken language: ${language}.`)

  const prompt = [
    `You are a short-form video editor. From the transcript of a ${videoDuration.toFixed(1)}-second video, select the ${count} MOST engaging clips for social platforms (Reels / Shorts / TikTok).`,
    'Each clip must be self-contained and start with a scroll-stopping hook in its first seconds.',
    context.length ? '\n' + context.join(' ') : '',
    '',
    'Hard requirements:',
    `- Return EXACTLY ${count} clips, ranked best first.`,
    `- start and end are in SECONDS. Enforce 0 <= start < end <= ${videoDuration.toFixed(1)}.`,
    `- Each clip duration (end - start) MUST be between ${b.min} and ${maxLen} seconds.`,
    '- Snap start/end to the [index] segment boundaries below whenever possible.',
    '- Clips must NOT overlap each other.',
    '- transcript_excerpt must be the verbatim transcript text covered by the clip range.',
    '- score is an integer 1-10 rating expected engagement.',
    '',
    'Selection guidance: prioritise a strong hook, emotional or curiosity payload, a clear standalone point, and quotable lines. You only have the transcript (no video), so infer engaging moments from what is said.',
    '',
    'Transcript (one line per segment: [index] start-end speaker: text):',
    lines,
    '',
    'Return ONLY a JSON object of the form:',
    '{"clips":[{"start":<sec>,"end":<sec>,"title":"<<=60 chars>","hook":"<the scroll-stopping opening line>","rationale":"<why this clip is engaging>","transcript_excerpt":"<verbatim text in range>","score":<1-10>}]}',
    'No prose outside the JSON. No markdown fences.',
  ].filter(Boolean).join('\n')

  return { prompt, truncated }
}

module.exports = { BUCKETS, resolveBucket, buildClipPrompt, TRANSCRIPT_CHAR_CAP }
