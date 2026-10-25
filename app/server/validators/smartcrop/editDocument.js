/**
 * Edit document validation + helpers (spec 03 §1, 00 §7).
 *
 * validateEditDocument(input, { durationMs, minClipMs, maxClips })
 *   → { value, issues, ruleIssues }
 *   issues      shape problems → 400 VALIDATION_ERROR (rules are not checked then)
 *   ruleIssues  [{ path, rule, message }] → 422 EDIT_INVALID (all collected)
 *   value       the normalised document (options defaults filled, clip order
 *               kept) when both lists are empty.
 *
 * Pass durationMs = null to run the shape check only.
 */

const {
  ASPECTS, LAYOUTS, LAYOUT_SUPPORT, BACKGROUNDS, FALLBACK_LAYOUTS, DEFAULT_OPTIONS, CLIP_ID_RE, MIN_OUTPUT_MS,
} = require('../../config/smartcropConstants')
const { isPlainObject, checkUnknown, isInt } = require('./common')

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/
const TOP_FIELDS = ['schemaVersion', 'aspect', 'defaultLayout', 'options', 'clips']
const OPTION_FIELDS = ['background', 'fallbackLayout']
const CLIP_FIELDS = ['id', 'sourceStartMs', 'sourceEndMs', 'layout']

function shapeCheck(input, base) {
  const issues = []
  const p = (k) => (base ? `${base}.${k}` : k)
  if (!isPlainObject(input)) {
    issues.push({ path: base || '', message: 'Edit document must be an object.' })
    return issues
  }
  checkUnknown(input, TOP_FIELDS, base, issues)

  if (input.schemaVersion !== 1) issues.push({ path: p('schemaVersion'), message: 'Must be the integer 1.' })
  if (!ASPECTS.includes(input.aspect)) issues.push({ path: p('aspect'), message: `Must be one of ${ASPECTS.join(', ')}.` })
  if (!LAYOUTS.includes(input.defaultLayout)) issues.push({ path: p('defaultLayout'), message: `Must be one of ${LAYOUTS.join(', ')}.` })

  if (input.options !== undefined && input.options !== null) {
    if (!isPlainObject(input.options)) issues.push({ path: p('options'), message: 'Must be an object.' })
    else {
      checkUnknown(input.options, OPTION_FIELDS, p('options'), issues)
      const bg = input.options.background
      if (bg !== undefined && bg !== null && !BACKGROUNDS.includes(bg) && !(typeof bg === 'string' && HEX_COLOR_RE.test(bg))) {
        issues.push({ path: p('options.background'), message: 'Must be null, "blur", "black" or a #RRGGBB colour.' })
      }
      const fb = input.options.fallbackLayout
      if (fb !== undefined && fb !== null && !FALLBACK_LAYOUTS.includes(fb)) {
        issues.push({ path: p('options.fallbackLayout'), message: 'Must be null, "fill" or "fit".' })
      }
    }
  }

  if (!Array.isArray(input.clips) || input.clips.length < 1) {
    issues.push({ path: p('clips'), message: 'Must be a non-empty array.' })
    return issues
  }
  input.clips.forEach((c, i) => {
    const cp = p(`clips.${i}`)
    if (!isPlainObject(c)) {
      issues.push({ path: cp, message: 'Must be an object.' })
      return
    }
    checkUnknown(c, CLIP_FIELDS, cp, issues)
    if (typeof c.id !== 'string' || !CLIP_ID_RE.test(c.id)) {
      issues.push({ path: `${cp}.id`, message: 'Must be 1–40 letters, digits, _ or -.' })
    }
    if (!isInt(c.sourceStartMs) || c.sourceStartMs < 0) issues.push({ path: `${cp}.sourceStartMs`, message: 'Must be an integer ≥ 0.' })
    if (!isInt(c.sourceEndMs) || c.sourceEndMs < 0) issues.push({ path: `${cp}.sourceEndMs`, message: 'Must be an integer ≥ 0.' })
    if (c.layout !== undefined && c.layout !== null && !LAYOUTS.includes(c.layout)) {
      issues.push({ path: `${cp}.layout`, message: `Must be null or one of ${LAYOUTS.join(', ')}.` })
    }
  })
  return issues
}

function normalise(input) {
  const o = input.options || {}
  return {
    schemaVersion: 1,
    aspect: input.aspect,
    defaultLayout: input.defaultLayout,
    options: {
      background: o.background ?? DEFAULT_OPTIONS.background,
      fallbackLayout: o.fallbackLayout ?? DEFAULT_OPTIONS.fallbackLayout,
    },
    clips: input.clips.map(c => ({
      id: c.id,
      sourceStartMs: c.sourceStartMs,
      sourceEndMs: c.sourceEndMs,
      layout: c.layout ?? null,
    })),
  }
}

