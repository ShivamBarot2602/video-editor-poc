// Save → render → result (spec 05 §3 "Save", 04). Pure orchestration with
// injected API and timers.
//
//   start(editVersion)  POST /renders; 409 RENDER_IN_PROGRESS attaches to that render
//   attach(renderId)    follow an existing render (page reload: project.activeRenderId)
//   cancel()            POST …/cancel on the render being followed
//   refresh()           GET it once more (fresh signed output URLs, 04 §1)
//
// While QUEUED/RENDERING it polls GET …/renders/:id every 5 s.
//
// state = { phase, render, receivedAt, error }
//   phase: 'idle' | 'starting' | 'rendering' | 'succeeded' | 'failed' | 'cancelled'
//   error: what to show when it failed — the render's own error, or the API's

export const RENDER_POLL_MS = 5000

const PHASE_BY_STATUS = {
  QUEUED: 'rendering',
  RENDERING: 'rendering',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

const FINAL_PHASES = new Set(['succeeded', 'failed', 'cancelled'])
export const isBusy = (phase) => phase === 'starting' || phase === 'rendering'

const FALLBACK_FAILURE = "We couldn't create the video. Please try saving again."

/**
 * api = { create(editVersion) → { render }, get(renderId) → { render },
 *         cancel(renderId) → { render } }
 * onChange(state) on every change; onError(error) for API errors worth a toast.
 */
export function createRenderTracker({
  api,
  onChange,
  onError,
  pollMs = RENDER_POLL_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let state = { phase: 'idle', render: null, receivedAt: 0, error: null }
  let timer = null
  let renderId = null // the render being followed
  let disposed = false

  function update(patch) {
    if (disposed) return
    state = { ...state, ...patch }
    onChange?.(state)
  }

  function stopPolling() {
    clearTimer(timer)
    timer = null
  }

  function schedulePoll(delay = pollMs) {
    stopPolling()
    if (!disposed) timer = setTimer(poll, delay)
  }

  // Take in a render from any response. A stale poll can't move a finished
  // render back to "rendering" (statuses only move forward, 00 §2).
  function track(render) {
    if (render.renderId !== renderId) return
    const phase = PHASE_BY_STATUS[render.status] ?? 'rendering'
    if (FINAL_PHASES.has(state.phase) && phase === 'rendering') return
    const error = phase === 'failed' ? { message: render.error?.message || FALLBACK_FAILURE } : null
    update({ phase, render, receivedAt: Date.now(), error })
    if (phase === 'rendering') schedulePoll()
    else stopPolling()
  }

  async function poll() {
    timer = null
    const id = renderId
    try {
      const { render } = await api.get(id)
      if (id === renderId) track(render)
    } catch (err) {
      if (id !== renderId) return
      if (err?.status === 404) {
        // Render gone (project deleted?) — stop following it.
        renderId = null
        update({ phase: 'idle', render: null, error: null })
        return
      }
      schedulePoll() // network / 5xx: keep the last state and try again
    }
  }

  function attach(id) {
    if (!id) return
    renderId = id
    update({ phase: 'rendering', render: null, error: null })
    schedulePoll(0)
  }

  async function start(editVersion) {
    if (isBusy(state.phase)) return
    stopPolling()
    renderId = null
    update({ phase: 'starting', render: null, error: null })
    try {
      const { render } = await api.create(editVersion)
      renderId = render.renderId
      track(render)
    } catch (err) {
      // Double-click Save / another tab: follow the render already running (04 §2).
      if (err?.code === 'RENDER_IN_PROGRESS' && err.details?.renderId) {
        attach(err.details.renderId)
        return
      }
      update({ phase: 'failed', error: { message: err?.message || FALLBACK_FAILURE } })
      onError?.(err)
    }
  }

  async function cancel() {
    if (state.phase !== 'rendering' || !renderId) return
    try {
      const { render } = await api.cancel(renderId)
      track(render)
    } catch (err) {
      // Finished meanwhile (409 INVALID_STATE): the next poll shows how.
      if (err?.status === 409) schedulePoll(0)
      else onError?.(err)
    }
  }

  // Re-fetch the followed render now; resolves when its state is updated.
  async function refresh() {
    if (!renderId) return
    stopPolling()
    await poll()
  }

  function dispose() {
    disposed = true
    stopPolling()
  }

  return { start, attach, cancel, refresh, dispose, getState: () => state }
}
