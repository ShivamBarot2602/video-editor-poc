import { fmtSize } from '../../lib/format.js'

// Upload screen progress card (05 §2): bytes sent / total + Cancel. While
// the server checks the file ('completing') Cancel is gone — it can't stop that.
export default function UploadProgress({ fileName, phase, sentBytes, totalBytes, onCancel }) {
  const percent = totalBytes > 0 ? Math.floor((sentBytes / totalBytes) * 100) : 0
  const completing = phase === 'completing'

  return (
    <div className="sc-progress-card">
      <div className="sc-progress-head">
        <span className="sc-progress-name" title={fileName}>{fileName}</span>
        {!completing && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        )}
      </div>
      <div
        className="sc-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Upload progress"
      >
        <div className="sc-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="sc-progress-meta">
        <span>{completing ? 'Checking the video…' : `${fmtSize(sentBytes)} of ${fmtSize(totalBytes)}`}</span>
        <span>{percent}%</span>
      </div>
    </div>
  )
}
