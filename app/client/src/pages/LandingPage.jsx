import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import UploadZone from '../components/UploadZone'
import RecentVideos from '../components/RecentVideos'

export default function LandingPage() {
  const navigate = useNavigate()

  const handleUpload = (id, meta) => {
    toast.success(`Uploaded: ${meta.name}`)
    navigate(`/editor/${id}`)
  }

  const handleSelect = (video) => {
    navigate(`/editor/${video.id}`)
  }

  const handleOpenPlayground = (video) => {
    navigate(`/playground?video=${video.id}`)
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%', borderRadius: 'var(--radius)', margin: '0 8px 8px' }}>

      {/* Left: upload zone (42%) */}
      <div style={{
        width: '42%',
        flexShrink: 0,
        borderRight: '1px solid var(--border-sub)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 32,
        background: 'var(--bg)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 6, letterSpacing: '-0.01em' }}>
            Upload a Video
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Transcribe &amp; add styled subtitles
          </div>
        </div>
        <UploadZone onUpload={handleUpload} />
        <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.7 }}>
          You'll land in the editor to transcribe<br />&amp; style subtitles.
        </p>
      </div>

      {/* Right: recent sessions */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--surface-dark)',
      }}>
        {/* Panel header */}
        <div className="panel-header" style={{ padding: '10px 20px', justifyContent: 'space-between' }}>
          <span className="panel-header-title">Recent Sessions</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          <RecentVideos onSelect={handleSelect} onPlayground={handleOpenPlayground} />
        </div>
      </div>
    </div>
  )
}
