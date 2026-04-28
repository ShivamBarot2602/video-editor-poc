import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import VideoPlayer from '../components/VideoPlayer'
import TranscriptionPanel from '../components/TranscriptionPanel'
import StyleEditor from '../components/StyleEditor'
import BurnPanel from '../components/BurnPanel'

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

export default function EditorPage() {
  const { videoId } = useParams()
  const navigate = useNavigate()

  const [videoMeta, setVideoMeta] = useState(null)
  const [transcription, setTranscription] = useState(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('assemblyai')
  const [availableProviders, setAvailableProviders] = useState([])
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [burnState, setBurnState] = useState({ status: 'idle', progress: 0, burnedUrl: null })
  const [loading, setLoading] = useState(true)

  const videoRef = useRef(null)

  // Load video data and state on mount or when videoId changes
  useEffect(() => {
    if (!videoId) {
      navigate('/')
      return
    }

    const loadVideoState = async () => {
      setLoading(true)
      try {
        // Fetch video list to get metadata for this specific video
        const videosRes = await fetch('/api/videos')
        const videos = await videosRes.json()
        const video = videos.find(v => v.id === videoId)

        if (!video) {
          toast.error('Video not found')
          navigate('/')
          return
        }

        setVideoMeta({ name: video.filename, size: video.size })
        setAvailableProviders(video.providers)
        setBurnState({ status: 'idle', progress: 0, burnedUrl: video.hasBurned ? `/api/video/${videoId}/burned` : null })

        // Load style from localStorage if available
        const savedStyle = localStorage.getItem(`style_${videoId}`)
        if (savedStyle) {
          try {
            setStyle(JSON.parse(savedStyle))
          } catch (_) {}
        }

        // Auto-load transcription for the currently selected provider if it exists
        if (video.providers.includes(selectedProvider)) {
          try {
            const res = await fetch(`/api/transcription/${videoId}/${selectedProvider}`)
            if (res.ok) {
              const data = await res.json()
              setTranscription(data)
            }
          } catch (_) {}
        }
      } catch (err) {
        console.error('Failed to load video state:', err)
        toast.error('Failed to load video')
      } finally {
        setLoading(false)
      }
    }

    loadVideoState()
  }, [videoId, navigate, selectedProvider])

  // Save style to localStorage whenever it changes
  useEffect(() => {
    if (videoId) {
      localStorage.setItem(`style_${videoId}`, JSON.stringify(style))
    }
  }, [style, videoId])

  // When provider changes, auto-load if a transcription exists
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
  }, [selectedProvider, videoId])

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

        const lines = buffer.split('\n')
        buffer = lines.pop()
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

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Loading video…</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Header with back button and video title */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/upload')}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 500,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--surface-2)',
            color: 'var(--text)',
            cursor: 'pointer',
            transition: 'all 150ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--accent)'
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--surface-2)'
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text)'
          }}
        >
          ← Back
        </button>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>SP Video Editor</span>
        {videoMeta && (
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>
            {videoMeta.name}
          </span>
        )}
      </header>

      {/* Editor layout */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '1fr 340px',
        gridTemplateRows: '1fr',
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

        {/* Mobile: back button */}
        <div style={{
          display: 'none',
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
        }} className="mobile-reupload">
          <button className="btn btn-ghost btn-full" onClick={() => navigate('/upload')}>
            Back to Upload
          </button>
        </div>
      </div>
    </>
  )
}
