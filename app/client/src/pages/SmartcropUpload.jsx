import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import UploadZone from '../components/UploadZone'
import AspectPicker from '../smartcrop/components/AspectPicker.jsx'
import LayoutPicker from '../smartcrop/components/LayoutPicker.jsx'
import UploadProgress from '../smartcrop/components/UploadProgress.jsx'
import { useUpload } from '../smartcrop/hooks/useUpload.js'
import { FALLBACK_LAYOUT, isLayoutSupported } from '../smartcrop/core/editList.js'
import { ACCEPT } from '../smartcrop/core/upload.js'
import '../smartcrop/smartcrop.css'

// Upload screen, /smartcrop (spec 05 §2–3): pick the starting aspect + layout,
// drop a file, watch it upload, then land on /smartcrop/:projectId.
export default function SmartcropUpload() {
  const navigate = useNavigate()
  const upload = useUpload()
  const [aspect, setAspect] = useState('9:16')
  const [layout, setLayout] = useState('fill')
  const [fileName, setFileName] = useState('')

  const busy = upload.phase !== 'idle'

  // Same rule as the editor: a layout the new aspect lacks falls back to fill.
  function changeAspect(next) {
    setAspect(next)
    if (!isLayoutSupported(next, layout)) setLayout(FALLBACK_LAYOUT)
  }

  async function handleFile(file) {
    setFileName(file.name)
    const project = await upload.start(file, { aspect, layout })
    if (project) navigate(`/smartcrop/${project.projectId}`)
  }

  return (
    <div className="sc-root">
      <header className="sc-topbar">
        <Link to="/" className="sc-icon-btn" aria-label="Back to home">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="sc-topbar-title">SmartCrop</h1>
        <div className="sc-topbar-actions">
          <Link to="/smartcrop/projects" className="sc-ghost-btn">Projects</Link>
        </div>
      </header>

      <div className="sc-upload">
        <div className="sc-upload-heading">
          <h2>Reframe a video for every format</h2>
          <p>We find the speakers and keep them in frame. You can change these later in the editor.</p>
        </div>

        <div className="sc-upload-options">
          <AspectPicker value={aspect} onChange={changeAspect} disabled={busy} />
          <LayoutPicker aspect={aspect} value={layout} onChange={setLayout} disabled={busy} />
        </div>

        <div className="sc-upload-slot">
          {busy ? (
            <UploadProgress
              fileName={fileName}
              phase={upload.phase}
              sentBytes={upload.sentBytes}
              totalBytes={upload.totalBytes}
              onCancel={upload.cancel}
            />
          ) : (
            <UploadZone onFile={handleFile} accept={ACCEPT} hint="MP4, M4V, MOV or WebM" maxWidth="100%" />
          )}
          {upload.error && <p className="sc-upload-error" role="alert">{upload.error}</p>}
        </div>
      </div>
    </div>
  )
}
