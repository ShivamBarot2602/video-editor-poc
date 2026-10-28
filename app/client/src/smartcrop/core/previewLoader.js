// Live preview plans for the editor (spec 05 §3 "Change aspect or layout").
// Pure orchestration — network calls and timers are injected, so it is
// testable without a browser.
//
//   load(document)  debounce 400 ms → POST /preview-plan → GET plan JSON → swap
//   show(preview)   use a preview the server already returned (GET /editor)
//
// Rules:
//   - Only the latest request may land: older ones are aborted and their late
//     results dropped (05 §3.5).
//   - 429 PREVIEW_BUSY → retry after `retryAfterMs`; any other error keeps the
//     current plan and reports via onError (05 §3.6).
//   - Plans already seen this session come from a small cache, instantly.

export const PREVIEW_DEBOUNCE_MS = 400
export const PREVIEW_CACHE_SIZE = 6
const DEFAULT_RETRY_MS = 1000

const isAbort = (err) => err?.name === 'AbortError'

// The preview depends on these fields only (03 §4 hash); clip ids are not part of it.
export function previewKey(doc) {
  return JSON.stringify([
    doc.aspect,
    doc.defaultLayout,
    doc.options?.background ?? null,
    doc.options?.fallbackLayout ?? null,
    doc.clips.map((c) => [c.sourceStartMs, c.sourceEndMs, c.layout ?? null]),
  ])
}

/**
 * api      = { requestPreview(document, { signal }) → preview response,
 *              fetchPlan(url, { signal }) → plan JSON }
 * onChange = (state) => void, state = { preview, plan, pending }
 * onError  = (error) => void — a failed preview; the previous plan stays
 */
export function createPreviewLoader({
  api,
  onChange,
  onError,
  debounceMs = PREVIEW_DEBOUNCE_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let state = { preview: null, plan: null, pending: false }
  const cache = new Map() // previewKey → { preview, plan }, oldest first
  let generation = 0 // bumped by every load/show; a result from an older one is dropped
  let timer = null
  let controller = null

  function update(patch) {
    state = { ...state, ...patch }
    onChange?.(state)
  }

  function remember(key, entry) {
    cache.delete(key)
    cache.set(key, entry)
    if (cache.size > PREVIEW_CACHE_SIZE) cache.delete(cache.keys().next().value)
  }

  // Stop whatever the previous load was doing and claim a new generation.
  function supersede() {
    clearTimer(timer)
    timer = null
    controller?.abort()
    controller = new AbortController()
    return { id: ++generation, signal: controller.signal }
  }

  // `ticket` = { id, signal } from supersede(); stale once a newer load starts.
  async function run(ticket, key, { document, preview }) {
    timer = null
    try {
      const response = preview ?? await api.requestPreview(document, { signal: ticket.signal })
      const plan = await api.fetchPlan(response.plan.url, { signal: ticket.signal })
      if (ticket.id !== generation) return
      remember(key, { preview: response, plan })
      update({ preview: response, plan, pending: false })
    } catch (err) {
      if (isAbort(err) || ticket.id !== generation) return
      if (err?.code === 'PREVIEW_BUSY') {
        timer = setTimer(() => run(ticket, key, { document }), err.details?.retryAfterMs ?? DEFAULT_RETRY_MS)
        return
      }
      update({ pending: false })
      onError?.(err)
    }
  }

  function load(document, { immediate = false } = {}) {
    const ticket = supersede()
    const key = previewKey(document)
    const cached = cache.get(key)
    if (cached) {
      remember(key, cached)
      update({ ...cached, pending: false })
      return
    }
    update({ pending: true })
    timer = setTimer(() => run(ticket, key, { document }), immediate ? 0 : debounceMs)
  }

  function show(preview, document) {
    const ticket = supersede()
    update({ pending: true })
    run(ticket, previewKey(document), { preview })
  }

  function dispose() {
    supersede()
  }

  return { load, show, dispose, getState: () => state }
}
