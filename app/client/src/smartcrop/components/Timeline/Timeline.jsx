import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import Ruler from './Ruler.jsx'
import ClipTrack from './ClipTrack.jsx'
import Playhead from './Playhead.jsx'
import { useFallbackThumbnails } from '../../hooks/useFallbackThumbnails.js'
import { MAX_PX_PER_MS, fitPxPerMs, zoomPxPerMs } from '../../core/time.js'
import {
  TIMELINE_PAD,
  contentWidth,
  fallbackThumbCount,
  followScroll,
  isTypingTarget,
  keyAction,
  msToX,
  scrollAfterZoom,
  xToMs,
} from '../../core/timeline.js'

// Timeline (spec 05 §5): ruler, one clip with a thumbnail strip, playhead,
// scrubbing, zoom, keyboard. Time always comes from the player.

// Width and scroll position of the scroll container.
function useViewport(scrollRef) {
  const [view, setView] = useState({ width: 0, scrollLeft: 0 })

  useEffect(() => {
    const el = scrollRef.current
    const measure = () => setView({ width: el.clientWidth, scrollLeft: el.scrollLeft })
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [scrollRef])

  return view
}

// Space / ←→ / Shift+←→ / Home / End anywhere on the page, except in a field.
// `enabled: false` while something else owns the keyboard (the result modal).
function useTimelineKeys(player, durationMs, enabled) {
  const { toggle, step, seek } = player

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(e) {
      if (isTypingTarget(e.target)) return
      const action = keyAction(e, durationMs)
      if (!action) return
      e.preventDefault() // no page scroll, no button activation
      if (action.type === 'toggle') { if (!e.repeat) toggle() }
      else if (action.type === 'step') step(action.ms)
      else seek(action.ms)
    }
    // A focused button "clicks" on Space keyup; we already toggled on keydown.
    function onKeyUp(e) {
      if (e.key === ' ' && !isTypingTarget(e.target)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [toggle, step, seek, durationMs, enabled])
}

// Pointer scrubbing (05 §5): pointerdown anywhere on the content seeks there;
// dragging keeps seeking (the player throttles to one seek per frame and
// pauses meanwhile); release does the exact seek and restores play state.
function useScrubbing(contentRef, player, pxPerMs, durationMs) {
  const scrubbingRef = useRef(false)
  const msAt = (e) => xToMs(e.clientX - contentRef.current.getBoundingClientRect().left, pxPerMs, durationMs)

  const handlers = {
    onPointerDown(e) {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      scrubbingRef.current = true
      player.scrubStart()
      player.scrubTo(msAt(e))
    },
    onPointerMove(e) {
      if (scrubbingRef.current) player.scrubTo(msAt(e))
    },
    onPointerUp(e) {
      if (!scrubbingRef.current) return
      scrubbingRef.current = false
      player.scrubEnd(msAt(e))
    },
    onPointerCancel() {
      if (!scrubbingRef.current) return
      scrubbingRef.current = false
      player.scrubEnd()
    },
  }
  return { handlers, scrubbingRef }
}

export default function Timeline({ player, durationMs, media, keyboardEnabled = true }) {
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const view = useViewport(scrollRef)

  // Zoom: null = fit the whole video (follows resizes); else px per ms.
  const fit = fitPxPerMs(view.width - TIMELINE_PAD * 2, durationMs)
  const [zoom, setZoom] = useState(null)
  const pxPerMs = Math.max(fit, zoom ?? fit)
  const pendingScrollRef = useRef(null)

  function zoomBy(factor) {
    const next = zoomPxPerMs(pxPerMs, factor, fit)
    pendingScrollRef.current = scrollAfterZoom({
      anchorMs: player.getCurrentMs(),
      oldPxPerMs: pxPerMs,
      newPxPerMs: next,
      scrollLeft: view.scrollLeft,
      viewWidth: view.width,
      durationMs,
    })
    setZoom(next <= fit ? null : next)
  }

  // Apply the zoom's scroll once the wider/narrower content is laid out.
  useLayoutEffect(() => {
    if (pendingScrollRef.current == null) return
    scrollRef.current.scrollLeft = pendingScrollRef.current
    pendingScrollRef.current = null
  }, [pxPerMs])

  const { handlers, scrubbingRef } = useScrubbing(contentRef, player, pxPerMs, durationMs)
  useTimelineKeys(player, durationMs, keyboardEnabled)

  // Keep the playhead in view when it moves (playback, keyboard jumps) — not
  // on manual scrolls, so the user can look elsewhere while paused. Reads the
  // live scroll position: after a zoom, `view` is a render behind.
  const playheadX = msToX(player.currentMs, pxPerMs)
  useEffect(() => {
    const el = scrollRef.current
    if (scrubbingRef.current || !el?.clientWidth) return
    const next = followScroll({ playheadX, scrollLeft: el.scrollLeft, viewWidth: el.clientWidth })
    if (next != null) el.scrollLeft = next
  }, [playheadX, scrubbingRef])

  // Fallback strip size is fixed at the first measured width (05 §5), so a
  // resize or zoom doesn't restart the capture.
  const [thumbCount, setThumbCount] = useState(0)
  useEffect(() => {
    if (view.width && !thumbCount) setThumbCount(fallbackThumbCount(view.width))
  }, [view.width, thumbCount])
  const fallbackThumbs = useFallbackThumbnails({
    url: media.video.url,
    durationMs,
    count: thumbCount,
    enabled: !media.thumbnails,
  })

  // Render a little beyond the edges so scrolling doesn't show blanks.
  const fromX = view.scrollLeft - view.width / 2
  const toX = view.scrollLeft + view.width * 1.5
  const ready = pxPerMs > 0

  return (
    <div className="sc-timeline-inner">
      <div className="sc-timeline-toolbar">
        <button type="button" className="sc-icon-btn" aria-label="Zoom out" title="Zoom out"
          onClick={() => zoomBy(0.5)} disabled={zoom == null}>
          <ZoomOut size={18} />
        </button>
        <button type="button" className="sc-icon-btn" aria-label="Zoom in" title="Zoom in"
          onClick={() => zoomBy(2)} disabled={!ready || pxPerMs >= Math.max(MAX_PX_PER_MS, fit)}>
          <ZoomIn size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="sc-timeline-scroll">
        {ready && (
          <div
            ref={contentRef}
            className="sc-timeline-content"
            style={{ width: contentWidth(durationMs, pxPerMs) }}
            role="slider"
            aria-label="Timeline"
            aria-valuemin={0}
            aria-valuemax={durationMs}
            aria-valuenow={Math.round(player.currentMs)}
            {...handlers}
          >
            <Ruler durationMs={durationMs} pxPerMs={pxPerMs} fromX={fromX} toX={toX} />
            <ClipTrack
              durationMs={durationMs}
              pxPerMs={pxPerMs}
              media={media}
              fallbackThumbs={fallbackThumbs}
              fromX={fromX}
              toX={toX}
            />
            <Playhead x={playheadX} />
          </div>
        )}
      </div>
    </div>
  )
}
