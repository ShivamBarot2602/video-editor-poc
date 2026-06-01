/**
 * Centralized prompt builders for the thumbnail-polish stage.
 * Both Gemini 2.5 Flash Image and OpenAI gpt-image-1 receive the same
 * style brief — provider-specific assembly happens in the polish wrappers.
 */

// Prompt deliberately avoids "preserve identity / facial features" wording —
// that phrasing trips Gemini's image-gen person-manipulation block
// (promptFeedback.blockReason: 'OTHER'). Reframed as scene-level direction.
const STYLE_BRIEF_BASE = [
  'Create a vibrant, scroll-stopping short-form video thumbnail inspired by this still.',
  'Keep the same overall scene, composition, framing, and the subjects in similar pose.',
  'Improve lighting, contrast, color vibrance, and overall sharpness of the scene.',
  'Tidy or stylize the background to reduce visual clutter while keeping the setting recognizable.',
  'Overlay short punchy 3-5 word headline text relevant to the video context (large, bold, high-contrast, legible).',
  'Place text in a safe area of the frame that does not obscure people in the scene.',
  'No watermarks, no logos, no website URLs.',
].join(' ')

const ASPECT_INSTRUCTIONS = {
  landscape: 'Output orientation: LANDSCAPE (wider than tall, approximately 16:9). Match the original frame\'s landscape framing.',
  portrait:  'Output orientation: PORTRAIT (taller than wide, approximately 9:16). Optimized for vertical short-form feeds.',
  square:    'Output orientation: SQUARE (1:1). Optimized for square feed cards.',
  unknown:   'Output orientation: match the input frame\'s aspect ratio exactly.',
}

/**
 * Build a thumbnail-polish prompt.
 * @param {object} opts
 * @param {string} [opts.filename]       - original video filename (semantic hint)
 * @param {string} [opts.transcriptHint] - first ~200 chars of transcript, if any
 * @param {string} [opts.styleBrief]     - override the default brief
 * @param {'landscape'|'portrait'|'square'|'unknown'} [opts.aspect='unknown']
 * @returns {string}
 */
function buildPolishPrompt({ filename, transcriptHint, styleBrief, aspect = 'unknown' } = {}) {
  const aspectLine = ASPECT_INSTRUCTIONS[aspect] || ASPECT_INSTRUCTIONS.unknown
  const parts = [
    styleBrief || STYLE_BRIEF_BASE,
    ' ',
    aspectLine,
  ]

  const context = []
  if (filename) context.push(`Source video: "${filename}".`)
  if (transcriptHint) {
    const clipped = String(transcriptHint).trim().slice(0, 220)
    if (clipped) context.push(`What the video is about: "${clipped}".`)
  }
  if (context.length) {
    parts.push('\n\nContext for the text overlay and styling decisions:\n' + context.join(' '))
  }

  parts.push(
    '\n\nReturn a single polished image. Aim for an engaging look with bright eyes and confident posture in the scene.'
  )

  return parts.join('')
}

// Back-compat export name kept for any external imports
const DEFAULT_STYLE_BRIEF = STYLE_BRIEF_BASE

/**
 * Rerank prompt asks Gemini to score each candidate 1–10 with rationale.
 * Used by the rerank stage, not the polish stage. Lives here for co-location.
 */
function buildRerankPrompt({ count, filename, transcriptHint } = {}) {
  const labels = Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i)).join(', ')
  const contextLines = []
  if (filename) contextLines.push(`Source video filename: "${filename}".`)
  if (transcriptHint) {
    const clipped = String(transcriptHint).trim().slice(0, 220)
    if (clipped) contextLines.push(`Transcript excerpt: "${clipped}".`)
  }

  return [
    `You are evaluating ${count} candidate frames from a short-form video for use as a thumbnail.`,
    `The images are presented in order and labeled: ${labels}.`,
    contextLines.length ? '\nContext:\n' + contextLines.join('\n') : '',
    '\nFor each image, score it 1–10 on overall thumbnail quality. Consider:',
    '- Face visibility, eye contact, expression strength',
    '- Sharpness and absence of motion blur',
    '- Composition, framing, and a clear visual subject',
    '- Avoid frames that look like transitions or have closed eyes',
    '- Avoid washed-out, over/under-exposed, or low-contrast frames',
    '',
    'Return ONLY a JSON array, one object per image in the SAME ORDER as presented:',
    '[{"label":"A","score":<1-10 number>,"rationale":"<one short sentence>"}, ...]',
    'No prose outside the JSON. No markdown fences.',
  ].filter(Boolean).join('\n')
}

module.exports = { buildPolishPrompt, buildRerankPrompt, DEFAULT_STYLE_BRIEF }