function ruleCheck(doc, { durationMs, minClipMs, maxClips }) {
  const issues = []
  const supported = LAYOUT_SUPPORT[doc.aspect]
  const add = (path, rule, message) => issues.push({ path, rule, message })

  if (!supported.includes(doc.defaultLayout)) {
    add('defaultLayout', 'LAYOUT_NOT_SUPPORTED', `The ${doc.defaultLayout} layout is not available for ${doc.aspect}.`)
  }
  if (doc.clips.length > maxClips) add('clips', 'TOO_MANY_CLIPS', `At most ${maxClips} clips are allowed.`)

  const seen = new Set()
  const rangeOk = []
  doc.clips.forEach((c, i) => {
    if (c.layout !== null && !supported.includes(c.layout)) {
      add(`clips.${i}.layout`, 'LAYOUT_NOT_SUPPORTED', `The ${c.layout} layout is not available for ${doc.aspect}.`)
    }
    if (seen.has(c.id)) add(`clips.${i}.id`, 'CLIP_ID_DUPLICATE', `Clip id "${c.id}" is used more than once.`)
    seen.add(c.id)

    const ok = c.sourceStartMs < c.sourceEndMs && c.sourceEndMs <= durationMs
    rangeOk[i] = ok
    if (!ok) {
      add(`clips.${i}.sourceEndMs`, 'CLIP_RANGE_INVALID',
        c.sourceEndMs > durationMs
          ? `Clip ends after the video (${durationMs} ms).`
          : 'Clip must end after it starts.')
    } else if (c.sourceEndMs - c.sourceStartMs < minClipMs) {
      add(`clips.${i}`, 'CLIP_TOO_SHORT', `Clips must be at least ${minClipMs} ms long.`)
    }
  })

  // Overlap: sort a copy by start; each start must be ≥ the furthest end so far.
  // Report the later clip by its original index. Clips with an invalid range
  // are already reported and skipped here.
  const sorted = doc.clips
    .map((c, i) => ({ ...c, i }))
    .filter(c => c.sourceStartMs < c.sourceEndMs)
    .sort((a, b) => a.sourceStartMs - b.sourceStartMs || a.sourceEndMs - b.sourceEndMs || a.i - b.i)
  let maxEnd = -Infinity
  for (const c of sorted) {
    if (c.sourceStartMs < maxEnd) add(`clips.${c.i}`, 'CLIPS_OVERLAP', 'This clip overlaps another clip.')
    maxEnd = Math.max(maxEnd, c.sourceEndMs)
  }

  const total = outputDurationMs(doc)
  if (total < MIN_OUTPUT_MS) add('clips', 'OUTPUT_TOO_SHORT', `The edit must be at least ${MIN_OUTPUT_MS} ms long.`)

  return issues
}

function validateEditDocument(input, { durationMs = null, minClipMs = 200, maxClips = 500, base = '' } = {}) {
  const issues = shapeCheck(input, base)
  if (issues.length) return { value: null, issues, ruleIssues: [] }
  const doc = normalise(input)
  if (durationMs == null) return { value: doc, issues, ruleIssues: [] }
  const ruleIssues = ruleCheck(doc, { durationMs, minClipMs, maxClips })
  return { value: ruleIssues.length ? null : doc, issues, ruleIssues }
}

// ─── helpers used by preview / render ─────────────────────────────────────────

const effectiveLayout = (doc, clip) => clip.layout ?? doc.defaultLayout

function outputDurationMs(doc) {
  return doc.clips.reduce((sum, c) => sum + Math.max(0, c.sourceEndMs - c.sourceStartMs), 0)
}

// Distinct effective layouts, sorted.
function effectiveLayouts(doc) {
  return [...new Set(doc.clips.map(c => effectiveLayout(doc, c)))].sort()
}

// One full-length clip, effective layout = default (00 §7). Aspect / default
// layout are free — identity just means "no cut / trim / reorder / per-clip layout".
function isIdentityEdit(doc, durationMs) {
  if (doc.clips.length !== 1) return false
  const c = doc.clips[0]
  return c.sourceStartMs === 0 && c.sourceEndMs === durationMs && effectiveLayout(doc, c) === doc.defaultLayout
}

function identityEdit({ aspect, layout, durationMs }) {
  return {
    schemaVersion: 1,
    aspect,
    defaultLayout: layout,
    options: { ...DEFAULT_OPTIONS },
    clips: [{ id: 'c_1', sourceStartMs: 0, sourceEndMs: durationMs, layout: null }],
  }
}

module.exports = {
  validateEditDocument,
  normalise,
  effectiveLayout,
  effectiveLayouts,
  outputDurationMs,
  isIdentityEdit,
  identityEdit,
}
