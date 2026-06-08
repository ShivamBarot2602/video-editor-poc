import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import EditorPage from './pages/EditorPage'
import PlaygroundPage from './pages/PlaygroundPage'
import ProviderReportPage from './pages/ProviderReportPage'
import ThumbnailsPage from './pages/ThumbnailsPage'
import ClipsPage from './pages/ClipsPage'

function Header() {
  const location = useLocation()
  const isEditor = location.pathname.startsWith('/editor/')
  if (isEditor) return null

  const isPlayground = location.pathname === '/playground'
  const isReport = location.pathname === '/report'
  const isThumbnails = location.pathname.startsWith('/thumbnails')
  const isClips = location.pathname.startsWith('/clips')
  const isHome = !isPlayground && !isReport && !isThumbnails && !isClips

  return (
    <header className="topbar">
      <span className="topbar-logo">SP Video Editor</span>
      <span className="topbar-poc">POC</span>
      <nav style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
        <Link to="/" className={`topbar-tab ${isHome ? 'active' : ''}`}>Upload New</Link>
        <Link to="/playground" className={`topbar-tab ${isPlayground ? 'active' : ''}`}>Playground</Link>
        <Link to="/thumbnails" className={`topbar-tab ${isThumbnails ? 'active' : ''}`}>Thumbnails</Link>
        <Link to="/clips" className={`topbar-tab ${isClips ? 'active' : ''}`}>Clips</Link>
        <Link to="/report" className={`topbar-tab ${isReport ? 'active' : ''}`}>Provider Report</Link>
      </nav>
    </header>
  )
}

export default function App() {
  return (
    <Router>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <Header />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
            <Route path="/report" element={<ProviderReportPage />} />
            <Route path="/editor/:videoId" element={<EditorPage />} />
            <Route path="/thumbnails" element={<ThumbnailsPage />} />
            <Route path="/thumbnails/:videoId" element={<ThumbnailsPage />} />
            <Route path="/clips" element={<ClipsPage />} />
            <Route path="/clips/:videoId" element={<ClipsPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  )
}
