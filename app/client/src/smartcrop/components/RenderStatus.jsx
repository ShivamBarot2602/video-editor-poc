import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react'
import { StatusChip } from './EditorFrame.jsx'
import { useNow } from '../hooks/useNow.js'
import { elapsedSince } from '../core/projectStatus.js'
import { formatMs } from '../core/time.js'

const STAGE_TEXT = { PLANNING: 'Preparing', ENCODING: 'Encoding' }

// Top-bar render status (spec 05 §3 "Save"): "Rendering…" + elapsed + Cancel
// while it runs, a way back to the result once done, the reason if it failed.
export default function RenderStatus({ phase, render, receivedAt, error, onCancel, onView }) {
  const running = phase === 'starting' || phase === 'rendering'
  const now = useNow(1000, running)

  if (running) {
    const stage = STAGE_TEXT[render?.stage]
    const elapsed = render ? ` ${formatMs(elapsedSince(render, receivedAt, now))}` : ''
    return (
      <>
        <StatusChip icon={<LoaderCircle size={13} className="sc-spinner" />}>
          {phase === 'starting' ? 'Starting render…' : `Rendering${stage ? ` · ${stage}` : '…'}${elapsed}`}
        </StatusChip>
        {phase === 'rendering' && (
          <button type="button" className="sc-ghost-btn sc-btn-sm" onClick={onCancel}>Cancel</button>
        )}
      </>
    )
  }

  if (phase === 'succeeded') {
    return (
      <button type="button" className="sc-chip sc-chip-btn" onClick={onView}>
        <CircleCheck size={13} /> Video ready
      </button>
    )
  }

  if (phase === 'failed') {
    return (
      <StatusChip tone="error" icon={<TriangleAlert size={13} />}>
        <span title={error?.message}>Render failed</span>
      </StatusChip>
    )
  }

  return null
}
