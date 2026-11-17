import { Link } from 'react-router-dom'
import { Crop, Plus } from 'lucide-react'
import ProjectCard from '../smartcrop/components/ProjectCard.jsx'
import { useProjectList } from '../smartcrop/hooks/useProjectList.js'

// /smartcrop/projects — every Reframe project, newest first. A card opens
// /smartcrop/:projectId (the editor once the project is READY).
export default function SmartcropProjects() {
  const { items, loading, error, hasMore, loadMore, reload } = useProjectList()
  const firstLoad = loading && items.length === 0

  return (
    <div className="lib">
      <div className="lib-inner">
        <header className="lib-head">
          <h1 className="lib-title">Reframe</h1>
          <Link to="/smartcrop" className="btn btn-primary"><Plus size={15} /> New reframe</Link>
        </header>
        <p className="sc-intro">Turn a landscape video into vertical, square or 4:5 versions that keep the speakers in frame.</p>

        {firstLoad && (
          <div className="lib-grid" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="vcard">
                <div className="vcard-thumb shimmer" />
                <div className="shimmer" style={{ height: 14, width: '70%', borderRadius: 4 }} />
              </div>
            ))}
          </div>
        )}

        {error && items.length === 0 && (
          <div className="lib-empty" role="alert">
            <strong>Couldn't load your projects</strong>
            <span>{error.message}</span>
            <button type="button" className="btn btn-secondary" onClick={reload}>Try again</button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="lib-empty">
            <Crop size={24} />
            <strong>No reframes yet</strong>
            <span>Upload a video and pick an aspect ratio. The speakers stay in frame.</span>
            <Link to="/smartcrop" className="btn btn-primary"><Plus size={15} /> New reframe</Link>
          </div>
        )}

        {items.length > 0 && (
          <>
            <div className="lib-grid">
              {items.map((project) => <ProjectCard key={project.projectId} project={project} />)}
            </div>
            {error && <p className="sc-inline-error" role="alert">{error.message}</p>}
            {hasMore && (
              <button type="button" className="btn btn-secondary sc-load-more" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
