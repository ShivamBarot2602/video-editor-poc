/**
 * Centralized prompt builders for the thumbnail-polish stage.
 * Both Gemini 2.5 Flash Image and OpenAI gpt-image-1 receive the same
 * style brief — provider-specific assembly happens in the polish wrappers.
 */

// ── Shared polish intent ─────────────────────────────────────────────────────
// Both image providers get the SAME goal, edit direction, headline spec, and
// negatives so their outputs stay visually consistent. Only the "what to
// preserve" clause is provider-tuned (PRESERVE below): gpt-image takes an
// explicit face/identity lock (allowed by the edits API, reinforced by
// input_fidelity:high), while Gemini's image model BLOCKS that phrasing
// (promptFeedback.blockReason 'OTHER', person-manipulation rule) so it gets
// scene-level wording instead.

// What the model should improve. Identical for both providers.
const EDIT_DIRECTION =
  'boost the lighting, contrast, color vibrance, and overall sharpness, and ' +
  'tidy or lightly stylize the background to cut visual clutter while keeping the setting recognizable.'

// Headline spec — constrained so the overlay is stable run-to-run: fixed length,
// case, weight, and placement, and "the only text in the image". Identical for both.
const HEADLINE_SPEC = [
  'Add exactly ONE short headline of 2-4 words, in ALL CAPS.',
  'Make it large, bold, sans-serif, and high-contrast with a subtle dark scrim or outline so it stays legible.',
  'Place it in a clear empty area (top or bottom third) — it must NOT cover any face.',
  'This headline is the ONLY text in the image: no other words, captions, logos, watermarks, or URLs.',
].join(' ')

// Things to keep out of the frame.
const NEGATIVES =
  'Avoid: extra or distorted hands and fingers, duplicate or garbled text, watermarks, logos, website URLs, and visual clutter.'

const ASPECT_INSTRUCTIONS = {
  landscape: 'Output orientation: LANDSCAPE (wider than tall, approximately 16:9). Match the original frame\'s landscape framing.',
  portrait:  'Output orientation: PORTRAIT (taller than wide, approximately 9:16). Optimized for vertical short-form feeds.',
  square:    'Output orientation: SQUARE (1:1). Optimized for square feed cards.',
  unknown:   'Output orientation: match the input frame\'s aspect ratio exactly.',
}

// Provider-tuned PRESERVE clause — the one place the two prompts diverge.
const PRESERVE = {
  // gpt-image edits API: explicit invariant list (guide-recommended
  // "change only X / keep everything else the same"). Safe here — the edits API
  // has no person-manipulation block, and input_fidelity:high reinforces it.
  openai:
    'Keep everything else identical — do NOT change the person\'s face, facial features, ' +
    'skin tone, identity, expression, pose, body shape, hair, clothing, camera angle, or composition/framing.',
  // Gemini image model: scene-level only. NEVER say face / identity / facial
  // features here — that phrasing trips the person-manipulation block.
  gemini:
    'Keep the same overall scene, composition, framing, camera angle, and the same people ' +
    'in the same positions and poses, and do not change the input aspect ratio.',
}

/**
 * Optional context line that grounds the headline wording in the video.
 */
function buildPolishContext({ filename, transcriptHint } = {}) {
  const bits = []
  if (filename) bits.push(`Source video: "${filename}".`)
  if (transcriptHint) {
    const clipped = String(transcriptHint).trim().slice(0, 220)
    if (clipped) bits.push(`What the video is about: "${clipped}".`)
  }
  return bits.length ? 'Base the headline wording on the video context: ' + bits.join(' ') : ''
}

/**
 * Build a thumbnail-polish prompt, tuned per image provider.
 *
 * Shared across providers: the thumbnail goal, EDIT_DIRECTION, HEADLINE_SPEC,
 * NEGATIVES, and aspect line — so the two outputs look consistent. Only the
 * PRESERVE clause and overall phrasing differ (gpt-image likes labeled segments
 * + explicit invariants; Gemini likes one conversational scene description).
 *
 * @param {object} opts
 * @param {'openai'|'gemini'} [opts.provider='openai'] - picks the preserve clause + phrasing
 * @param {string} [opts.filename]       - original video filename (semantic hint)
 * @param {string} [opts.transcriptHint] - first ~200 chars of transcript, if any
 * @param {string} [opts.styleBrief]     - override EDIT_DIRECTION
 * @param {'landscape'|'portrait'|'square'|'unknown'} [opts.aspect='unknown']
 * @returns {string}
 */
