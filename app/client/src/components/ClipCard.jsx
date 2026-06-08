import { Bookmark, Check, Download, Trash2, Loader2, AlertTriangle, Sparkles, Clock } from 'lucide-react'
import ClipPlayer from './ClipPlayer'

function fmtRange(s) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

/* Engagement score 1-10. Hue low=red / mid=amber / high=green, plus an icon so
   it reads without relying on color (color-blind safe). Mirrors ThumbnailsPage. */
function ScorePill({ score }) {
  const num = Number(score)
  const safe = Number.isFinite(num) ? num : 0
  const tone = safe >= 8 ? 'high' : safe >= 5 ? 'mid' : 'low'
  const bg = tone === 'high' ? 'rgba(34,197,94,0.18)' : tone === 'mid' ? 'rgba(234,179,8,0.18)' : 'rgba(220,38,38,0.18)'
  const fg = tone === 'high' ? 'var(--success)' : tone === 'mid' ? '#eab308' : 'var(--error)'
  return (
    <span
      title={`Engagement score: ${safe} / 10`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: bg, color: fg, fontWeight: 700, fontSize: 10,
        padding: '2px 7px', borderRadius: 999,
      }}
    >
      <Sparkles size={9} /> {safe}
    </span>
  )
}

const IDLE = { status: 'idle', progress: 0 }

/**
 * One clip card — used for both suggested clips and saved clips (via `variant`).
 *
 * - Save (suggested only): bookmark the definition into the persistent library.
 * - Download: ffmpeg-cut on demand (progress) then download to disk. Re-download
 *   is instant once cut.
 * - Remove (saved only): drop from the library.
 *
 * Export/download progress lives in the page (keyed by clip id) so SSE progress
 * survives card re-renders.
 */
export default function ClipCard({
  videoId, clip, aspectRatio = '16 / 9', variant = 'suggested',
  isSaved = false, exportState = IDLE, onSave, onDownload, onRemove,
}) {
  const { status, progress = 0, error } = exportState
  const degenerate = !(clip.end > clip.start)
  const busy = status === 'exporting'

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Player */}
      {degenerate ? (
        <div style={{
          aspectRatio, background: '#0a0a0a', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 11, gap: 6,
        }}>
          <AlertTriangle size={18} /> Invalid clip range
        </div>
      ) : (
        <ClipPlayer videoId={videoId} start={clip.start} end={clip.end} aspectRatio={aspectRatio} />
      )}

      {/* Body */}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-bright)', lineHeight: 1.35 }}>
          {clip.title || 'Untitled clip'}
        </div>

        {clip.hook && (
          <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
            {clip.hook}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
            <Clock size={11} /> {clip.duration?.toFixed?.(1) ?? (clip.end - clip.start).toFixed(1)}s
          </span>
          <span style={{ color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtRange(clip.start)}–{fmtRange(clip.end)}
          </span>
          {clip.score != null && <ScorePill score={clip.score} />}
          {variant === 'saved' && clip.suggestProvider && (
            <span style={{ color: 'var(--text-faint)' }}>· {clip.suggestProvider}{clip.bucket ? ` · ${clip.bucket}` : ''}</span>
          )}
        </div>

        {clip.rationale && (
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', fontStyle: 'italic', lineHeight: 1.5 }}>
            "{clip.rationale}"
          </div>
        )}

        {/* Footer pinned to the bottom */}
        <div style={{ marginTop: 'auto', paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {variant === 'suggested' && (
              <button
                className={isSaved ? 'btn btn-secondary btn-sm' : 'btn btn-outline btn-sm'}
                onClick={() => !isSaved && onSave?.(clip)}
                disabled={isSaved || degenerate}
                title={isSaved ? 'Already saved' : 'Save to your library (survives re-runs)'}
                aria-pressed={isSaved}
                style={{ gap: 5, flexShrink: 0 }}
              >
                {isSaved ? <><Check size={13} /> Saved</> : <><Bookmark size={13} /> Save</>}
              </button>
            )}

            <button
              className="btn btn-primary btn-sm"
              onClick={() => onDownload?.(clip)}
              disabled={busy || degenerate}
              style={{ gap: 6, flex: 1 }}
            >
              {busy
                ? <><Loader2 size={13} className="spin" /> Preparing… {progress}%</>
                : <><Download size={13} /> Download</>}
            </button>

            {variant === 'saved' && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onRemove?.(clip.id)}
                title="Remove from saved"
                style={{ flexShrink: 0 }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {busy && (
            <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
          )}

          {status === 'error' && (
            <div style={{ fontSize: 10.5, color: 'var(--error)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{String(error || 'Download failed').slice(0, 140)} — click Download to retry.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
