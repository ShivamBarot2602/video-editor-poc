import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { clampMs } from '../core/time.js'

// The editor's single source of time (spec 05 §4–§6). One hidden <video>
// plays the proxy/source; the preview canvas, transport and timeline all read
// time from here and never from their own elements.
//
// Split in two so the logic is testable without a DOM:
//   createPlayerController(video) — plain JS state machine over a <video>
//   usePlayer({ src, durationMs }) — creates the element, mirrors state to React
//
// `currentMs` in React state updates every presented frame while playing.
// Per-frame visuals (canvas, playhead) should use `onFrame` instead of
// re-rendering on it.

export function createPlayerController(video, {
  requestFrame = (cb) => globalThis.requestAnimationFrame(cb),
  cancelFrame = (id) => globalThis.cancelAnimationFrame(id),
} = {}) {
  // ── State + subscribers ──────────────────────────────────────────────────
  let state = {
    currentMs: 0,
    durationMs: 0,
    playing: false,
    muted: video.muted,
    ready: false,
    error: null,
  }
  const listeners = new Set()
  const frameListeners = new Set()
  let knownDurationMs = 0 // timing.durationMs from the API; wins over video.duration
  let scrub = null // { wasPlaying, pendingMs, frameId } while the user drags

  function setState(patch) {
    const changed = Object.keys(patch).some((key) => state[key] !== patch[key])
    if (!changed) return
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  const videoMs = () => video.currentTime * 1000
  const videoDurationMs = () => (Number.isFinite(video.duration) ? video.duration * 1000 : 0)
  const durationMs = () => knownDurationMs || videoDurationMs()

  // A new frame is on screen at `ms`. While scrubbing the playhead follows the
  // pointer, so a late `seeked` must not pull `currentMs` back.
  function emitFrame(ms) {
    if (!scrub) setState({ currentMs: ms })
    frameListeners.forEach((cb) => cb(ms))
  }

  // ── Playback loop: one tick per presented frame while playing ────────────
  // requestVideoFrameCallback gives the exact frame time (mediaTime);
  // requestAnimationFrame + currentTime is the fallback (Firefox < 132).
  let loop = null

  function scheduleTick() {
    if (typeof video.requestVideoFrameCallback === 'function') {
      loop = { video: true, id: video.requestVideoFrameCallback((_, meta) => tick(meta.mediaTime * 1000)) }
    } else {
      loop = { video: false, id: requestFrame(() => tick(videoMs())) }
    }
  }

  function tick(ms) {
    loop = null
    if (!state.playing) return
    emitFrame(ms)
    scheduleTick()
  }

  function stopLoop() {
    if (!loop) return
    if (loop.video) video.cancelVideoFrameCallback(loop.id)
    else cancelFrame(loop.id)
    loop = null
  }

  // The draw at `seeked` can still paint the previous frame (seen in Chrome
  // while another video was decoding), and nothing redraws a paused video
  // after that. So every seek also asks for the next presented frame — which
  // rVFC reports even when paused. It must be registered when the seek is
  // *issued*: Chrome can present the frame before `seeked` fires.
  let presentedId = null

  function emitWhenPresented() {
    // video.paused, not state.playing: right after scrubStart() the `pause`
    // event (which updates state) hasn't fired yet.
    if (typeof video.requestVideoFrameCallback !== 'function' || !video.paused) return
    if (presentedId != null) video.cancelVideoFrameCallback(presentedId)
    presentedId = video.requestVideoFrameCallback(() => {
      presentedId = null
      emitFrame(videoMs())
    })
  }

  function cancelPresented() {
    if (presentedId != null) video.cancelVideoFrameCallback(presentedId)
    presentedId = null
  }

  // ── <video> events ───────────────────────────────────────────────────────
  const handlers = {
    play: () => {
      setState({ playing: true })
      cancelPresented() // the playback loop takes over
      if (!loop) scheduleTick()
    },
    pause: () => {
      setState({ playing: false })
      stopLoop()
      emitFrame(videoMs())
    },
    seeked: () => emitFrame(videoMs()),
    loadeddata: () => {
      setState({ ready: true })
      emitFrame(videoMs())
    },
    loadedmetadata: () => setState({ durationMs: durationMs() }),
    durationchange: () => setState({ durationMs: durationMs() }),
    volumechange: () => setState({ muted: video.muted }),
    error: () => setState({ error: video.error?.message || 'This video could not be loaded.' }),
  }
  handlers.ended = handlers.pause

  let attached = false

  // Idempotent, so React StrictMode's mount → unmount → mount is safe.
  function attach() {
    if (attached) return
    attached = true
    for (const [type, handler] of Object.entries(handlers)) video.addEventListener(type, handler)
    setState({ durationMs: durationMs(), playing: !video.paused, muted: video.muted })
  }

  function detach() {
    if (!attached) return
    attached = false
    for (const [type, handler] of Object.entries(handlers)) video.removeEventListener(type, handler)
    stopLoop()
    cancelPresented()
    cancelScrubFrame()
  }

  // ── Transport ────────────────────────────────────────────────────────────
  function play() {
    // Rejections (autoplay policy, src swapped mid-load) leave the element
    // paused and fire no `play` event, so `playing` is already right.
    video.play()?.catch(() => {})
  }

  const pause = () => video.pause()
  const toggle = () => (video.paused ? play() : pause())

  function seek(ms) {
    const target = clampMs(ms, durationMs())
    emitWhenPresented()
    video.currentTime = target / 1000
    setState({ currentMs: target })
  }

  const getCurrentMs = () => scrub?.pendingMs ?? videoMs()
  const step = (deltaMs) => seek(getCurrentMs() + deltaMs)
  const setMuted = (muted) => { video.muted = muted }

  // ── Scrubbing (05 §5): pause while dragging, at most one seek per
  // animation frame, fastSeek (nearest keyframe) during the drag, exact
  // seek on release, then restore the play state.
  function scrubStart() {
    if (scrub) return
    scrub = { wasPlaying: !video.paused, pendingMs: null, frameId: null }
    video.pause()
  }

  function scrubTo(ms) {
    if (!scrub) scrubStart()
    scrub.pendingMs = clampMs(ms, durationMs())
    setState({ currentMs: scrub.pendingMs })
    if (scrub.frameId == null) scrub.frameId = requestFrame(applyScrubSeek)
  }

  function applyScrubSeek() {
    if (!scrub) return
    scrub.frameId = null
    const seconds = scrub.pendingMs / 1000
    emitWhenPresented()
    if (typeof video.fastSeek === 'function') video.fastSeek(seconds)
    else video.currentTime = seconds
  }

  function cancelScrubFrame() {
    if (scrub?.frameId != null) cancelFrame(scrub.frameId)
    if (scrub) scrub.frameId = null
  }

  function scrubEnd(ms) {
    if (!scrub) return
    const target = ms ?? scrub.pendingMs ?? videoMs()
    const { wasPlaying } = scrub
    cancelScrubFrame()
    scrub = null
    seek(target)
    if (wasPlaying) play()
  }

  // ── Source / duration ────────────────────────────────────────────────────

  // Swapping src (e.g. a re-signed URL after urlsExpireAt) keeps position and
  // play state. Compares the attribute, not a cached value, so re-setting
  // the same URL after a release (StrictMode remount) still loads it.
  function setSource(src) {
    if (!src || video.getAttribute('src') === src) return
    const resumeMs = state.currentMs
    const wasPlaying = state.playing
    video.addEventListener('loadedmetadata', () => {
      if (resumeMs > 0) video.currentTime = resumeMs / 1000
      if (wasPlaying) play()
    }, { once: true })
    setState({ ready: false, error: null })
    video.src = src
  }

  function setDuration(ms) {
    knownDurationMs = ms > 0 ? ms : 0
    setState({ durationMs: durationMs() })
  }

  // Calls `cb(ms)` for every frame presented while playing and after every
  // seek / first load. Returns an unsubscribe function.
  function onFrame(cb) {
    frameListeners.add(cb)
    return () => frameListeners.delete(cb)
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    attach, detach, subscribe,
    getState: () => state,
    getCurrentMs, onFrame, setSource, setDuration,
    play, pause, toggle, seek, step, setMuted,
    scrubStart, scrubTo, scrubEnd,
  }
}

// Kept in the document (not detached) but invisible: browsers only fire
// requestVideoFrameCallback — and Safari only decodes frames — for a video
// that is rendered. `display: none` would stop both.
const HIDDEN_VIDEO_STYLE = {
  position: 'fixed', left: '0', top: '0', width: '1px', height: '1px',
  opacity: '0', pointerEvents: 'none', zIndex: '-1',
}

function createHiddenVideo() {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous' // drawImage onto the canvas needs CORS (05 §4)
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('aria-hidden', 'true')
  Object.assign(video.style, HIDDEN_VIDEO_STYLE)
  return video
}

// Stop playback and drop the media resource so the browser stops buffering.
function releaseVideo(video) {
  video.pause()
  video.removeAttribute('src')
  video.load()
  video.remove()
}

/**
 * usePlayer({ src, durationMs }) → {
 *   video, currentMs, durationMs, playing, muted, ready, error,
 *   play, pause, toggle, seek, step, setMuted,
 *   scrubStart, scrubTo, scrubEnd, onFrame, getCurrentMs,
 * }
 * `durationMs` should be timing.durationMs from GET /editor (authoritative;
 * the element's own duration is the fallback until it is known).
 */
export function usePlayer({ src, durationMs } = {}) {
  const [video] = useState(createHiddenVideo)
  const [player] = useState(() => createPlayerController(video))

  useEffect(() => {
    document.body.appendChild(video)
    player.attach()
    return () => {
      player.detach()
      releaseVideo(video)
    }
  }, [video, player])

  useEffect(() => { player.setSource(src) }, [player, src])
  useEffect(() => { player.setDuration(durationMs) }, [player, durationMs])

  const state = useSyncExternalStore(player.subscribe, player.getState)

  return useMemo(() => ({
    video,
    ...state,
    play: player.play,
    pause: player.pause,
    toggle: player.toggle,
    seek: player.seek,
    step: player.step,
    setMuted: player.setMuted,
    scrubStart: player.scrubStart,
    scrubTo: player.scrubTo,
    scrubEnd: player.scrubEnd,
    onFrame: player.onFrame,
    getCurrentMs: player.getCurrentMs,
  }), [video, player, state])
}
