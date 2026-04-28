import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import RecentSessionsPage from './pages/RecentSessionsPage'
import EditorPage from './pages/EditorPage'

function Header() {
  const location = useLocation()
  const isEditor = location.pathname.startsWith('/editor/')

  if (isEditor) {
    return null
  }

  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 24,
      padding: '12px 24px', borderBottom: '1px solid var(--border)',
      background: 'var(--surface)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>SP Video Editor</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>POC</span>
      </div>

      {/* Navigation */}
      <nav style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {[
          { path: '/upload', label: 'Upload New' },
          { path: '/recent', label: 'Recent Sessions' },
        ].map(({ path, label }) => (
          <Link
            key={path}
            to={path}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 500,
              border: 'none', cursor: 'pointer', transition: 'all 150ms',
              background: location.pathname === path ? 'var(--accent)' : 'var(--surface)',
              color: location.pathname === path ? '#fff' : 'var(--text-muted)',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  )
}

export default function App() {
  return (
    <Router>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header />

        {/* Routes */}
        <Routes>
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/recent" element={<RecentSessionsPage />} />
          <Route path="/editor/:videoId" element={<EditorPage />} />
          <Route path="/" element={<UploadPage />} />
        </Routes>

        <style>{`
          @media (max-width: 768px) {
            .mobile-reupload { display: block !important; }
            .workspace-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </Router>
  )
}
