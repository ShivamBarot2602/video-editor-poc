import { Loader2, CheckCircle2, Circle, Film, X } from 'lucide-react'

const STEPS = [
  { key: 'upload',    label: 'Uploading video' },
  { key: 'analyze',   label: 'Analyzing' },
  { key: 'thumbs',    label: 'Extracting thumbnails' },
]

// Map an SSE phase → the index of the step that is currently active.
function phaseToStep(phase) {
  switch (phase) {
    case 'uploading':
    case 'processing': return 0
    case 'analyzing':  return 1
    case 'extracting': return 2
    default:           return 0 // 'start'
  }
}

/**
 * Multi-phase progress for the video-understanding run. Determinate bar while
 * uploading; indeterminate shimmer for the analyze/extract phases (no % to
 * report). Cancellable. Relies on `.clip-shimmer` / `.spin` from ClipsPage
 * (both already `prefers-reduced-motion`-guarded).
 */
export default function ClipAnalyzeProgress({ phase = 'start', percent = 0, onCancel }) {
  const current = phaseToStep(phase)

  return (
    <div style={{
      border: '1px solid var(--border-sub)', borderRadius: 'var(--radius)',
      background: 'var(--surface)', padding: 16, marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Film size={15} color="var(--accent)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-bright)' }}>Analyzing video</span>
        {onCancel && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            style={{ marginLeft: 'auto', gap: 5, fontSize: 11 }}
          >
            <X size={12} /> Cancel
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEPS.map((step, i) => {
          const done = i < current
          const active = i === current
          const showBar = active && step.key === 'upload'
          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flexShrink: 0, display: 'flex', width: 16 }}>
                {done
                  ? <CheckCircle2 size={15} color="var(--success)" />
                  : active
                    ? <Loader2 size={15} className="spin" color="var(--accent)" />
                    : <Circle size={15} color="var(--text-faint)" />}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12,
                  color: done ? 'var(--text-muted)' : active ? 'var(--text-bright)' : 'var(--text-faint)',
                  fontWeight: active ? 600 : 400,
                  display: 'flex', justifyContent: 'space-between', gap: 8,
                }}>
                  <span>{step.label}</span>
                  {showBar && <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{percent}%</span>}
                </div>

                {/* determinate bar for upload; shimmer for the rest while active */}
                {active && (
                  <div className="progress-bar" style={{ marginTop: 5 }}>
                    {showBar
                      ? <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                      : <div className="clip-shimmer" style={{ height: '100%', width: '100%' }} />}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
