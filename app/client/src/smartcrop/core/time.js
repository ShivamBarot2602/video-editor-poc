// Time formatting + timeline scale math (spec 05 §5). Pure.

export const FRAME_MS = 40 // plans are 25 fps
export const MAX_PX_PER_MS = 0.2 // 200 px/s
export const MIN_LABEL_PX = 60

// The spec lists 1/5/10/30/60 s. The longer steps keep labels ≥ 60 px apart on
// long videos at fit zoom (a 30-min video in 1000 px needs ≥ 2-min ticks).
export const TICK_STEPS_MS = [1000, 5000, 10000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000]

const HOUR_MS = 3600000
const pad2 = (n) => String(n).padStart(2, '0')

// mm:ss, or hh:mm:ss when ≥ 1 h or `withHours` (the transport uses that, as
// in the reference design's 00:00:00). Floors to the second; bad input → 0.
export function formatMs(ms, { withHours = false } = {}) {
  const totalSec = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return h > 0 || withHours ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}

export const clampMs = (ms, durationMs) => Math.min(Math.max(ms, 0), Math.max(durationMs, 0))

// Scale that fits the whole video into `widthPx`; 0 until both are known.
export function fitPxPerMs(widthPx, durationMs) {
  if (!(widthPx > 0) || !(durationMs > 0)) return 0
  return widthPx / durationMs
}

// Zoom by `factor` (×2 in, ×0.5 out), clamped to [fit, 200 px/s]. For a video
// so short that fit is already above the max, fit wins (zoom does nothing).
export function zoomPxPerMs(pxPerMs, factor, fitPx) {
  const max = Math.max(MAX_PX_PER_MS, fitPx)
  return Math.min(Math.max(pxPerMs * factor, fitPx), max)
}

// Smallest step whose labels land ≥ `minPx` apart; the largest if none do.
export function pickTickStep(pxPerMs, minPx = MIN_LABEL_PX) {
  return TICK_STEPS_MS.find((step) => step * pxPerMs >= minPx) ?? TICK_STEPS_MS.at(-1)
}

// Ruler ticks in [fromMs, toMs] (default: whole video) → [{ ms, x, label }].
// `x` is measured from time 0; a scrolled view subtracts its scrollLeft.
// Videos ≥ 1 h label every tick hh:mm:ss so label widths don't jump.
export function ticks(durationMs, pxPerMs, { fromMs = 0, toMs = durationMs, minPx = MIN_LABEL_PX } = {}) {
  if (!(durationMs > 0) || !(pxPerMs > 0)) return []
  const step = pickTickStep(pxPerMs, minPx)
  const withHours = durationMs >= HOUR_MS
  const first = Math.max(0, Math.ceil(fromMs / step) * step)
  const last = Math.min(toMs, durationMs)

  const out = []
  for (let ms = first; ms <= last; ms += step) {
    out.push({ ms, x: ms * pxPerMs, label: formatMs(ms, { withHours }) })
  }
  return out
}
