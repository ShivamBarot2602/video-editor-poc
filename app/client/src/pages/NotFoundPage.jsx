// 404 — any route that doesn't match. Rendered inside the shell, so the rail
// stays available as a way out.
import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="lib">
      <div className="lib-empty nf">
        <Compass size={26} />
        <strong>This page doesn't exist</strong>
        <span>The link may be old, or the page has moved. Your videos are all in the Library.</span>
        <Link to="/" className="btn btn-primary">Go to Library</Link>
      </div>
    </div>
  )
}
