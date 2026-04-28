import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UploadZone from '../components/UploadZone'
import RecentVideos from '../components/RecentVideos'

export default function LandingPage() {
  const [landingTab, setLandingTab] = useState('upload')
  const navigate = useNavigate()

  const handleUpload = (id, meta) => {
    // Navigate to the editor with the video ID
    navigate(`/editor/${id}`)
  }

  const handleLoadRecent = (video) => {
    // Navigate to the editor with the video ID
    navigate(`/editor/${video.id}`)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32, gap: 24 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {[['upload', 'Upload New'], ['recent', 'Recent Sessions']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setLandingTab(id)}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 500,
              border: 'none', cursor: 'pointer', transition: 'all 150ms',
              background: landingTab === id ? 'var(--accent)' : 'var(--surface)',
              color:      landingTab === id ? '#fff' : 'var(--text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {landingTab === 'upload'
        ? <UploadZone onUpload={handleUpload} />
        : <RecentVideos onSelect={handleLoadRecent} />
      }
    </div>
  )
}
