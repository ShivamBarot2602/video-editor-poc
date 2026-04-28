import { useNavigate } from 'react-router-dom'
import RecentVideos from '../components/RecentVideos'

export default function RecentSessionsPage() {
  const navigate = useNavigate()

  const handleLoadRecent = (video) => {
    navigate(`/editor/${video.id}`)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32, gap: 24 }}>
      <RecentVideos onSelect={handleLoadRecent} />
    </div>
  )
}
