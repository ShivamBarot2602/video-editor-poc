// Top bar for the Lab (internal provider comparison). Same chrome as a
// video's project bar; page actions go in as children.
export default function LabBar({ children }) {
  return (
    <header className="pbar">
      <nav className="pbar-crumb" aria-label="Breadcrumb">
        <span>Lab</span>
        <span aria-hidden="true">/</span>
        <span className="pbar-title">Compare transcription providers</span>
      </nav>
      {children && <div className="pbar-actions">{children}</div>}
    </header>
  )
}
