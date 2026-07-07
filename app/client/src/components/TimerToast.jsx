import { useState, useEffect, useRef } from 'react'

// mm:ss (h:mm:ss past an hour)
function fmt(totalSec) {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  const base = `${mm}:${String(s).padStart(2, '0')}`
  return h ? `${h}:${base}` : base
}

/**
 * Message body for a `toast.loading(...)` on a long-running task — shows the
 * label plus an elapsed timer that counts up once per second. Uses a Date.now()
 * delta (not a tick counter) so it stays accurate through tab-throttle/sleep.
 *
 * When the toast is replaced via `toast.success/error(msg, { id })`, react-hot-toast
 * unmounts this component and the interval is cleared — the timer naturally freezes.
 *
 * Usage: const id = toast.loading(<TimerToast label="Transcribing…" />)
 */
export default function TimerToast({ label }) {
  const [sec, setSec] = useState(0)
  const start = useRef(Date.now())

  useEffect(() => {
    const id = setInterval(() => {
      setSec(Math.floor((Date.now() - start.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span>
      {label}
      <span style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted, #9c9ca5)' }}>
        {fmt(sec)}
      </span>
    </span>
  )
}
