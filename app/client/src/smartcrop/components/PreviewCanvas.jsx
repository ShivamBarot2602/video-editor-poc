import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { drawFrame } from '../core/frameLayout.js'

// The cropped preview (spec 05 §4): the player's hidden <video> drawn through
// the plan onto a canvas. The canvas keeps the plan's pixel size (1080×1920 …)
// and is CSS-scaled to fit `containerRef`, which is also what goes fullscreen.

// Output size per aspect, used until the first plan arrives.
const CANVAS_BY_ASPECT = {
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
}

// Largest size with the canvas's aspect that fits the container.
function useFittedSize(containerRef, { width, height }) {
  const [box, setBox] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      setBox({ width: w, height: h })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  const scale = Math.min(box.width / width, box.height / height) || 0
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) }
}

function clearToBlack(ctx) {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
}

export default function PreviewCanvas({ player, plan, aspect, pending, containerRef }) {
  const canvasRef = useRef(null)
  const size = plan?.canvas ?? CANVAS_BY_ASPECT[aspect] ?? CANVAS_BY_ASPECT['9:16']
  const fitted = useFittedSize(containerRef, size)
  const { video, onFrame, getCurrentMs } = player

  // Redraw on every presented frame / seek, and right away when the plan or
  // canvas size changes (resizing a canvas clears it).
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    const draw = (ms) => (plan ? drawFrame(ctx, video, plan, ms) : clearToBlack(ctx))
    draw(getCurrentMs())
    return onFrame(draw)
  }, [plan, video, onFrame, getCurrentMs, size.width, size.height])

  return (
    <div ref={containerRef} className="sc-preview">
      {/* Sized to the canvas, so overlays sit on its corners, not the stage's. */}
      <div className="sc-preview-frame">
        <canvas
          ref={canvasRef}
          className="sc-preview-canvas"
          width={size.width}
          height={size.height}
          style={fitted}
          onClick={player.toggle}
          aria-label="Cropped preview. Click to play or pause."
        />
        {pending && (
          <span className="sc-preview-pending" role="status" aria-label="Updating preview">
            <LoaderCircle size={16} className="sc-spinner" />
          </span>
        )}
      </div>
      {player.error && <p className="sc-preview-message" role="alert">{player.error}</p>}
    </div>
  )
}
