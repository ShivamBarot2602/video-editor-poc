// Timeline geometry, thumbnails and keyboard (spec 05 §5). Pure — the
// components only measure, call these, and render.
//
// Coordinates: "content x" runs from 0 at the left edge of the scrollable
// content; time 0 sits at TIMELINE_PAD so the playhead is never flush to the edge.

import { FRAME_MS, clampMs } from './time.js'

export const TIMELINE_PAD = 16
export const FALLBACK_THUMB_SPACING_PX = 120
export const FALLBACK_THUMB_MAX = 40
export const SEEK_STEP_MS = 1000
// Auto-scroll leaves this much room before the playhead (05 §5 "follows playback").
export const FOLLOW_MARGIN_PX = 48

export const msToX = (ms, pxPerMs) => TIMELINE_PAD + ms * pxPerMs

export function xToMs(x, pxPerMs, durationMs) {
  if (!(pxPerMs > 0)) return 0
  return clampMs(Math.round((x - TIMELINE_PAD) / pxPerMs), durationMs)
}

export const contentWidth = (durationMs, pxPerMs) => durationMs * pxPerMs + TIMELINE_PAD * 2

// New scrollLeft that brings the playhead back into view, or null if it's
// visible. Jumps a page at a time (not every frame) so the view is calm.
export function followScroll({ playheadX, scrollLeft, viewWidth }) {
  if (playheadX >= scrollLeft && playheadX <= scrollLeft + viewWidth - FOLLOW_MARGIN_PX) return null
  return Math.max(0, playheadX - FOLLOW_MARGIN_PX)
}

// scrollLeft after a zoom that keeps `anchorMs` (usually the playhead) at the
// same spot on screen — clamped to what the new content allows.
export function scrollAfterZoom({ anchorMs, oldPxPerMs, newPxPerMs, scrollLeft, viewWidth, durationMs }) {
  const onScreen = msToX(anchorMs, oldPxPerMs) - scrollLeft
  const maxScroll = Math.max(0, contentWidth(durationMs, newPxPerMs) - viewWidth)
  return Math.min(Math.max(0, msToX(anchorMs, newPxPerMs) - onScreen), maxScroll)
}

// ── Thumbnail strip ──────────────────────────────────────────────────────────

/**
 * Tiles of `tileWidth` covering the clip (0 → durationMs), only those that
 * intersect [fromX, toX] in content x. The last tile is cut to the clip end.
 * → [{ index, left, width, ms }] — `left` relative to the clip's left edge,
 *   `ms` = time at the tile's centre (what it should show).
 */
export function visibleTiles({ durationMs, pxPerMs, tileWidth, fromX = -Infinity, toX = Infinity }) {
  const clipWidth = durationMs * pxPerMs
  if (!(clipWidth > 0) || !(tileWidth > 0)) return []
  const count = Math.ceil(clipWidth / tileWidth)
  const first = Math.max(0, Math.floor((fromX - TIMELINE_PAD) / tileWidth))
  const last = Math.min(count - 1, Math.floor((toX - TIMELINE_PAD) / tileWidth))

  const tiles = []
  for (let index = first; index <= last; index++) {
    const left = index * tileWidth
    const width = Math.min(tileWidth, clipWidth - left)
    tiles.push({ index, left, width, ms: Math.min((left + width / 2) / pxPerMs, durationMs) })
  }
  return tiles
}

// Sprite tile (media.thumbnails, 00 §6.4 P4) for time `ms`, scaled to
// `height` → { width, backgroundPosition, backgroundSize }.
export function spriteTile(thumbnails, ms, height) {
  const { intervalMs, tileWidth, tileHeight, columns, count } = thumbnails
  const scale = height / tileHeight
  const index = Math.min(Math.max(0, Math.floor(ms / intervalMs)), count - 1)
  const col = index % columns
  const row = Math.floor(index / columns)
  return {
    width: tileWidth * scale,
    backgroundPosition: `${-col * tileWidth * scale}px ${-row * tileHeight * scale}px`,
    backgroundSize: `${columns * tileWidth * scale}px auto`,
  }
}

// Client fallback (no sprite): one frame per 120 px of visible width, max 40.
export function fallbackThumbCount(visibleWidthPx) {
  return Math.min(FALLBACK_THUMB_MAX, Math.max(1, Math.ceil(visibleWidthPx / FALLBACK_THUMB_SPACING_PX)))
}

// Evenly spaced capture times: the centre of each of `count` equal slots.
export function fallbackThumbTimes(durationMs, count) {
  const slot = durationMs / count
  return Array.from({ length: count }, (_, i) => Math.round((i + 0.5) * slot))
}

// Which fallback slot a time falls in.
export function fallbackSlot(ms, durationMs, count) {
  return Math.min(count - 1, Math.max(0, Math.floor((ms / durationMs) * count)))
}

// ── Keyboard (05 §5) ─────────────────────────────────────────────────────────

/**
 * Key event → player action, or null to let the browser have it.
 *   Space toggle · ←/→ ±1 s · Shift+←/→ ±1 frame · Home/End
 * → { type: 'toggle' } | { type: 'step', ms } | { type: 'seek', ms }
 */
export function keyAction({ key, shiftKey, altKey, ctrlKey, metaKey }, durationMs) {
  if (altKey || ctrlKey || metaKey) return null
  switch (key) {
    case ' ': return { type: 'toggle' }
    case 'ArrowLeft': return { type: 'step', ms: -(shiftKey ? FRAME_MS : SEEK_STEP_MS) }
    case 'ArrowRight': return { type: 'step', ms: shiftKey ? FRAME_MS : SEEK_STEP_MS }
    case 'Home': return { type: 'seek', ms: 0 }
    case 'End': return { type: 'seek', ms: durationMs }
    default: return null
  }
}

// Typing in a field keeps its own keys.
export function isTypingTarget(target) {
  const tag = target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true
}
