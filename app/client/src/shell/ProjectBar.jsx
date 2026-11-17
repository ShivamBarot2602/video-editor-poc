import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Captions, Scissors, Image as ImageIcon } from 'lucide-react'
import { getVideoOrNull } from '../api/videos'
import { useJobs } from './jobs'
import JobsTray from './JobsTray'

// Top bar shared by every tool page of one video: breadcrumb back to the
// Library, a tab per tool (with a done / running dot), the jobs tray, and the
// page's own actions as children.
// `video` ({ filename, providers, hasClips }) is passed by pages that load it
// themselves (null while they are loading); when the prop is left out the bar
// fetches it.
export default function ProjectBar({ videoId, video: given, children }) {
  const { pathname } = useLocation()
  const [fetched, setFetched] = useState(undefined) // undefined = loading, null = not found
  const jobs = useJobs(videoId)

  useEffect(() => {
    if (given !== undefined || !videoId) return
    let cancel = false
    getVideoOrNull(videoId).then(v => { if (!cancel) setFetched(v) }).catch(() => {})
    return () => { cancel = true }
  }, [videoId, given])

  const video = given || fetched
  const runningTools = new Set(jobs.map(j => j.tool))

  const tools = [
    { id: 'captions', label: 'Captions', icon: Captions, to: `/v/${videoId}/captions`, done: video?.providers?.length > 0 },
    { id: 'clips', label: 'Clips', icon: Scissors, to: `/v/${videoId}/clips`, done: video?.hasClips },
    { id: 'thumbnails', label: 'Thumbnails', icon: ImageIcon, to: `/v/${videoId}/thumbnails`, done: false },
  ]

  return (
    <header className="pbar">
      <nav className="pbar-crumb" aria-label="Breadcrumb">
        <Link to="/">Library</Link>
        <span aria-hidden="true">/</span>
        <span className="pbar-title" title={video?.filename}>{video?.filename || (fetched === null ? 'Video not found' : 'Loading…')}</span>
      </nav>

      <nav className="pbar-tabs" aria-label="Tools">
        {tools.map(({ id, label, icon: Icon, to, done }) => {
          const active = pathname.startsWith(to)
          const state = runningTools.has(id) ? 'run' : done ? 'ok' : null
          return (
            <Link key={id} to={to} className={active ? 'pbar-tab active' : 'pbar-tab'} aria-current={active ? 'page' : undefined}>
              <Icon size={15} strokeWidth={1.8} />
              {label}
              {state && <span className={`pbar-dot pbar-dot-${state}`} aria-label={state === 'run' ? 'running' : 'has results'} />}
            </Link>
          )
        })}
      </nav>

      <div className="pbar-actions">
        <JobsTray videoId={videoId} />
        {children}
      </div>
    </header>
  )
}