function buildPolishPrompt({ provider = 'openai', filename, transcriptHint, styleBrief, aspect = 'unknown' } = {}) {
  const aspectLine = ASPECT_INSTRUCTIONS[aspect] || ASPECT_INSTRUCTIONS.unknown
  const edit = styleBrief || EDIT_DIRECTION
  const preserve = PRESERVE[provider] || PRESERVE.openai
  const context = buildPolishContext({ filename, transcriptHint })

  if (provider === 'gemini') {
    // Single conversational scene description — Nano Banana responds best to this.
    return [
      'Polish this still into a vibrant, scroll-stopping short-form video thumbnail for Reels / Shorts / TikTok.',
      '',
      `${preserve} Then ${edit}`,
      '',
      HEADLINE_SPEC,
      context,
      '',
      aspectLine,
      '',
      NEGATIVES,
    ].filter(Boolean).join('\n')
  }

  // gpt-image: labeled segments + explicit invariants (guide-recommended).
  return [
    'Task: polish this video still into a vibrant, scroll-stopping short-form video thumbnail (Reels / Shorts / TikTok).',
    '',
    `Edit — change ONLY this: ${edit}`,
    '',
    preserve,
    '',
    `Headline text: ${HEADLINE_SPEC}`,
    context,
    '',
    aspectLine,
    '',
    NEGATIVES,
    '',
    'Return a single polished image.',
  ].filter(Boolean).join('\n')
}

// Back-compat export name kept for any external imports
const DEFAULT_STYLE_BRIEF = EDIT_DIRECTION

/**
 * Static SYSTEM prompt for the rerank stage — role, scoring criteria, ordering.
 * Holds NO per-request values (count/labels/context live in the user prompt) so
 * it stays byte-identical across calls. The output JSON shape differs per
 * provider (Gemini: bare array; OpenAI: {scores:[…]} for strict schema), so each
 * rerank wrapper appends its own shape line rather than baking it in here.
 *
 * @returns {string}
 */
function buildRerankSystemPrompt() {
  return [
    'You are evaluating candidate frames from a short-form video for use as a thumbnail.',
    'The images are presented in order, each labeled with a letter (A, B, C, ...).',
    '',
    'For each image, score it 1–10 on overall thumbnail quality. Consider:',
    '- Face visibility, eye contact, expression strength',
    '- Sharpness and absence of motion blur',
    '- Composition, framing, and a clear visual subject',
    '- Avoid frames that look like transitions or have closed eyes',
    '- Avoid washed-out, over/under-exposed, or low-contrast frames',
    '',
    'Score one entry per image, in the SAME ORDER as presented, each with a one-sentence rationale.',
  ].join('\n')
}

/**
 * Dynamic USER prompt for the rerank stage — per-request count, labels, and the
 * filename/transcript context. The candidate images are appended after this text
 * by the caller (in label order).
 *
 * @param {object} opts
 * @param {number} opts.count            - number of candidate frames
 * @param {string} [opts.filename]       - source video filename (semantic hint)
 * @param {string} [opts.transcriptHint] - first ~200 chars of transcript, if any
 * @returns {string}
 */
function buildRerankUserPrompt({ count, filename, transcriptHint } = {}) {
  const labels = Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i)).join(', ')
  const contextLines = []
  if (filename) contextLines.push(`Source video filename: "${filename}".`)
  if (transcriptHint) {
    const clipped = String(transcriptHint).trim().slice(0, 220)
    if (clipped) contextLines.push(`Transcript excerpt: "${clipped}".`)
  }

  return [
    `Evaluate these ${count} candidate frames, labeled: ${labels}.`,
    contextLines.length ? '\nContext:\n' + contextLines.join('\n') : '',
    '\nThe images follow in label order.',
  ].filter(Boolean).join('\n')
}

module.exports = { buildPolishPrompt, buildRerankSystemPrompt, buildRerankUserPrompt, DEFAULT_STYLE_BRIEF }
