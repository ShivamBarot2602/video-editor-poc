import { useEffect, useState } from 'react'
import { Play, LayoutGrid, Sparkles, Scissors } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PROVIDERS } from '../config/providers'
import { fmtSize, fmtDate } from '../lib/format'
import { listVideos } from '../api/videos'

const PROVIDER_LABELS = Object.fromEntries(PROVIDERS.map(p => [p.id, p.label]))

export default function RecentVideos({ onSelect, onPlayground }) {
  const [videos, setVideos] = useState(null)
  const [thumbErrors, setThumbErrors] = useState({})

  useEffect(() => {
    listVideos().then(setVideos).catch(() => setVideos([]))
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
        <div
          key={v.id}
          style={{
            background: 'var(--surface)', borderRadius: 8, overflow: 'hidden',
            border: '1px solid var(--border)', textAlign: 'left',
            display: 'flex', flexDirection: 'column',
            outline: '1px solid transparent',
            transition: 'outline-color 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.outlineColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.outlineColor = 'transparent' }}
        >
          {/* Thumbnail */}
          <div
            style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: 'var(--video-bg)', flexShrink: 0 }}
          >
            {!thumbErrors[v.id] ? (
              <img
                src={v.thumbnail}
                alt={v.filename}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setThumbErrors(p => ({ ...p, [v.id]: true }))}
              />
            ) : (
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}><Play size={10} /></span>
            )}
          </div>

          {/* Info */}
          <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <div
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
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

          {/* CTAs */}
          <div style={{
            padding: '6px 8px',
            borderTop: '1px solid var(--border-sub)',
            display: 'flex', flexDirection: 'column', gap: 4,
            flexShrink: 0,
          }}>
            <button
              className="btn btn-primary btn-sm"
              style={{ width: '100%', fontSize: 10, padding: '4px 0' }}
              onClick={() => onSelect(v)}
            >
              Open in Editor
            </button>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="btn btn-outline btn-sm"
                style={{ flex: 1, fontSize: 10, padding: '4px 0', color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}
                onClick={() => onPlayground && onPlayground(v)}
              >
                <LayoutGrid size={10} /> Playground
              </button>
              <Link
                to={`/thumbnails/${v.id}`}
                className="btn btn-outline btn-sm"
                style={{ flex: 1, fontSize: 10, padding: '4px 0', color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, textDecoration: 'none' }}
                title="Generate thumbnail candidates"
              >
                <Sparkles size={10} /> Thumbs
              </Link>
              <Link
                to={`/clips/${v.id}`}
                className="btn btn-outline btn-sm"
                style={{ flex: 1, fontSize: 10, padding: '4px 0', color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, textDecoration: 'none' }}
                title="Suggest & export clips"
              >
                <Scissors size={10} /> Clips
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
