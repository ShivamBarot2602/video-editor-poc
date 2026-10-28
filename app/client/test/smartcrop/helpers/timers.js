// Manual timers for core modules that take { setTimer, clearTimer }.
// `advance(ms)` fires every timer due within that window, in order.
export function makeTimers() {
  let now = 0
  let nextId = 1
  const timers = new Map() // id → { at, fn }

  return {
    setTimer: (fn, ms) => {
      const id = nextId++
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimer: (id) => timers.delete(id),
    get pending() { return timers.size },
    advance(ms) {
      const until = now + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        const [id, t] = due
        timers.delete(id)
        now = t.at
        t.fn()
      }
      now = until
    },
  }
}

// Let pending promise callbacks run.
export const settle = () => new Promise((resolve) => setImmediate(resolve))

// A promise plus its resolve/reject, for controlling when a fake request ends.
export function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
