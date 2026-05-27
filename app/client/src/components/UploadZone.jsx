import { useState, useRef, useCallback } from 'react'
import { Upload } from 'lucide-react'
import toast from 'react-hot-toast'

const MAX_SIZE_MB = 500
const ACCEPT = 'video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,audio/mpeg,audio/wav,audio/mp4'

export default function UploadZone({ onUpload, compact }) {
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
            reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed'))
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
    <div style={{ width: '100%', maxWidth: compact ? '100%' : 320 }}>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 10,
          padding: compact ? '22px 16px' : '40px 32px',
          textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer',
          background: dragging ? 'var(--accent-dim)' : 'var(--surface-2)',
          transition: 'all 200ms ease',
        }}
      >
        {uploading ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontWeight: 500, marginBottom: 10, fontSize: compact ? 12 : 13 }}>
              Uploading… {progress}%
            </p>
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', maxWidth: 180, margin: '0 auto' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 200ms' }} />
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: compact ? 8 : 10, color: '#555', display: 'flex', justifyContent: 'center' }}>
              <Upload size={compact ? 24 : 32} strokeWidth={1.5} />
            </div>
            <p style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: compact ? 13 : 15, marginBottom: 4 }}>
              {compact ? 'Drop video here' : 'Drop your video here'}
            </p>
            <p style={{ color: 'var(--text-faint)', fontSize: 11, marginBottom: compact ? 12 : 20 }}>
              or click to browse
            </p>
            {!compact && (
              <p style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                MP4, MOV, MKV, WebM · up to {MAX_SIZE_MB} MB
              </p>
            )}
            {compact && (
              <p style={{ color: 'var(--text-faint)', fontSize: 10, marginBottom: 10 }}>
                MP4 · MOV · MKV · WebM
              </p>
            )}
            <button
              className="btn btn-primary"
              style={{ marginTop: compact ? 0 : 20, fontSize: compact ? 11 : 12, padding: compact ? '5px 20px' : '6px 24px' }}
              onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
            >
              Browse Files
            </button>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={e => upload(e.target.files[0])}
      />
    </div>
  )
}
