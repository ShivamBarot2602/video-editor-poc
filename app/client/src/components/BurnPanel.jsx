import { Flame, Download, Check } from 'lucide-react'

export default function BurnPanel({ canBurn, burnState, onBurn }) {
  const { status, progress, burnedUrl } = burnState
  const isBurning = status === 'burning'
  const isDone = status === 'done'

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      overflow: 'hidden', background: 'var(--surface-2)',
    }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <p className="section-label" style={{ marginBottom: 0 }}>Burn Subtitles</p>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!canBurn && !isDone && (
          <p style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>
            Transcribe the video first.
          </p>
        )}

        {canBurn && !isDone && (
          <button
            className="btn btn-primary btn-full"
            onClick={onBurn}
            disabled={isBurning || !canBurn}
          >
            {isBurning ? (
              <><Spinner /> Burning… {progress}%</>
            ) : (
              <><Flame size={14} /> Burn Subtitles</>
            )}
          </button>
        )}

        {isBurning && (
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        {isBurning && (
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
            FFmpeg is rendering — this may take a moment for long videos.
          </p>
        )}

        {isDone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(34,197,94,0.1)', color: 'var(--success)',
              fontSize: 13, fontWeight: 500,
            }}>
              <Check size={13} strokeWidth={2.5} /> Subtitles burned successfully
            </div>

            <a
              href={burnedUrl}
              download
              className="btn btn-secondary btn-full"
              style={{ textDecoration: 'none' }}
            >
              <Download size={13} /> Download Video
            </a>

            <button className="btn btn-ghost btn-full" onClick={onBurn}>
              Re-burn with current style
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 14" />
    </svg>
  )
}
