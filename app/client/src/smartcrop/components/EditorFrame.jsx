import { Link } from 'react-router-dom'

// The SmartCrop page shell (spec 05 §2): project bar, stage, controls, timeline.
// Processing, Failed and the editor all render inside it, so the layout
// doesn't jump when a project becomes READY.
export default function EditorFrame({ title, status, actions, stage, transport, controls, timeline }) {
  return (
    <div className="sc-root">
      <header className="pbar">
        <nav className="pbar-crumb" aria-label="Breadcrumb">
          <Link to="/smartcrop/projects">Reframe</Link>
          <span aria-hidden="true">/</span>
          <h1 className="pbar-title">{title}</h1>
        </nav>
        <div className="pbar-actions">
          {status}
          {actions}
        </div>
      </header>

      <div className="sc-stage-wrap">
        <main className="sc-stage">{stage}</main>
        {transport}
      </div>
      {controls && <div className="sc-controls">{controls}</div>}
      <section className="sc-timeline" aria-label="Timeline">{timeline}</section>
    </div>
  )
}

// Stands in for the timeline until it is built (05 §5).
export function TimelinePlaceholder() {
  return <div className="sc-timeline-placeholder" />
}

// Shared status chip: tone 'run' (amber, pulsing), 'ok', 'error', or plain.
export function StatusChip({ children, tone }) {
  const cls = { run: 'chip chip-run', ok: 'chip chip-ok', error: 'chip chip-err' }[tone] || 'chip'
  return <span className={cls}>{children}</span>
}
