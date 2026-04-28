import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import EditorPage from './pages/EditorPage'
import PlaygroundPage from './pages/PlaygroundPage'

function Header() {
  const location = useLocation()
  const isEditor = location.pathname.startsWith('/editor/')
  if (isEditor) return null

  const isPlayground = location.pathname === '/playground'

  return (
    <header className="topbar">
      <span className="topbar-logo">SP Video Editor</span>
      <span className="topbar-poc">POC</span>
      <nav style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
        <Link to="/" className={`topbar-tab ${!isPlayground ? 'active' : ''}`}>Upload New</Link>
        <Link to="/playground" className={`topbar-tab ${isPlayground ? 'active' : ''}`}>Playground</Link>
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
            <Route path="/editor/:videoId" element={<EditorPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  )
}
