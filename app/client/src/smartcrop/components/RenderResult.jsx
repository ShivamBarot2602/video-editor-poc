import { useEffect, useRef } from 'react'
import { Download, X } from 'lucide-react'
import { fmtSize } from '../../lib/format.js'
import { formatMs } from '../core/time.js'

// Render result (spec 05 §2): the finished video, Download, Back to editing.
// A modal over the editor; Esc or the backdrop closes it.
export default function RenderResult({ render, onClose }) {
  const { output, aspect, outputDurationMs } = render
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const facts = [
    aspect,
    output.width && output.height ? `${output.width}×${output.height}` : null,
    outputDurationMs ? formatMs(outputDurationMs) : null,
    output.sizeBytes ? fmtSize(output.sizeBytes) : null,
  ].filter(Boolean)

  return (
    <div className="sc-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sc-modal" role="dialog" aria-modal="true" aria-labelledby="sc-result-title">
        <div className="sc-modal-head">
          <h2 id="sc-result-title" className="sc-modal-title">Your video is ready</h2>
          <button ref={closeRef} type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <video
          className="sc-result-video"
          src={output.url}
          controls
          playsInline
          style={output.width && output.height ? { aspectRatio: `${output.width} / ${output.height}` } : undefined}
        />

        <p className="sc-result-facts">{facts.join(' · ')}</p>

        <div className="sc-failed-actions">
          {/* Signed with Content-Disposition: attachment, so it downloads even cross-origin. */}
          <a className="btn btn-primary" href={output.downloadUrl} download={output.fileName}>
            <Download size={16} /> Download
          </a>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Back to editing</button>
        </div>
      </div>
    </div>
  )
}
