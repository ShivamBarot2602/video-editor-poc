import { Link } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, Plus } from 'lucide-react'
import ProjectCard from '../smartcrop/components/ProjectCard.jsx'
import { useProjectList } from '../smartcrop/hooks/useProjectList.js'
import '../smartcrop/smartcrop.css'

// /smartcrop/projects — every uploaded project, newest first. A card opens
// /smartcrop/:projectId (the editor once the project is READY).
export default function SmartcropProjects() {
  const { items, loading, error, hasMore, loadMore, reload } = useProjectList()
  const firstLoad = loading && items.length === 0

  return (
    <div className="sc-root">
      <header className="sc-topbar">
        <Link to="/" className="sc-icon-btn" aria-label="Back to home">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="sc-topbar-title">SmartCrop projects</h1>
        <div className="sc-topbar-actions">
          <Link to="/smartcrop" className="sc-pill-btn"><Plus size={16} /> New video</Link>
        </div>
      </header>

      <main className="sc-projects">
        {firstLoad && (
          <div className="sc-projects-message">
            <LoaderCircle size={26} className="sc-spinner" />
          </div>
        )}

        {error && items.length === 0 && (
          <div className="sc-projects-message" role="alert">
            <p className="sc-failed-message">{error.message}</p>
            <button type="button" className="sc-ghost-btn" onClick={reload}>Try again</button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="sc-projects-message">
            <p className="sc-failed-title">No projects yet</p>
            <p className="sc-failed-message">Upload a video to reframe it for every format.</p>
            <Link to="/smartcrop" className="sc-pill-btn"><Plus size={16} /> Upload a video</Link>
          </div>
        )}

        {items.length > 0 && (
          <>
            <div className="sc-project-grid">
              {items.map((project) => <ProjectCard key={project.projectId} project={project} />)}
            </div>
            {error && <p className="sc-inline-error" role="alert">{error.message}</p>}
            {hasMore && (
              <button type="button" className="sc-ghost-btn sc-load-more" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  )
}
