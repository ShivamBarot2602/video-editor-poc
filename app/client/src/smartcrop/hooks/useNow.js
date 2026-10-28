import { useEffect, useState } from 'react'

// Date.now(), refreshed every `intervalMs` — for elapsed-time counters that
// tick between server polls. Pass `enabled: false` to stop ticking.
export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!enabled) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, enabled])
  return now
}
