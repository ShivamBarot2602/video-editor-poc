import { useEffect, useState } from 'react'

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024)        return `${(bytes / (1024 ** 2)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function fmtDate(iso) {
  const d = new Date(iso), now = new Date()
  const mins = Math.floor((now - d) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return d.toLocaleDateString()
}

const PROVIDER_LABELS = {
  assemblyai: 'AssemblyAI', deepgram: 'Deepgram', openai: 'OpenAI',
  gladia: 'Gladia',
  groq: 'Groq', speechmatics: 'Speechmatics', sonix: 'Sonix',
  mistral: 'Mistral', revai: 'Rev AI', pyannote: 'pyannoteAI',
}

export default function RecentVideos({ onSelect }) {
  const [videos, setVideos] = useState(null)
  const [thumbErrors, setThumbErrors] = useState({})

  useEffect(() => {
    fetch('/api/videos').then(r => r.json()).then(setVideos).catch(() => setVideos([]))
  }, [])

  if (videos === null) {
    return <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '32px 0', textAlign: 'center' }}>Loading…</div>
  }

  if (videos.length === 0) {
    return <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '32px 0', textAlign: 'center' }}>No previous sessions found.</div>
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 10,
    }}>
      {videos.map(v => (
        <button
          key={v.id}
          onClick={() => onSelect(v)}
          style={{
            background: 'var(--surface)', borderRadius: 8, overflow: 'hidden',
            border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
            padding: 0, transition: 'border-color 150ms, transform 150ms',
            display: 'flex', flexDirection: 'column',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          {/* Thumbnail — 16:9 aspect ratio */}
          <div style={{ width: '100%', aspectRatio: '16/9', background: '#0a0a0a', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {!thumbErrors[v.id] ? (
              <img
                src={v.thumbnail}
                alt={v.filename}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setThumbErrors(p => ({ ...p, [v.id]: true }))}
              />
            ) : (
              <span style={{ color: '#333', fontSize: 10 }}>▶</span>
            )}
          </div>

          {/* Info */}
          <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {v.filename}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
              {fmtSize(v.size)} · {fmtDate(v.uploadedAt)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {v.providers.map(p => (
                <span key={p} style={{
                  fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                  background: 'rgba(15,103,234,0.18)', color: 'var(--accent)',
                }}>
                  {PROVIDER_LABELS[p] || p}
                </span>
              ))}
              {v.hasBurned && (
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                  background: 'var(--success-dim)', color: 'var(--success)',
                }}>
                  Burned
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
