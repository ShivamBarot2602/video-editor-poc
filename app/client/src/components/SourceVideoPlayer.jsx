import { Film } from 'lucide-react'
import { fmtSizeOrNull as fmtSize } from '../lib/format'

function fmtDuration(s) {
  if (!Number.isFinite(s) || s < 0) return null
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

/**
 * The full original source video — plays independently of the clips. Native
 * controls (scrub the whole thing freely), poster from the cached thumbnail so
 * it isn't a black box before play. Meta strip underneath.
 */
export default function SourceVideoPlayer({ videoId, filename, durationS, width, height, size }) {
  const dur = fmtDuration(durationS)
  const dims = width && height ? `${width}×${height}` : null
  const sz = fmtSize(size)
  const meta = [dur, dims, sz].filter(Boolean).join('  ·  ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Film size={14} color="var(--accent)" />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)', letterSpacing: '0.01em' }}>Source video</span>
      </div>

      <div style={{
        background: 'var(--video-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
      }}>
        <video
          key={videoId}
          src={`/api/video/${videoId}`}
          poster={`/api/video/${videoId}/thumbnail?v=2`}
          controls
          preload="metadata"
          aria-label={filename ? `Source video: ${filename}` : 'Source video'}
          style={{ width: '100%', maxHeight: '64vh', objectFit: 'contain', display: 'block', background: 'var(--video-bg)' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {filename && (
          <div
            title={filename}
            style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {filename}
          </div>
        )}
        {meta && (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{meta}</div>
        )}
      </div>
    </div>
  )
}
