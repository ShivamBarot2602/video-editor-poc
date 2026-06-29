// Shared formatting helpers.
//
// NOTE: there are THREE distinct time formatters that produce DIFFERENT on-screen
// strings. They are intentionally NOT merged — each call site imports the variant
// matching its existing behavior (often aliased to `fmtTime`).

// MM:SS, zero-padded minutes. (TranscriptionPanel, PlaygroundPage)
export function fmtClock(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// M:SS, non-padded minutes; clamps NaN/negative to 0. (ClipThumbnails)
export function fmtClockSafe(s) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// M:SS.s with one decimal; '–' for non-finite input. (ThumbnailsPage)
export function fmtTimecodeTenths(seconds) {
  if (!Number.isFinite(seconds)) return '–'
  const m = Math.floor(seconds / 60)
  const s = (seconds - m * 60).toFixed(1)
  return `${m}:${s.padStart(4, '0')}`
}

// Bytes → human-readable size. Numeric body shared by every call site.
export function fmtSize(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

// fmtSize variant that returns null for non-finite input. (SourceVideoPlayer)
export function fmtSizeOrNull(bytes) {
  if (!Number.isFinite(bytes)) return null
  return fmtSize(bytes)
}

// ISO timestamp → relative "just now / Xm/h/d ago", else local date.
// Identical across all call sites. (RecentVideos, PlaygroundPage, ThumbnailsPage)
export function fmtDate(iso) {
  const d = new Date(iso), now = new Date()
  const mins = Math.floor((now - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}
