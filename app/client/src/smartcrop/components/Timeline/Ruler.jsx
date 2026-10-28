import { memo } from 'react'
import { ticks } from '../../core/time.js'
import { TIMELINE_PAD, msToX } from '../../core/timeline.js'

// Time labels with grid lines running down the whole timeline (spec 05 §5).
// Only ticks inside [fromX, toX] (the visible content range) are rendered.
function Ruler({ durationMs, pxPerMs, fromX, toX }) {
  const visible = ticks(durationMs, pxPerMs, {
    fromMs: (fromX - TIMELINE_PAD) / pxPerMs,
    toMs: (toX - TIMELINE_PAD) / pxPerMs,
  })

  return (
    <div className="sc-ruler" aria-hidden>
      {visible.map(({ ms, label }) => (
        <span key={ms} className="sc-tick" style={{ left: msToX(ms, pxPerMs) }}>{label}</span>
      ))}
    </div>
  )
}

export default memo(Ruler)
