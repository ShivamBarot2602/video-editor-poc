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
 * Static SYSTEM prompt — role, rules, edge-case guidance, output shape.
 * No per-request numbers live here so it stays byte-identical across calls,
 * which lets OpenAI prefix-cache and Gemini implicit-cache it. The actual
 * COUNT / LENGTH RANGE / DURATION arrive in the user message.
 *
 * @returns {string}
 */
function buildClipSystemPrompt() {
  return [
    'You are a **short-form video editor**. You read a long video\'s transcript and pick its most **engaging** clips for Reels / Shorts / TikTok.',
    '',
    '**GOAL** — pick clips a viewer would stop scrolling for. Each clip must:',
    '- open with a **scroll-stopping hook** in its first seconds,',
    '- **stand alone** (make sense without the rest of the video),',
    '- carry a clear emotional or curiosity payload, or a quotable line.',
    '',
    '**HARD RULES**',
    '- Return **exactly** the COUNT given in the user message, ranked **best first**.',
    '- `start`/`end` are in **seconds**. Enforce `0 <= start < end <= DURATION`.',
    '- Each clip length (`end - start`) must fall inside the given **LENGTH RANGE**.',
    '- Clips must **not overlap**.',
    '- **Snap** `start`/`end` to the segment boundaries (`[index] start-end`) in the transcript — never cut mid-sentence.',
    '- `transcript_excerpt` must be the **verbatim** transcript text inside the range — never invent words.',
    '- `score` is an integer **1-10** for expected engagement.',
    '',
    '**EDGE CASES** (follow these, do not guess):',
    '- Too few strong moments, or transcript shorter than the range → return **fewer** clips. Never pad weak ones, never exceed DURATION.',
    '- Whole video already short → **one tight clip** beats three filler ones.',
    '- Sparse or empty transcript → return `{"clips":[]}`.',
    '- Unsure where a clip should end → prefer the **wider** segment-aligned cut so the thought is complete.',
    '- Hook lives mid-segment → still start the clip at the **segment boundary**, not mid-word.',
    '',
    '**OUTPUT** — return **only** this JSON. No prose. No markdown fences.',
    '{"clips":[{"start":<sec>,"end":<sec>,"title":"<=60 chars","hook":"opening line","rationale":"why it is engaging","transcript_excerpt":"verbatim text in range","score":<1-10>}]}',
  ].join('\n')
}

/**
 * Dynamic USER prompt — per-request constraints + the transcript itself.
 *
 * @param {object} opts
 * @param {Array}  opts.segments      - transcription segments [{start,end,speaker,text,text_edited}]
 * @param {string} opts.bucket        - bucket key (auto|short|medium|long)
 * @param {number} opts.count         - desired clip count (3-5)
 * @param {number} opts.videoDuration - total video duration in seconds
 * @param {string} [opts.language]
 * @param {string} [opts.filename]
 * @returns {{ text: string, truncated: boolean }}
 */
function buildClipUserPrompt({ segments, bucket, count, videoDuration, language, filename } = {}) {
  const b = resolveBucket(bucket)
  const maxLen = Math.min(b.max, Math.max(2, Math.floor(videoDuration)))
  const { lines, truncated } = buildSegmentLines(segments)

  const ctx = [`duration ${videoDuration.toFixed(1)}s`]
  if (language) ctx.push(`language ${language}`)

  const text = [
    filename ? `**VIDEO**: "${filename}" · ${ctx.join(' · ')}` : `**VIDEO**: ${ctx.join(' · ')}`,
    `**COUNT**: ${count} clips`,
    `**LENGTH RANGE**: ${b.min}-${maxLen} seconds per clip`,
    `**DURATION**: ${videoDuration.toFixed(1)} seconds (never exceed)`,
    truncated ? '_(transcript down-sampled to fit — gaps in indices are expected)_' : '',
    '',
    '**TRANSCRIPT** — one line per segment, `[index] start-end speaker: text`:',
    lines,
  ].filter(Boolean).join('\n')

  return { text, truncated }
}

// ── Video-understanding method ───────────────────────────────────────────────
// The model watches the actual video (audio + frames) instead of reading a
// transcript. Same system/user split convention as the thumbnail rerank/polish
// prompts: the SYSTEM builder holds only static rules (no per-request numbers),
// and the geminiVideo wrapper appends the JSON-shape line so the system text
// stays byte-identical (implicit-cacheable). COUNT / LENGTH RANGE / DURATION
// arrive in the user message.

