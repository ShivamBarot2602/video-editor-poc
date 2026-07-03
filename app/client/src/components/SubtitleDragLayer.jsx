import { useCallback, useEffect, useState } from 'react'

const DEFAULT_CUSTOM_POSITION = { x: 0.5, y: 0.9 }

// Computes the video's actual displayed content rect within its element box —
// object-fit:contain letterboxes, so the element box and the video pixels
// rarely match. Every coordinate the drag handle reports is normalized
// against this rect, not the element box, so it lines up with libass's
// PlayResX/PlayResY space (which only covers the video frame itself).
function getContentRect(video, container) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const containerRect = container.getBoundingClientRect()
  const videoRect = video.getBoundingClientRect()
  const scale = Math.min(videoRect.width / vw, videoRect.height / vh)
  const contentW = vw * scale
  const contentH = vh * scale
  const offsetX = videoRect.left - containerRect.left + (videoRect.width - contentW) / 2
  const offsetY = videoRect.top - containerRect.top + (videoRect.height - contentH) / 2

  return { offsetX, offsetY, contentW, contentH }
}

// Draggable handle marking where subtitles render when style.position is
// 'custom'. Only the handle itself captures pointer events — the rest of the
// video (controls, clicks, scrubbing) is untouched.
export default function SubtitleDragLayer({ videoRef, containerRef, customPosition, onChange }) {
  const [rect, setRect] = useState(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const video = videoRef?.current
    const container = containerRef?.current
    if (!video || !container) return

    const update = () => setRect(getContentRect(video, container))
    update()

    const ro = new ResizeObserver(update)
    ro.observe(container)
    video.addEventListener('loadedmetadata', update)
    return () => {
      ro.disconnect()
      video.removeEventListener('loadedmetadata', update)
    }
  }, [videoRef, containerRef])

  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) { /* no active pointer session to capture */ }
    setDragging(true)
  }, [])

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return
    const container = containerRef?.current
    if (!container || !rect) return
    const containerRect = container.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - containerRect.left - rect.offsetX) / rect.contentW))
    const y = Math.min(1, Math.max(0, (e.clientY - containerRect.top - rect.offsetY) / rect.contentH))
    onChange({ x, y })
  }, [dragging, containerRef, rect, onChange])

  const handlePointerUp = useCallback((e) => {
    setDragging(false)
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch (_) { /* capture may already be gone */ }
  }, [])

  if (!rect) return null

  const pos = customPosition || DEFAULT_CUSTOM_POSITION
  const handleLeft = rect.offsetX + pos.x * rect.contentW
  const handleTop = rect.offsetY + pos.y * rect.contentH

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}
    >
      <div
        onPointerDown={handlePointerDown}
        title="Drag to position subtitles"
        style={{
          position: 'absolute',
          left: handleLeft,
          top: handleTop,
          transform: 'translate(-50%, -50%)',
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: dragging ? 'var(--accent)' : 'var(--accent-dim)',
          border: '2px solid var(--accent)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          cursor: dragging ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
      />
    </div>
  )
}
