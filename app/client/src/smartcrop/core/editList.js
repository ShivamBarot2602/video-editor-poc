// Edit-list helpers (spec 00 §7, 05 §3). Pure — no React, no fetch.
//
// The POC only produces the identity edit (one clip 0 → durationMs, layout
// null): aspect/layout changes rebuild it instead of touching clips.

export const ASPECTS = ['9:16', '4:5', '1:1', '16:9']

// Copy of the pipeline's LAYOUT_SUPPORT (00 §3). The editor passes
// `capabilities.layoutsByAspect` from GET /editor; this is the fallback.
export const LAYOUTS_BY_ASPECT = {
  '9:16': ['fill', 'fit', 'split', 'three', 'four'],
  '4:5': ['fill', 'fit', 'split'],
  '1:1': ['fill', 'fit', 'split'],
  '16:9': ['fill', 'fit', 'split'],
}

export const FALLBACK_LAYOUT = 'fill'
export const DEFAULT_OPTIONS = { background: 'blur', fallbackLayout: 'fill' }
export const IDENTITY_CLIP_ID = 'c_1'

export function supportedLayouts(aspect, layoutsByAspect = LAYOUTS_BY_ASPECT) {
  return layoutsByAspect?.[aspect] || []
}

export function isLayoutSupported(aspect, layout, layoutsByAspect = LAYOUTS_BY_ASPECT) {
  return supportedLayouts(aspect, layoutsByAspect).includes(layout)
}

export function identityEdit(durationMs, aspect, layout, options = DEFAULT_OPTIONS) {
  return {
    schemaVersion: 1,
    aspect,
    defaultLayout: layout,
    options: { ...DEFAULT_OPTIONS, ...options },
    clips: [{ id: IDENTITY_CLIP_ID, sourceStartMs: 0, sourceEndMs: Math.round(durationMs), layout: null }],
  }
}

// Same definition as the server's feature check (03 §1): one full-length clip
// whose layout is null or equal to the default.
export function isIdentityEdit(doc, durationMs) {
  const clips = doc?.clips
  if (!Array.isArray(clips) || clips.length !== 1) return false
  const [clip] = clips
  return clip.sourceStartMs === 0
    && clip.sourceEndMs === durationMs
    && (clip.layout == null || clip.layout === doc.defaultLayout)
}

// 05 §3.1: identity edit with the new aspect, keeping the current layout when
// that aspect allows it, else `fill`. Options carry over.
export function withAspect(doc, aspect, durationMs, layoutsByAspect = LAYOUTS_BY_ASPECT) {
  const layout = isLayoutSupported(aspect, doc.defaultLayout, layoutsByAspect)
    ? doc.defaultLayout
    : FALLBACK_LAYOUT
  return identityEdit(durationMs, aspect, layout, doc.options)
}

// An unsupported layout returns `doc` unchanged, so a click on a disabled
// button can never produce an invalid edit.
export function withLayout(doc, layout, durationMs, layoutsByAspect = LAYOUTS_BY_ASPECT) {
  if (!isLayoutSupported(doc.aspect, layout, layoutsByAspect)) return doc
  return identityEdit(durationMs, doc.aspect, layout, doc.options)
}

export function outputDurationMs(doc) {
  return (doc?.clips || []).reduce((sum, clip) => sum + (clip.sourceEndMs - clip.sourceStartMs), 0)
}
