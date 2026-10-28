import { Link } from 'react-router-dom'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import VideoBox from './VideoBox.jsx'

// Failed screen (05 §2): the error, "Try again" when the server allows a
// retry, and always a way to start over with another file.
export default function FailedPanel({ aspect, title, message, retryable, onRetry, retrying, retryError }) {
  return (
    <VideoBox aspect={aspect}>
      <span className="sc-failed-icon"><TriangleAlert size={24} /></span>
      <h2 className="sc-failed-title">{title}</h2>
      <p className="sc-failed-message">{message}</p>
      {retryError && <p className="sc-inline-error" role="alert">{retryError}</p>}
      <div className="sc-failed-actions">
        {retryable && (
          <button type="button" className="sc-pill-btn" onClick={onRetry} disabled={retrying}>
            <RotateCcw size={14} />
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        )}
        <Link to="/smartcrop" className="sc-ghost-btn">Upload another video</Link>
      </div>
    </VideoBox>
  )
}
