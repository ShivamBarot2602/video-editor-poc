import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { useAuth } from './auth/AuthContext'
import Rail from './shell/Rail'
import { JobsProvider } from './shell/jobs'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import LibraryPage from './pages/LibraryPage'
import EditorPage from './pages/EditorPage'
import PlaygroundPage from './pages/PlaygroundPage'
import ThumbnailsPage from './pages/ThumbnailsPage'
import ClipsPage from './pages/ClipsPage'
import SmartcropUpload from './pages/SmartcropUpload'
import SmartcropEditor from './pages/SmartcropEditor'
import SmartcropProjects from './pages/SmartcropProjects'
import DocsHubPage from './pages/docs/DocsHubPage'
import SubtitlesDocPage from './pages/docs/SubtitlesDocPage'
import ThumbnailsDocPage from './pages/docs/ThumbnailsDocPage'
import ClipsDocPage from './pages/docs/ClipsDocPage'

const screenStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  height: '100vh', gap: 14, backgroundColor: 'var(--bg)', color: 'var(--text-bright)',
  textAlign: 'center', padding: 20,
}

export default function App() {
  const { user, loading, error, retry } = useAuth()

  // Initial session check in flight.
  if (loading) {
    return <div style={{ ...screenStyle, color: 'var(--text-muted)' }}>Loading…</div>
  }

  // Session check failed to reach the server (distinct from "logged out").
  if (error) {
    return (
      <div style={screenStyle}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Connection problem</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, maxWidth: 420 }}>{error}</p>
        <button onClick={retry} className="btn btn-primary">Retry</button>
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />} showDialog>
      <JobsProvider>
        <Router>
          <div className="shell">
            <Rail />
            <main className="shell-main">
              <Routes>
                <Route path="/" element={<LibraryPage />} />
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
                <Route path="/smartcrop" element={<SmartcropUpload />} />
                <Route path="/smartcrop/projects" element={<SmartcropProjects />} />
                <Route path="/smartcrop/:projectId" element={<SmartcropEditor />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </main>
          </div>
        </Router>
      </JobsProvider>
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
      backgroundColor: 'var(--bg)',
      color: 'var(--text-bright)',
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>Something went wrong</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '20px', textAlign: 'center', maxWidth: '500px' }}>
        We've been notified about this error. Please try refreshing the page.
      </p>
      {error && (
        <pre style={{
          backgroundColor: 'var(--surface-2)',
          color: 'var(--text)',
          padding: '12px',
          borderRadius: '4px',
          overflow: 'auto',
          maxHeight: '200px',
          maxWidth: '600px',
          fontSize: '12px',
          border: '1px solid var(--border)',
        }}>
          {error.toString()}
        </pre>
      )}
      <button onClick={resetError} className="btn btn-primary" style={{ marginTop: '10px' }}>
        Try Again
      </button>
    </div>
  )
}
