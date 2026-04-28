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
  const [videos, setVideos] = useState(null)
  const [thumbnailErrors, setThumbnailErrors] = useState({})

  useEffect(() => {
    fetch('/api/videos')
      .then(r => r.json())
      .then(setVideos)
      .catch(() => setVideos([]))
  }, [])

  const handleThumbnailError = (videoId) => {
    setThumbnailErrors(prev => ({ ...prev, [videoId]: true }))
  }

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
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 16, 
      width: '100%', 
      maxWidth: 1200 
    }}>
      {videos.map(v => (
        <button
          key={v.id}
          onClick={() => onSelect(v)}
          style={{
            display: 'flex', 
            flexDirection: 'column',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: 'pointer', 
            textAlign: 'left',
            transition: 'all 150ms',
            overflow: 'hidden',
            padding: 0,
            height: '100%',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.background = 'var(--surface-2)'
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.background = 'var(--surface)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          {/* Thumbnail */}
          <div style={{
            width: '100%',
            aspect: '16 / 9',
            background: 'var(--surface-2)',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            {!thumbnailErrors[v.id] ? (
              <img
                src={v.thumbnail}
                alt={v.filename}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                onError={() => handleThumbnailError(v.id)}
              />
            ) : (
              <div style={{
                fontSize: 48,
                color: 'var(--text-muted)',
              }}>
                🎬
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Filename */}
            <div style={{
              fontSize: 13, 
              fontWeight: 600, 
              color: 'var(--text)',
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
            }}>
              {v.filename}
            </div>

            {/* Metadata and badges */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Size and date */}
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {fmtSize(v.size)} · {fmtDate(v.uploadedAt)}
              </span>

              {/* Provider and status badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
          </div>
        </button>
      ))}
    </div>
  )
}
