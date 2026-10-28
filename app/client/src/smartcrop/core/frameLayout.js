// Plan → canvas drawing (spec 05 §4). Pure: the caller hands in the 2D context
// and the <video>; nothing here touches React or the document.
//
// Plan file fields used (03 §4):
//   canvas { width, height }       output size; panel rects live in this space
//   analysis_fps, frames           frame f covers output time [f, f+1) × 40 ms
//   source { width, height }       pixel space of the crop windows
//   segments[] { start, end, layout, background, panels[] }   frames [start, end)
//   panels[] { rect: [x,y,w,h], person, crop: [[x,y,w,h], …] } one crop per segment frame

export const DEFAULT_FPS = 25
export const BLUR_FILTER = 'blur(24px)'
const BLACK = '#000000'

// currentTime × 1000 isn't exact (0.12 s → 119.99999…); without this nudge a
// frame boundary would resolve to the previous frame.
const FLOAT_EPSILON = 1e-6

// ── Small pure helpers (exported for tests and future editors) ───────────────

export function frameDurationMs(plan) {
  const fps = Number(plan?.analysis_fps)
  return 1000 / (fps > 0 ? fps : DEFAULT_FPS)
}

// Output frame shown at `tMs`, clamped to [0, frames − 1].
export function frameIndex(plan, tMs) {
  const lastFrame = Math.max(0, (plan?.frames ?? 1) - 1)
  const f = Math.floor((Number(tMs) || 0) / frameDurationMs(plan) + FLOAT_EPSILON)
  return Math.min(Math.max(f, 0), lastFrame)
}

// Binary search (segments are sorted and non-overlapping) for start ≤ f < end.
// -1 if `f` falls in a gap or outside every segment.
export function findSegmentIndex(segments, f) {
  let lo = 0
  let hi = (segments?.length ?? 0) - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const { start, end } = segments[mid]
    if (f < start) hi = mid - 1
    else if (f >= end) lo = mid + 1
    else return mid
  }
  return -1
}

// 'blur' → { type: 'blur' }; '#RRGGBB' → { type: 'color', color }; else black.
export function parseBackground(background) {
  if (background === 'blur') return { type: 'blur' }
  if (typeof background === 'string' && /^#[0-9a-fA-F]{6}$/.test(background)) {
    return { type: 'color', color: background }
  }
  return { type: 'color', color: BLACK }
}

// Scale a w×h image to cover a W×H box, centred → [x, y, w, h].
export function coverRect(w, h, W, H) {
  const scale = Math.max(W / w, H / h)
  const dw = w * scale
  const dh = h * scale
  return [(W - dw) / 2, (H - dh) / 2, dw, dh]
}

// Clip a source rect to the video's bounds [0, 0, boundsW, boundsH] and shrink
// the destination rect by the same proportions — a crop window hanging off the
// frame then leaves background visible instead of stretching. Returns
// { src, dst }, or null when nothing of the crop is inside the frame.
export function clipToBounds(src, dst, boundsW, boundsH) {
  const [sx, sy, sw, sh] = src
  const [dx, dy, dw, dh] = dst
  if (!(sw > 0 && sh > 0 && dw > 0 && dh > 0)) return null

  const left = Math.max(sx, 0)
  const top = Math.max(sy, 0)
  const right = Math.min(sx + sw, boundsW)
  const bottom = Math.min(sy + sh, boundsH)
  if (right <= left || bottom <= top) return null

  const scaleX = dw / sw
  const scaleY = dh / sh
  return {
    src: [left, top, right - left, bottom - top],
    dst: [dx + (left - sx) * scaleX, dy + (top - sy) * scaleY, (right - left) * scaleX, (bottom - top) * scaleY],
  }
}

const isRect = (r) => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite)

// ── Layout for one frame ─────────────────────────────────────────────────────

