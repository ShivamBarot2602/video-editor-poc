import { useEffect, useRef, useState } from 'react'
import { useJobs } from './jobs'

// "N running" button in the project bar; opens a list of this video's jobs
// with their progress. Renders nothing while nothing is running.
export default function JobsTray({ videoId }) {
  const jobs = useJobs(videoId)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (jobs.length === 0) return null

  const known = jobs.filter(j => typeof j.progress === 'number')
  const overall = known.length ? known.reduce((s, j) => s + j.progress, 0) / known.length : null

  return (
    <div className="jobs" ref={rootRef}>
      <button
        type="button"
        className="jobs-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(o => !o)}
      >
        <span
          className={overall == null ? 'jobs-ring jobs-ring-busy' : 'jobs-ring'}
          style={{ '--p': `${overall ?? 30}%` }}
          aria-hidden="true"
        />
        {jobs.length === 1 ? jobs[0].label : `${jobs.length} jobs running`}
      </button>

      {open && (
        <div className="jobs-pop" role="dialog" aria-label="Running jobs">
          {jobs.map(j => (
            <div key={j.key} className="jobs-row">
              <div className="jobs-row-top">
                <span className="jobs-row-label">{j.label}</span>
                {typeof j.progress === 'number' && (
                  <span className="jobs-row-pct">{Math.round(j.progress)}%</span>
                )}
              </div>
              <div className="progress-bar">
                <div
                  className={typeof j.progress === 'number' ? 'progress-bar-fill' : 'progress-bar-fill progress-bar-busy'}
                  style={{ width: typeof j.progress === 'number' ? `${j.progress}%` : '100%' }}
                />
              </div>
              {j.detail && <span className="jobs-row-detail">{j.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
