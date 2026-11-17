import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { MAX_PX_PER_MS, fitPxPerMs, zoomPxPerMs, ticks, formatMs, clampMs } from '../smartcrop/core/time.js'
import { TIMELINE_PAD, msToX, xToMs, contentWidth, followScroll, scrollAfterZoom, keyAction } from '../smartcrop/core/timeline.js'

// Opening zoom: 40 px per second keeps caption text readable. Never narrower
// than "fit", so short videos still fill the width.
const DEFAULT_PX_PER_MS = 0.04

/**
 * Multi-lane timeline driven by a plain <video>: ruler, lanes of time blocks,
 * playhead, click/drag scrubbing, zoom, follow-playback and keyboard
 * (Space, ←/→ 1 s, Shift+←/→ 1 frame, Home/End while focused). Geometry comes
 * from smartcrop/core so both editors scale and scroll the same way.
 *
 * videoRef   ref to the <video> that owns time
 * lanes      [{ id, label, blocks: [{ key, start, end (seconds), text?, color }] }]
 */
export default function Timeline({ videoRef, lanes }) {
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const scrubRef = useRef(null) // { wasPlaying } while dragging
  const pendingScrollRef = useRef(null)
  const [view, setView] = useState({ width: 0, scrollLeft: 0 })
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [zoom, setZoom] = useState(DEFAULT_PX_PER_MS) // null = fit

  useEffect(() => {
    const el = scrollRef.current
    const measure = () => setView({ width: el.clientWidth, scrollLeft: el.scrollLeft })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [])

  // Time comes from the video: every frame while playing (timeupdate is only
  // ~4 Hz, which makes the playhead jump), on events otherwise.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let raf = 0
    const read = () => setCurrentMs(video.currentTime * 1000)
    const readDuration = () => { if (Number.isFinite(video.duration)) setDurationMs(video.duration * 1000) }
    const loop = () => { read(); raf = requestAnimationFrame(loop) }
    const onPlay = () => { cancelAnimationFrame(raf); loop() }
    const onPause = () => { cancelAnimationFrame(raf); read() }
    readDuration()
    read()
    if (!video.paused) onPlay()
    const events = { loadedmetadata: readDuration, durationchange: readDuration, play: onPlay, pause: onPause, seeking: read, seeked: read }
    for (const [name, fn] of Object.entries(events)) video.addEventListener(name, fn)
    return () => {
      cancelAnimationFrame(raf)
      for (const [name, fn] of Object.entries(events)) video.removeEventListener(name, fn)
    }
  }, [videoRef])

  const fit = fitPxPerMs(view.width - TIMELINE_PAD * 2, durationMs)
  const pxPerMs = zoom == null ? fit : Math.min(Math.max(fit, zoom), Math.max(MAX_PX_PER_MS, fit))
  const ready = pxPerMs > 0

  function zoomTo(next) {
    pendingScrollRef.current = scrollAfterZoom({
      anchorMs: currentMs, oldPxPerMs: pxPerMs, newPxPerMs: next,
      scrollLeft: view.scrollLeft, viewWidth: view.width, durationMs,
    })
    setZoom(next <= fit ? null : next)
  }

  useLayoutEffect(() => {
    if (pendingScrollRef.current == null) return
    scrollRef.current.scrollLeft = pendingScrollRef.current
    pendingScrollRef.current = null
  }, [pxPerMs])

  // Keep the playhead in view as it moves; not on manual scrolls or while dragging.
  const playheadX = msToX(currentMs, pxPerMs)
  useEffect(() => {
    const el = scrollRef.current
    if (scrubRef.current || !el?.clientWidth || !ready) return
    const next = followScroll({ playheadX, scrollLeft: el.scrollLeft, viewWidth: el.clientWidth })
    if (next != null) el.scrollLeft = next
  }, [playheadX, ready])

  function seek(ms) {
    const video = videoRef.current
    if (!video) return
    const clamped = clampMs(ms, durationMs)
    video.currentTime = clamped / 1000
    setCurrentMs(clamped)
  }

  const msAt = e => xToMs(e.clientX - contentRef.current.getBoundingClientRect().left, pxPerMs, durationMs)

  const handlers = {
    onPointerDown(e) {
      if (e.button !== 0) return
      const video = videoRef.current
      e.currentTarget.setPointerCapture(e.pointerId)
      scrubRef.current = { wasPlaying: video && !video.paused }
      video?.pause()
      seek(msAt(e))
    },
    onPointerMove(e) {
      if (scrubRef.current) seek(msAt(e))
    },
    onPointerUp(e) {
      if (!scrubRef.current) return
      const { wasPlaying } = scrubRef.current
      scrubRef.current = null
      seek(msAt(e))
      if (wasPlaying) videoRef.current?.play().catch(() => {})
    },
    onPointerCancel() { scrubRef.current = null },
    onKeyDown(e) {
      const action = keyAction(e, durationMs)
      if (!action) return
      e.preventDefault()
      const video = videoRef.current
      if (action.type === 'toggle') { if (!e.repeat && video) video.paused ? video.play().catch(() => {}) : video.pause() }
      else if (action.type === 'step') seek(currentMs + action.ms)
      else seek(action.ms)
    },
  }

  // Only what's near the viewport is rendered — long videos have thousands of blocks.
  const fromX = view.scrollLeft - view.width / 2
  const toX = view.scrollLeft + view.width * 1.5
  const visibleTicks = ready ? ticks(durationMs, pxPerMs, {
    fromMs: Math.max(0, (fromX - TIMELINE_PAD) / pxPerMs),
    toMs: (toX - TIMELINE_PAD) / pxPerMs,
  }) : []

  return (
    <div className="tl">
      <div className="tl-heads">
        <div className="tl-head tl-head-ruler">
          <button type="button" className="tl-zoom" aria-label="Zoom out" title="Zoom out"
            onClick={() => zoomTo(zoomPxPerMs(pxPerMs, 0.5, fit))} disabled={!ready || zoom == null}>
            <ZoomOut size={14} />
          </button>
          <button type="button" className="tl-zoom" aria-label="Zoom in" title="Zoom in"
            onClick={() => zoomTo(zoomPxPerMs(pxPerMs, 2, fit))} disabled={!ready || pxPerMs >= Math.max(MAX_PX_PER_MS, fit)}>
            <ZoomIn size={14} />
          </button>
          <button type="button" className="tl-zoom" aria-label="Fit the whole video" title="Fit the whole video"
            onClick={() => zoomTo(fit)} disabled={!ready || zoom == null}>
            <Maximize2 size={13} />
          </button>
        </div>
        {lanes.map(lane => <div key={lane.id} className="tl-head">{lane.label}</div>)}
      </div>

      <div ref={scrollRef} className="tl-scroll">
        {ready && (
          <div
            ref={contentRef}
            className="tl-content"
            style={{ width: contentWidth(durationMs, pxPerMs) }}
            role="slider"
            tabIndex={0}
            aria-label="Playhead"
            aria-valuemin={0}
            aria-valuemax={Math.round(durationMs)}
            aria-valuenow={Math.round(currentMs)}
            aria-valuetext={formatMs(currentMs)}
            {...handlers}
          >
            {visibleTicks.map(({ ms, label }) => (
              <span key={ms} className="tl-tick tc" style={{ left: msToX(ms, pxPerMs) }}>{label}</span>
            ))}
            <div className="tl-ruler" />
            {lanes.map(lane => (
              <div key={lane.id} className="tl-lane">
                {lane.blocks.map(b => {
                  const left = msToX(b.start * 1000, pxPerMs)
                  const width = Math.max(2, (b.end - b.start) * 1000 * pxPerMs)
                  if (left + width < fromX || left > toX) return null
                  const on = currentMs >= b.start * 1000 && currentMs < b.end * 1000
                  return (
                    <span key={b.key} className={on ? 'tl-blk on' : 'tl-blk'} style={{ left, width, '--c': b.color }} title={b.text}>
                      {width > 24 && b.text}
                    </span>
                  )
                })}
              </div>
            ))}
            <div className="tl-playhead" style={{ transform: `translateX(${playheadX}px)` }} aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  )
}
