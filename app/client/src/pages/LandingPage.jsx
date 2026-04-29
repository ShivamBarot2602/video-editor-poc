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
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>

      {/* Left: upload zone (42%) */}
      <div style={{
        width: '42%',
        flexShrink: 0,
        borderRight: '1px solid var(--border-sub)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 32,
        background: 'var(--bg)',
      }}>
        <UploadZone onUpload={handleUpload} />
        <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.7 }}>
          After upload you'll land in the editor<br />to transcribe &amp; style subtitles.
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
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--border-sub)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Recent Sessions
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          <RecentVideos onSelect={handleSelect} onPlayground={handleOpenPlayground} />
        </div>
      </div>
    </div>
  )
}
