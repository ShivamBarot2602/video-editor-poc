import { useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'

const MAX_SIZE_MB = 500
const ACCEPT = 'video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,audio/mpeg,audio/wav,audio/mp4'

export default function UploadZone({ onUpload }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef(null)

  const upload = useCallback(async (file) => {
    if (!file) return

    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > MAX_SIZE_MB) {
      toast.error(`File too large (${sizeMB.toFixed(0)} MB). Limit is ${MAX_SIZE_MB} MB.`)
      return
    }

    const formData = new FormData()
    formData.append('video', file)

    setUploading(true)
    setProgress(0)

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/upload')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText)
            onUpload(data.videoId, { name: file.name, size: file.size })
            resolve()
          } else {
            const err = JSON.parse(xhr.responseText)
            reject(new Error(err.error || 'Upload failed'))
          }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(formData)
      })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }, [onUpload])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }, [upload])

  return (
    <div style={{ width: '100%', maxWidth: 520 }}>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-2)'}`,
          borderRadius: 12,
          padding: '56px 32px',
          textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer',
          background: dragging ? 'var(--accent-dim)' : 'var(--surface)',
          transition: 'all 200ms ease',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>🎬</div>

        {uploading ? (
          <>
            <p style={{ color: 'var(--text)', fontWeight: 500, marginBottom: 12 }}>
              Uploading… {progress}%
            </p>
            <div className="progress-bar" style={{ maxWidth: 240, margin: '0 auto' }}>
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
              Drop your video here
            </p>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
              or click to browse
            </p>
            <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              MP4, MOV, MKV, WebM, AVI · up to {MAX_SIZE_MB} MB
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => upload(e.target.files[0])}
      />
    </div>
  )
}
