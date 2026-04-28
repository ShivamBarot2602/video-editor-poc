import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import UploadZone from '../components/UploadZone'

export default function UploadPage() {
  const navigate = useNavigate()

  const handleUpload = (id, meta) => {
    toast.success(`Uploaded: ${meta.name}`)
    navigate(`/editor/${id}`)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32, gap: 24 }}>
      <UploadZone onUpload={handleUpload} />
    </div>
  )
}
