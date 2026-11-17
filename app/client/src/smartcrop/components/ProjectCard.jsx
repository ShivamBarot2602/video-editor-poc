import { Link } from 'react-router-dom'
import { Film, LoaderCircle } from 'lucide-react'
import { fmtDate, fmtSize } from '../../lib/format.js'
import { formatMs } from '../core/time.js'
import { lastRenderText, statusBadge } from '../core/projectList.js'

// One project in the list. The whole card links to /smartcrop/:projectId,
// which opens the screen for its status (editor when READY).

// Outline of the project's output aspect inside the card's 16:9 preview area.
function AspectFrame({ aspect = '9:16', busy }) {
  const [w, h] = aspect.split(':').map(Number)
  return (
    <div className="vcard-thumb sc-card-thumb">
      <span className="sc-card-frame" style={{ aspectRatio: `${w} / ${h}` }}>
        {busy ? <LoaderCircle size={18} className="spin" /> : <Film size={18} />}
      </span>
      <span className="sc-card-aspect">{aspect}</span>
    </div>
  )
}

export default function ProjectCard({ project }) {
  const badge = statusBadge(project)
  const render = lastRenderText(project)
  const { source } = project
  const meta = [
    source?.durationMs ? formatMs(source.durationMs) : null,
    source?.sizeBytes ? fmtSize(source.sizeBytes) : null,
    fmtDate(project.createdAt),
  ].filter(Boolean)

  return (
    <Link to={`/smartcrop/${project.projectId}`} className="vcard">
      <AspectFrame aspect={project.initial?.aspect} busy={badge.tone === 'busy'} />
      <div className="vcard-text">
        <span className="vcard-title" title={project.title}>{project.title}</span>
        <span className="vcard-meta">{meta.join(' · ')}</span>
        <span className="sc-card-footer">
          <span className={{ ok: 'chip chip-ok', busy: 'chip chip-run', error: 'chip chip-err' }[badge.tone] || 'chip'}>{badge.label}</span>
          {render && <span className="sc-card-render">{render}</span>}
        </span>
      </div>
    </Link>
  )
}
