import { useEffect, useState } from 'react'

const PROVIDER_LABELS = {
  assemblyai:   'AssemblyAI',
  deepgram:     'Deepgram',
  openai:       'OpenAI',
  groq:         'Groq',
  speechmatics: 'Speechmatics',
  sonix:        'Sonix',
}

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024)        return `${(bytes / (1024 ** 2)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function fmtDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1)   return 'just now'
  if (diffMins < 60)  return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24)   return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7)   return `${diffDays}d ago`
  return d.toLocaleDateString()
}

export default function RecentVideos({ onSelect }) {
  const [videos, setVideos] = useState(null) // null = loading

  useEffect(() => {
    fetch('/api/videos')
      .then(r => r.json())
      .then(setVideos)
      .catch(() => setVideos([]))
  }, [])

  if (videos === null) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 0', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 0', fontSize: 13 }}>
        No previous sessions found.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 520 }}>
      {videos.map(v => (
        <button
          key={v.id}
          onClick={() => onSelect(v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 16px', borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: 'pointer', textAlign: 'left',
            transition: 'border-color 150ms, background 150ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.background = 'var(--surface-2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.background = 'var(--surface)'
          }}
        >
          {/* Icon */}
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>
            🎬
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 500, color: 'var(--text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              marginBottom: 4,
            }}>
              {v.filename}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {fmtSize(v.size)} · {fmtDate(v.uploadedAt)}
              </span>
              {v.providers.map(p => (
                <span key={p} style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                  padding: '2px 6px', borderRadius: 4,
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                }}>
                  {PROVIDER_LABELS[p] || p}
                </span>
              ))}
              {v.hasBurned && (
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                  padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                }}>
                  Burned
                </span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <span style={{ color: 'var(--text-dim)', fontSize: 16, flexShrink: 0 }}>›</span>
        </button>
      ))}
    </div>
  )
}
