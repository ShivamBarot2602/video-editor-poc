import { useState } from 'react'
import { Bookmark, Check, Download, Trash2, Loader2, AlertTriangle, Clock, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import ClipPlayer from './ClipPlayer'
import ScorePill from '../ui/ScorePill'
import ClipThumbnails from './ClipThumbnails'

function fmtRange(s) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
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

  const [copied, setCopied] = useState(false)
  const [thumbIdx, setThumbIdx] = useState(0)
  const hasThumbs = Array.isArray(clip.thumbnails) && clip.thumbnails.length > 0

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(clip.caption || '')
      setCopied(true)
      toast.success('Caption copied')
      setTimeout(() => setCopied(false), 1500)
    } catch (_) {
      toast.error('Copy failed')
    }
  }

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
          aspectRatio, background: 'var(--video-bg)', display: 'flex', flexDirection: 'column',
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
          {clip.score != null && <ScorePill score={clip.score} label="Engagement score" />}
          {variant === 'saved' && clip.suggestProvider && (
            <span style={{ color: 'var(--text-faint)' }}>· {clip.suggestProvider}{clip.bucket ? ` · ${clip.bucket}` : ''}</span>
          )}
        </div>

        {clip.caption && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                Caption
              </span>
              <button
                className="btn btn-outline btn-sm"
                onClick={copyCaption}
                style={{ gap: 5, padding: '2px 8px', fontSize: 10.5 }}
                aria-live="polite"
                title="Copy caption to clipboard"
              >
                {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {clip.caption}
            </div>
          </div>
        )}

        {hasThumbs && (
          <ClipThumbnails
            thumbnails={clip.thumbnails}
            selectedIdx={thumbIdx}
            onSelect={setThumbIdx}
            aspectRatio={aspectRatio}
          />
        )}

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
