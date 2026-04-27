import { useState, useRef, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import UploadZone from './components/UploadZone'
import RecentVideos from './components/RecentVideos'
import VideoPlayer from './components/VideoPlayer'
import TranscriptionPanel from './components/TranscriptionPanel'
import StyleEditor from './components/StyleEditor'
import BurnPanel from './components/BurnPanel'

const DEFAULT_STYLE = {
  fontFamily: 'Arial',
  fontSize: 48,
  primaryColor: '#FFFFFF',
  karaokeColor: '#FFD700',
  outlineColor: '#000000',
  outlineThickness: 2,
  bold: false,
  italic: false,
  position: 'bottom-center',
  verticalMargin: 30,
  backgroundBox: false,
  backgroundOpacity: 70,
  karaokeStyle: 'word-highlight',
  maxLines: 2,
}

export default function App() {
  const [videoId, setVideoId] = useState(null)
  const [videoMeta, setVideoMeta] = useState(null)       // { name, size }
  const [transcription, setTranscription] = useState(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('assemblyai')
  const [availableProviders, setAvailableProviders] = useState([]) // providers with saved transcriptions
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [burnState, setBurnState] = useState({ status: 'idle', progress: 0, burnedUrl: null })
  const [landingTab, setLandingTab] = useState('upload') // 'upload' | 'recent'

  const videoRef = useRef(null)

  const handleUpload = useCallback((id, meta) => {
    setVideoId(id)
    setVideoMeta(meta)
    setTranscription(null)
    setAvailableProviders([])
    setBurnState({ status: 'idle', progress: 0, burnedUrl: null })
    toast.success(`Uploaded: ${meta.name}`)
  }, [])

  // Load a session selected from the Recent Videos tab
  const handleLoadRecent = useCallback(async (video) => {
    setVideoId(video.id)
    setVideoMeta({ name: video.filename, size: video.size })
    setAvailableProviders(video.providers)
    setTranscription(null)
    setBurnState({ status: 'idle', progress: 0, burnedUrl: video.hasBurned ? `/api/video/${video.id}/burned` : null })

    // Auto-load transcription for the currently selected provider if it exists
    if (video.providers.includes(selectedProvider)) {
      try {
        const res = await fetch(`/api/transcription/${video.id}/${selectedProvider}`)
        if (res.ok) setTranscription(await res.json())
      } catch (_) {}
    }
  }, [selectedProvider])

  // When the provider changes on an already-loaded video, auto-load if a
  // transcription exists for that provider, otherwise clear the current one.
  useEffect(() => {
    if (!videoId || availableProviders.length === 0) return
    if (!availableProviders.includes(selectedProvider)) {
      setTranscription(null)
      return
    }
    fetch(`/api/transcription/${videoId}/${selectedProvider}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTranscription(data) })
      .catch(() => {})
  }, [selectedProvider, videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTranscribe = useCallback(async () => {
    if (!videoId) return
    setIsTranscribing(true)
    setTranscription(null)
    const toastId = toast.loading('Transcribing…')

    try {
      const res = await fetch(`/api/transcribe/${videoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Transcription failed')

      setTranscription(data)
      setAvailableProviders(prev => prev.includes(selectedProvider) ? prev : [...prev, selectedProvider])
      toast.success('Transcription complete!', { id: toastId })
    } catch (err) {
      toast.error(err.message, { id: toastId })
    } finally {
      setIsTranscribing(false)
    }
  }, [videoId, selectedProvider])

  const handleDownloadTranscription = useCallback(() => {
    if (!transcription) return
    const blob = new Blob([JSON.stringify(transcription, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcription_${selectedProvider}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [transcription, selectedProvider])

  const handleBurn = useCallback(async () => {
    if (!videoId || !transcription) return
    setBurnState({ status: 'burning', progress: 0, burnedUrl: null })
    const toastId = toast.loading('Burning subtitles…')

    try {
      const res = await fetch(`/api/burn/${videoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style, provider: selectedProvider }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Burn failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete line in buffer
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const event = JSON.parse(line.slice(5).trim())
          if (event.type === 'progress') {
            setBurnState(s => ({ ...s, progress: event.percent }))
          } else if (event.type === 'done') {
            setBurnState({ status: 'done', progress: 100, burnedUrl: event.burnedUrl })
            toast.success('Subtitles burned!', { id: toastId })
          } else if (event.type === 'error') {
            throw new Error(event.message)
          }
        }
      }
    } catch (err) {
      setBurnState(s => ({ ...s, status: 'idle' }))
      toast.error(err.message, { id: toastId })
    }
  }, [videoId, transcription, style])

  const hasVideo = Boolean(videoId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>SP Video Editor</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>POC</span>
        {videoMeta && (
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>
            {videoMeta.name}
          </span>
        )}
      </header>

      {!hasVideo ? (
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
      ) : (
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gridTemplateRows: 'auto 1fr',
          gap: 0, overflow: 'hidden',
        }}>
          {/* Left: video + transcription */}
          <div style={{ overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <VideoPlayer
              videoId={videoId}
              transcription={transcription}
              style={style}
              videoRef={videoRef}
            />
            <TranscriptionPanel
              transcription={transcription}
              isTranscribing={isTranscribing}
              selectedProvider={selectedProvider}
              onProviderChange={setSelectedProvider}
              onTranscribe={handleTranscribe}
              onDownload={handleDownloadTranscription}
              availableProviders={availableProviders}
            />
          </div>

          {/* Right: controls sidebar */}
          <aside style={{
            borderLeft: '1px solid var(--border)',
            background: 'var(--surface)',
            overflow: 'auto',
            display: 'flex', flexDirection: 'column',
          }}>
            <StyleEditor
              style={style}
              onChange={setStyle}
              onReset={() => setStyle(DEFAULT_STYLE)}
            />
            <div style={{ padding: '0 16px 16px' }}>
              <BurnPanel
                canBurn={Boolean(transcription)}
                burnState={burnState}
                onBurn={handleBurn}
              />
            </div>
          </aside>
        </div>
      )}

      {/* Mobile: re-upload button */}
      {hasVideo && (
        <div style={{
          display: 'none', // shown via media query below
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
        }} className="mobile-reupload">
          <button className="btn btn-ghost btn-full" onClick={() => {
            setVideoId(null); setVideoMeta(null); setTranscription(null)
            setAvailableProviders([])
            setBurnState({ status: 'idle', progress: 0, burnedUrl: null })
          }}>
            Upload a different video
          </button>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .mobile-reupload { display: block !important; }
          .workspace-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
