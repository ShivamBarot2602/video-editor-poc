// Autosave of the edit document (spec 03 §3, 05 §3.4): debounced, at most one
// PUT in flight, always ending with the latest document saved. Pure — the
// request and timers are injected.
//
//   schedule(doc)  save `doc` after `delayMs` of quiet (a newer doc replaces it)
//   flush()        save anything pending now and resolve when nothing is left
//                  (Save waits on this before rendering, 04)

export const AUTOSAVE_DELAY_MS = 1000

/**
 * save    = (doc) → Promise<result>
 * onSaved = (result) => void — e.g. keep result.version
 * onError = (error, doc) => void — the doc is dropped; the next change retries
 * onBusy  = (busy) => void — true while something is pending or in flight
 */
export function createAutosave({
  save,
  onSaved,
  onError,
  onBusy,
  delayMs = AUTOSAVE_DELAY_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let pending = null // newest unsaved document
  let inFlight = null // Promise of the PUT being sent
  let timer = null
  let busy = false

  function setBusy() {
    const next = Boolean(pending || inFlight)
    if (next !== busy) onBusy?.((busy = next))
  }

  // Send the pending doc unless a PUT is already out; that one sends it when done.
  function send() {
    clearTimer(timer)
    timer = null
    if (inFlight || !pending) return
    const doc = pending
    pending = null
    inFlight = Promise.resolve()
      .then(() => save(doc))
      .then(onSaved, (err) => onError?.(err, doc))
      .finally(() => {
        inFlight = null
        if (pending && timer == null) send()
        setBusy()
      })
    setBusy()
  }

  function schedule(doc) {
    pending = doc
    clearTimer(timer)
    timer = setTimer(send, delayMs)
    setBusy()
  }

  async function flush() {
    while (pending || inFlight) {
      send()
      await inFlight
    }
  }

  function dispose() {
    clearTimer(timer)
    timer = null
  }

  return { schedule, flush, dispose }
}
