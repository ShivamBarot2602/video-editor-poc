import { useState } from 'react'
import { Check, ImageOff } from 'lucide-react'

function fmtTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

/**
 * Thumbnail-candidate strip for a video-understanding clip. Gemini points at 3
 * frame timestamps; the server extracts them and we let the user pick a favourite
 * (local highlight only — preview, not persisted).
 *
 * Selection reads without color alone: accent ring + a Check badge (color-blind safe).
 */
export default function ClipThumbnails({ thumbnails, selectedIdx = 0, onSelect, aspectRatio = '16 / 9' }) {
  const [errored, setErrored] = useState({})
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 5 }}>
        Thumbnail
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {thumbnails.map((th, i) => {
          const active = i === selectedIdx
          const bad = errored[i]
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect?.(i)}
              aria-pressed={active}
              aria-label={`Use thumbnail at ${fmtTime(th.t)}`}
              title={`Frame at ${fmtTime(th.t)}`}
              style={{
                flex: 1, minWidth: 0, position: 'relative', padding: 0,
                aspectRatio, borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                cursor: 'pointer', background: 'var(--surface-2)',
                border: active ? '2px solid var(--accent)' : '1px solid var(--border-sub)',
                outline: 'none', transition: 'border-color 120ms',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = 'var(--text-muted)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = 'var(--border-sub)' }}
            >
              {bad ? (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
                  <ImageOff size={16} />
                </span>
              ) : (
                <img
                  src={th.url}
                  alt={`Thumbnail at ${fmtTime(th.t)}`}
                  loading="lazy"
                  onError={() => setErrored(p => ({ ...p, [i]: true }))}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}

              {/* timestamp badge */}
              <span style={{
                position: 'absolute', left: 4, bottom: 4,
                fontSize: 9, fontVariantNumeric: 'tabular-nums', color: '#fff',
                background: 'rgba(0,0,0,0.6)', padding: '1px 5px', borderRadius: 4,
              }}>
                {fmtTime(th.t)}
              </span>

              {/* selected check */}
              {active && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--accent)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={11} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
