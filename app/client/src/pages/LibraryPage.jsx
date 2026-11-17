import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Upload, Search, Captions, Scissors, Clapperboard, Film, AlertTriangle } from 'lucide-react'
import { listVideos, uploadVideo } from '../api/videos'
import { MAX_SIZE_MB, ACCEPT } from '../components/UploadZone'
import { fmtSize, fmtDate } from '../lib/format'
import Segmented from '../ui/Segmented'

// What has been made from a video so far, shown on its card and used by the filters.
function outputsOf(v) {
  return [
    v.providers?.length > 0 && { id: 'transcript', label: 'Transcript', icon: Captions },
    v.hasBurned && { id: 'burned', label: 'Captioned video', icon: Film },
    v.hasClips && { id: 'clips', label: 'Clips', icon: Scissors },
  ].filter(Boolean)
}

// `/` — every uploaded video, newest first. One upload for the whole app:
// drop a file anywhere on the page or use the button; the video then opens
// in its project (Captions tab).
export default function LibraryPage() {
  const navigate = useNavigate()
  const [videos, setVideos] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [upload, setUpload] = useState(null) // { name, progress }
  const [dragging, setDragging] = useState(false)
  const [thumbErrors, setThumbErrors] = useState({})
  const inputRef = useRef(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    listVideos()
      .then(list => setVideos(list || []))
      .catch(err => { setLoadError(err.message); setVideos([]) })
  }, [])

  async function startUpload(file) {
    if (!file || upload) return
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > MAX_SIZE_MB) {
      toast.error(`${file.name} is ${sizeMB.toFixed(0)} MB. The limit is ${MAX_SIZE_MB} MB.`)
      return
    }
    setUpload({ name: file.name, progress: 0 })
    try {
      const data = await uploadVideo(file, { onProgress: p => setUpload({ name: file.name, progress: p }) })
      toast.success(`Uploaded ${file.name}`)
      navigate(`/v/${data.videoId}/captions`)
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`)
      setUpload(null)
    }
  }

  const counts = { all: 0, started: 0, fresh: 0 }
  for (const v of videos || []) {
    counts.all += 1
    if (outputsOf(v).length) counts.started += 1
    else counts.fresh += 1
  }

  const q = query.trim().toLowerCase()
  const shown = (videos || []).filter(v => {
    if (q && !v.filename.toLowerCase().includes(q)) return false
    const started = outputsOf(v).length > 0
    return filter === 'all' || (filter === 'started' ? started : !started)
  })

  return (
    <div
      className="lib"
      onDragEnter={e => { e.preventDefault(); dragDepth.current += 1; setDragging(true) }}
      onDragOver={e => e.preventDefault()}
      onDragLeave={() => { dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } }}
      onDrop={e => {
        e.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        startUpload(e.dataTransfer.files[0])
      }}
    >
      <div className="lib-inner">
        <header className="lib-head">
          <h1 className="lib-title">Library</h1>
          <label className="lib-search">
            <Search size={15} aria-hidden="true" />
            <input
              id="library-search"
              type="search"
              placeholder="Search videos"
              aria-label="Search videos"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={!!upload}>
            <Upload size={15} /> Upload video
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={e => { startUpload(e.target.files[0]); e.target.value = '' }}
          />
        </header>

        <div className={upload ? 'lib-drop lib-drop-busy' : 'lib-drop'}>
          <span className="lib-drop-icon"><Upload size={18} /></span>
          {upload ? (
            <div className="lib-drop-body">
              <div className="lib-drop-row">
                <strong>{upload.name}</strong>
                <span>{upload.progress < 100 ? `Uploading ${upload.progress}%` : 'Finishing up…'}</span>
              </div>
              <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${upload.progress}%` }} /></div>
            </div>
          ) : (
            <div className="lib-drop-body">
              <strong>Drop a video anywhere on this page</strong>
              <span>MP4, MOV, MKV or WebM, up to {MAX_SIZE_MB} MB. It opens in Captions once uploaded.</span>
            </div>
          )}
        </div>

        {videos && videos.length > 0 && (
          <div className="lib-filters">
            <Segmented
              ariaLabel="Filter videos"
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'all', label: `All ${counts.all}` },
                { id: 'started', label: `With results ${counts.started}` },
                { id: 'fresh', label: `Not started ${counts.fresh}` },
              ]}
            />
            <span className="lib-sort">Newest first</span>
          </div>
        )}

        {videos === null && (
          <div className="lib-grid" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="vcard">
                <div className="vcard-thumb shimmer" />
                <div className="shimmer" style={{ height: 14, width: '70%', borderRadius: 4 }} />
              </div>
            ))}
          </div>
        )}

        {loadError && (
          <div className="lib-empty" role="alert">
            <AlertTriangle size={22} />
            <strong>Couldn't load your videos</strong>
            <span>{loadError}. Check that the server is running, then reload the page.</span>
          </div>
        )}

        {videos && !loadError && videos.length === 0 && (
          <div className="lib-empty">
            <Clapperboard size={24} />
            <strong>No videos yet</strong>
            <span>Upload a video to transcribe it, find clips, make thumbnails and reframe it for social.</span>
            <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
              <Upload size={15} /> Upload video
            </button>
          </div>
        )}

        {videos && videos.length > 0 && shown.length === 0 && (
          <div className="lib-empty">
            <strong>No videos match</strong>
            <span>Try a different search or filter.</span>
          </div>
        )}

        {shown.length > 0 && (
          <div className="lib-grid">
            {shown.map(v => {
              const outputs = outputsOf(v)
              return (
                <Link key={v.id} to={`/v/${v.id}`} className="vcard">
                  <div className="vcard-thumb">
                    {!thumbErrors[v.id] ? (
                      <img
                        src={v.thumbnail}
                        alt=""
                        loading="lazy"
                        onError={() => setThumbErrors(p => ({ ...p, [v.id]: true }))}
                      />
                    ) : (
                      <Film size={22} aria-hidden="true" />
                    )}
                  </div>
                  <div className="vcard-text">
                    <span className="vcard-title" title={v.filename}>{v.filename}</span>
                    <span className="vcard-meta">
                      Uploaded {fmtDate(v.uploadedAt)}{Number.isFinite(v.size) ? ` · ${fmtSize(v.size)}` : ''}
                    </span>
                  </div>
                  <div className="vcard-outs">
                    {outputs.length === 0 ? (
                      <span className="vcard-out vcard-out-none">Nothing made yet</span>
                    ) : outputs.map(({ id, label, icon: Icon }) => (
                      <span key={id} className="vcard-out"><Icon size={12} aria-hidden="true" />{label}</span>
                    ))}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {dragging && (
        <div className="lib-dropzone" aria-hidden="true">
          <Upload size={28} />
          <strong>Drop to upload</strong>
        </div>
      )}
    </div>
  )
}