/**
 * Static SYSTEM prompt for the video-understanding clip method — role, rules,
 * field meanings, edge cases AND the output-shape line. Whole thing is built
 * here so providers never concatenate prompt strings. No per-request values, so
 * it stays byte-identical across calls (implicit-cacheable).
 * @returns {string}
 */
function buildVideoClipSystemPrompt() {
  return [
    'You are a **short-form video editor**. You **watch** a long video — its visuals AND its audio — and pick the most **engaging** clips for Reels / Shorts / TikTok.',
    '',
    '**GOAL** — pick clips a viewer would stop scrolling for. Each clip must:',
    '- open with a **scroll-stopping hook** in its first seconds (spoken line OR a striking visual),',
    '- **stand alone** (make sense without the rest of the video),',
    '- carry a clear emotional or curiosity payload, a quotable line, or strong visual action.',
    '',
    '**HARD RULES**',
    '- Return **exactly** the COUNT given in the user message, ranked **best first**.',
    '- `start`/`end` are **numbers in seconds** (not "MM:SS"). Enforce `0 <= start < end <= DURATION`.',
    '- Each clip length (`end - start`) must fall inside the given **LENGTH RANGE**.',
    '- Clips must **not overlap**.',
    '- End a clip on a natural beat (sentence/scene end) — never cut mid-word.',
    '- `thumbnails` = **exactly 3 numbers in seconds**, each **inside that clip\'s `[start, end]`**, at the most visually striking moments (clear face / peak action / on-screen text). Spread them across the clip; do not return identical times.',
    '- `score` is an integer **1-10** for expected engagement.',
    '',
    '**FIELD MEANINGS**',
    '- `title` — punchy label, <=60 chars.',
    '- `hook` — the on-screen / caption hook line that makes someone stop (1 sentence).',
    '- `caption` — a ready-to-post social caption (1-2 sentences, optional hashtags).',
    '- `reason` — why this moment stops the scroll (visual + audio cues you saw).',
    '',
    '**EDGE CASES** (follow these, do not guess):',
    '- Too few strong moments → return **fewer** clips. Never pad weak ones, never exceed DURATION.',
    '- Whole video already short → **one tight clip** beats three filler ones.',
    '- Nothing engaging at all → return an empty clips list.',
    '- Unsure where a clip should end → prefer the **wider** cut so the thought/action is complete.',
    '',
    '**OUTPUT** — return **only** this JSON object. No prose. No markdown fences.',
    '{"clips":[{"start":<sec>,"end":<sec>,"title":"<=60 chars","hook":"opening line","caption":"ready-to-post caption","reason":"why it stops the scroll","score":<1-10>,"thumbnails":[<sec>,<sec>,<sec>]}]}',
  ].join('\n')
}

/**
 * Dynamic USER prompt for the video-understanding method — per-request only.
 * The video file part is appended to the same user turn by the wrapper.
 *
 * @param {object} opts
 * @param {string} opts.bucket        - bucket key (auto|short|medium|long)
 * @param {number} opts.count         - desired clip count (3-5)
 * @param {number} opts.videoDuration - total video duration in seconds
 * @param {string} [opts.language]
 * @param {string} [opts.filename]
 * @returns {string}
 */
function buildVideoClipUserPrompt({ bucket, count, videoDuration, language, filename } = {}) {
  const b = resolveBucket(bucket)
  const maxLen = Math.min(b.max, Math.max(2, Math.floor(videoDuration)))
  const ctx = [`duration ${videoDuration.toFixed(1)}s`]
  if (language) ctx.push(`language ${language}`)

  return [
    filename ? `**VIDEO**: "${filename}" · ${ctx.join(' · ')}` : `**VIDEO**: ${ctx.join(' · ')}`,
    `**COUNT**: ${count} clips`,
    `**LENGTH RANGE**: ${b.min}-${maxLen} seconds per clip`,
    `**DURATION**: ${videoDuration.toFixed(1)} seconds (never exceed)`,
    '',
    'Watch the attached video and return the clips now.',
  ].join('\n')
}

module.exports = {
  BUCKETS, resolveBucket, buildClipSystemPrompt, buildClipUserPrompt, TRANSCRIPT_CHAR_CAP,
  buildVideoClipSystemPrompt, buildVideoClipUserPrompt,
}
