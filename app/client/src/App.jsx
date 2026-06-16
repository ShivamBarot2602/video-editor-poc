import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import LandingPage from './pages/LandingPage'
import EditorPage from './pages/EditorPage'
import PlaygroundPage from './pages/PlaygroundPage'
import ThumbnailsPage from './pages/ThumbnailsPage'
import ClipsPage from './pages/ClipsPage'
import DocsHubPage from './pages/docs/DocsHubPage'
import SubtitlesDocPage from './pages/docs/SubtitlesDocPage'
import ThumbnailsDocPage from './pages/docs/ThumbnailsDocPage'
import ClipsDocPage from './pages/docs/ClipsDocPage'

function Header() {
  const location = useLocation()
  const isEditor = location.pathname.startsWith('/editor/')
  if (isEditor) return null

  const isPlayground = location.pathname === '/playground'
  const isDocs = location.pathname.startsWith('/docs') || location.pathname === '/report'
  const isThumbnails = location.pathname.startsWith('/thumbnails')
  const isClips = location.pathname.startsWith('/clips')
  const isHome = !isPlayground && !isDocs && !isThumbnails && !isClips

  return (
    <header className="topbar">
      <Link to="/" className="topbar-logo" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>SP Video Editor</Link>
      <span className="topbar-poc">POC</span>
      <nav style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
        <Link to="/" className={`topbar-tab ${isHome ? 'active' : ''}`}>Upload New</Link>
        <Link to="/playground" className={`topbar-tab ${isPlayground ? 'active' : ''}`}>Playground</Link>
        <Link to="/thumbnails" className={`topbar-tab ${isThumbnails ? 'active' : ''}`}>Thumbnails</Link>
        <Link to="/clips" className={`topbar-tab ${isClips ? 'active' : ''}`}>Clips</Link>
        <Link to="/docs" className={`topbar-tab ${isDocs ? 'active' : ''}`}>Docs</Link>
      </nav>
    </header>
  )
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />} showDialog>
      <Router>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
          <Header />
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/playground" element={<PlaygroundPage />} />
              <Route path="/docs" element={<DocsHubPage />} />
              <Route path="/docs/subtitles" element={<SubtitlesDocPage />} />
              <Route path="/docs/thumbnails" element={<ThumbnailsDocPage />} />
              <Route path="/docs/clips" element={<ClipsDocPage />} />
              <Route path="/report" element={<Navigate to="/docs/subtitles" replace />} />
              <Route path="/editor/:videoId" element={<EditorPage />} />
              <Route path="/thumbnails" element={<ThumbnailsPage />} />
              <Route path="/thumbnails/:videoId" element={<ThumbnailsPage />} />
              <Route path="/clips" element={<ClipsPage />} />
              <Route path="/clips/:videoId" element={<ClipsPage />} />
            </Routes>
          </div>
        </div>
      </Router>
    </Sentry.ErrorBoundary>
  )
}

function ErrorFallback({ error, resetError }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '20px',
      padding: '20px',
      backgroundColor: '#1a1a1a',
      color: '#e4e4e7',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>Something went wrong</h1>
      <p style={{ color: '#a1a1a1', marginBottom: '20px', textAlign: 'center', maxWidth: '500px' }}>
        We've been notified about this error. Please try refreshing the page.
      </p>
      {error && (
        <pre style={{
          backgroundColor: '#2a2a2a',
          padding: '12px',
          borderRadius: '4px',
          overflow: 'auto',
          maxHeight: '200px',
          maxWidth: '600px',
          fontSize: '12px',
          border: '1px solid #404040',
        }}>
          {error.toString()}
        </pre>
      )}
      <button
        onClick={resetError}
        style={{
          padding: '10px 20px',
          backgroundColor: '#7c3aed',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          marginTop: '10px',
        }}
      >
        Try Again
      </button>
    </div>
  )
}