// Crop window for frame `index` of the segment, mapped into video pixels.
// A crop array shorter than the segment (shouldn't happen) holds its last
// window. { src: null, dst: null } = nothing to draw for this panel.
function resolvePanel(panel, index, scale, video) {
  const resolved = { person: panel.person ?? null, rect: panel.rect, src: null, dst: null }
  const crops = panel.crop
  if (!isRect(panel.rect) || !Array.isArray(crops) || crops.length === 0) return resolved

  const crop = crops[Math.min(index, crops.length - 1)]
  if (!isRect(crop)) return resolved

  const src = [crop[0] * scale.x, crop[1] * scale.y, crop[2] * scale.x, crop[3] * scale.y]
  if (!video) return { ...resolved, src, dst: panel.rect }

  const clipped = clipToBounds(src, panel.rect, video.width, video.height)
  return clipped ? { ...resolved, ...clipped } : resolved
}

/**
 * Everything needed to draw output time `tMs`, without touching a canvas.
 *
 * `video` = { width, height } of what is actually playing. The proxy is
 * smaller than the source the plan was computed on, so crops are scaled by
 * video / plan.source. Omit it to get crops in plan source pixels, unclipped.
 *
 * → null when the plan has no segment for this time, else
 *   { frame, segmentIndex, segment, index, layout, canvas, background,
 *     panels: [{ person, rect, src, dst }] }
 */
export function getFrameLayout(plan, tMs, video) {
  const segments = plan?.segments
  if (!Array.isArray(segments) || segments.length === 0) return null

  const frame = frameIndex(plan, tMs)
  const segmentIndex = findSegmentIndex(segments, frame)
  if (segmentIndex < 0) return null

  const segment = segments[segmentIndex]
  const index = frame - segment.start
  const scale = {
    x: video ? video.width / (plan.source?.width || video.width) : 1,
    y: video ? video.height / (plan.source?.height || video.height) : 1,
  }

  return {
    frame,
    segmentIndex,
    segment,
    index,
    layout: segment.layout ?? null,
    canvas: { width: plan.canvas?.width ?? 0, height: plan.canvas?.height ?? 0 },
    background: parseBackground(segment.background),
    panels: (segment.panels || []).map((panel) => resolvePanel(panel, index, scale, video)),
  }
}

// ── Drawing ──────────────────────────────────────────────────────────────────

// A panel spanning the whole canvas hides the background.
function coversCanvas(panels, width, height) {
  return panels.some(({ dst }) =>
    dst && dst[0] <= 0 && dst[1] <= 0 && dst[0] + dst[2] >= width && dst[1] + dst[3] >= height)
}

function fill(ctx, color) {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
}

function drawBackground(ctx, video, { background, panels }) {
  const { width, height } = ctx.canvas
  if (background.type !== 'blur') return fill(ctx, background.color)
  // The blur is the expensive part of a frame — skip it when it can't be seen.
  if (coversCanvas(panels, width, height)) return fill(ctx, BLACK)

  const { videoWidth: vw, videoHeight: vh } = video
  const [dx, dy, dw, dh] = coverRect(vw, vh, width, height)
  ctx.save()
  ctx.filter = BLUR_FILTER
  ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh)
  ctx.restore()
}

/**
 * Draw output time `tMs` of `plan` onto `ctx` from the current `video` frame.
 * `ctx.canvas` must be sized to `plan.canvas` (panel rects live in that space).
 *
 * Returns the layout drawn, or null when nothing could be drawn (no decoded
 * frame yet, or no segment) — the canvas is then filled black.
 */
export function drawFrame(ctx, video, plan, tMs) {
  const vw = video?.videoWidth || 0
  const vh = video?.videoHeight || 0
  const layout = vw && vh ? getFrameLayout(plan, tMs, { width: vw, height: vh }) : null
  if (!layout) {
    fill(ctx, BLACK)
    return null
  }

  drawBackground(ctx, video, layout)
  for (const { src, dst } of layout.panels) {
    if (src) ctx.drawImage(video, ...src, ...dst)
  }
  return layout
}
