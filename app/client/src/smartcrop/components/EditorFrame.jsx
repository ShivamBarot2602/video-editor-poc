import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

// The SmartCrop page shell (spec 05 §2): top bar, stage, controls, timeline.
// Processing, Failed and the editor all render inside it, so the layout
// doesn't jump when a project becomes READY.
export default function EditorFrame({ title, backTo = '/smartcrop/projects', status, actions, stage, transport, controls, timeline }) {
  return (
    <div className="sc-root">
      <header className="sc-topbar">
        <Link to={backTo} className="sc-icon-btn" aria-label="Back">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="sc-topbar-title">{title}</h1>
        <div className="sc-topbar-actions">
          {status}
          {actions}
        </div>
      </header>

      <main className="sc-stage">{stage}</main>
      {transport}
      {controls && <div className="sc-controls">{controls}</div>}
      <section className="sc-timeline" aria-label="Timeline">{timeline}</section>
    </div>
  )
}

// Stands in for the timeline until it is built (05 §5).
export function TimelinePlaceholder() {
  return <div className="sc-timeline-placeholder" />
}

// `tone="error"` tints it red.
export function StatusChip({ icon, children, tone }) {
  return (
    <span className="sc-chip" data-tone={tone}>
      {icon}
      {children}
    </span>
  )
}
