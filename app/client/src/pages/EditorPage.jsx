import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, LayoutGrid, Sparkles, Scissors } from 'lucide-react'
import toast from 'react-hot-toast'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import VideoPlayer from '../components/VideoPlayer'
import TranscriptionPanel from '../components/TranscriptionPanel'
import StyleEditor from '../components/StyleEditor'
import { DEFAULT_STYLE, EXPORT_FORMATS } from '../config/subtitleStyle'

// DEFAULT_STYLE + EXPORT_FORMATS now live in config/subtitleStyle.js; they are
// re-exported here for backward compatibility.
export { DEFAULT_STYLE, EXPORT_FORMATS }

export default function EditorPage() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const { defaultLayout: editorDefaultLayout, onLayoutChanged: onEditorLayoutChanged } = useDefaultLayout({
    id: 'sp-video-editor:editor-layout:v1',
    storage: localStorage,
  })

  const { defaultLayout: editorMainDefaultLayout, onLayoutChanged: onEditorMainLayoutChanged } = useDefaultLayout({
    id: 'sp-video-editor:editor-main-vertical-layout:v1',
    storage: localStorage,
  })

  const [videoMeta, setVideoMeta] = useState(null)
  const [transcription, setTranscription] = useState(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState(
    searchParams.get('provider') || 'assemblyai'
  )
  const [availableProviders, setAvailableProviders] = useState([])
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [burnState, setBurnState] = useState({ status: 'idle', progress: 0, burnedUrl: null })
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [speakerAliases, setSpeakerAliases] = useState({})

  const videoRef = useRef(null)

  useEffect(() => {
    if (!videoId) { navigate('/'); return }

    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/videos')
        const videos = await res.json()
        const video = videos.find(v => v.id === videoId)
        if (!video) { toast.error('Video not found'); navigate('/'); return }

        setVideoMeta({ name: video.filename, size: video.size })
        setAvailableProviders(video.providers)
        setBurnState({ status: 'idle', progress: 0, burnedUrl: video.hasBurned ? `/api/video/${videoId}/burned` : null })

        const saved = localStorage.getItem(`style_${videoId}`)
        if (saved) { try { setStyle(JSON.parse(saved)) } catch (_) {} }

        const provider = searchParams.get('provider') || selectedProvider
        if (video.providers.includes(provider)) {
          try {
            const tr = await fetch(`/api/transcription/${videoId}/${provider}`)
            if (tr.ok) setTranscription(await tr.json())
          } catch (_) {}
        }
      } catch (err) {
        toast.error('Failed to load video')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (videoId) localStorage.setItem(`style_${videoId}`, JSON.stringify(style))
  }, [style, videoId])

  useEffect(() => {
    if (!videoId || availableProviders.length === 0) return
    if (!availableProviders.includes(selectedProvider)) { setTranscription(null); return }
    fetch(`/api/transcription/${videoId}/${selectedProvider}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTranscription(data) })
      .catch(() => {})
  }, [selectedProvider, videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize speaker aliases from the loaded transcription JSON (server persisted)
  useEffect(() => {
    const aliases = transcription?.metadata?.speaker_aliases
    if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) {
      setSpeakerAliases({})
      return
    }
    setSpeakerAliases(aliases)
  }, [transcription])

  // Ensure alias map contains any speakers present in the current transcription
  useEffect(() => {
    const speakers = transcription?.metadata?.speakers
      || [...new Set((transcription?.segments || []).map(s => s.speaker).filter(Boolean))]
    if (!speakers || speakers.length === 0) return
    setSpeakerAliases(prev => {
      const next = { ...(prev || {}) }
      let changed = false
      for (const sp of speakers) {
        if (next[sp] == null) { next[sp] = ''; changed = true }
      }
      return changed ? next : prev
    })
  }, [transcription])

  const persistSpeakerAliases = useCallback(async (aliases) => {
    if (!videoId || !selectedProvider) return
    try {
      const res = await fetch(`/api/transcription/${videoId}/${selectedProvider}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker_aliases: aliases || {} }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save speaker names')
      }
      const updated = await res.json()
      // Keep local transcription in sync so refresh/download reflect server state.
      setTranscription(updated)
    } catch (err) {
      toast.error(err.message)
    }
  }, [videoId, selectedProvider])

  const handleSegmentEdit = useCallback(async (segIdx, newText) => {
    if (!videoId || !selectedProvider) return
    try {
      const res = await fetch(`/api/transcription/${videoId}/${selectedProvider}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment_edits: { [segIdx]: newText } }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save edit')
      }
      setTranscription(await res.json())
    } catch (err) {
      toast.error(err.message)
    }
  }, [videoId, selectedProvider])

  const handleSpeakerAliasesChange = useCallback((updater) => {
    setSpeakerAliases(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      // Fire-and-forget persistence to server
      persistSpeakerAliases(next)
      return next
    })
  }, [persistSpeakerAliases])

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

  // JSON is built client-side (enriched with speaker_display); subtitle formats
  // (srt, future vtt/ass) download the server-rendered file, which the server
  // keeps in sync with edits.
  const handleExport = useCallback((formatId) => {
    if (!transcription || !videoId || !selectedProvider) return

    if (formatId === 'json') {
      const payload = {
        ...transcription,
        metadata: {
          ...(transcription.metadata || {}),
          speaker_aliases: speakerAliases || {},
        },
        segments: (transcription.segments || []).map(seg => ({
          ...seg,
          speaker_display: (speakerAliases?.[seg.speaker] || '').trim() || seg.speaker,
        })),
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `transcription_${selectedProvider}.json`; a.click()
      URL.revokeObjectURL(url)
      return
    }

    const a = document.createElement('a')
    a.href = `/api/transcription/${videoId}/${selectedProvider}/${formatId}`
    a.download = `transcription_${selectedProvider}.${formatId}`
    a.click()
  }, [transcription, videoId, selectedProvider, speakerAliases])

  const handleBurn = useCallback(async () => {
    if (!videoId || !transcription) return
    setBurnState({ status: 'burning', progress: 0, burnedUrl: null })
    const toastId = toast.loading('Burning subtitles…')

    // Derive bold flag from fontWeight for ASS compat
    const burnStyle = { ...style, bold: style.fontWeight >= 600 }

    try {
      const res = await fetch(`/api/burn/${videoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: burnStyle, provider: selectedProvider }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Burn failed') }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const event = JSON.parse(line.slice(5).trim())
          if (event.type === 'progress') setBurnState(s => ({ ...s, progress: event.percent }))
          else if (event.type === 'done') {
            setBurnState({ status: 'done', progress: 100, burnedUrl: event.burnedUrl })
            toast.success('Subtitles burned!', { id: toastId })
          } else if (event.type === 'error') throw new Error(event.message)
        }
      }
    } catch (err) {
      setBurnState(s => ({ ...s, status: 'idle' }))
      toast.error(err.message, { id: toastId })
    }
  }, [videoId, transcription, style, selectedProvider])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading video…</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Editor topbar */}
      <div className="topbar" style={{ gap: 10 }}>
        <button
          className="topbar-tab"
          onClick={() => navigate('/')}
          style={{ fontSize: 12, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <ArrowLeft size={13} /> Back
        </button>
        <span className="topbar-logo">SP Video Editor</span>
        {videoMeta && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {videoMeta.name}
          </span>
        )}
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate(`/thumbnails/${videoId}`)}
          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          title="Generate thumbnail candidates"
        >
          <Sparkles size={11} /> Thumbnails
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate(`/clips/${videoId}${selectedProvider ? `?transcriptProvider=${selectedProvider}` : ''}`)}
          style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          title="Suggest short clips"
        >
          <Scissors size={11} /> Clips
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate(`/playground?video=${videoId}`)}
          style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <LayoutGrid size={11} /> Playground
        </button>
      </div>

      {/* Editor body — resizable panels */}
      <Group
        orientation="horizontal"
        defaultLayout={editorDefaultLayout}
        onLayoutChanged={onEditorLayoutChanged}
        style={{ flex: 1, overflow: 'hidden', borderRadius: 'var(--radius)', margin: '0 8px 8px' }}
      >

        {/* Left: video + transcription (vertically resizable) */}
        <Panel id="main" defaultSize="83%" minSize="50%" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: 16, flex: 1, minHeight: 0 }}>
            <Group
              orientation="vertical"
              defaultLayout={editorMainDefaultLayout}
              onLayoutChanged={onEditorMainLayoutChanged}
              style={{ height: '100%', overflow: 'hidden' }}
            >
              <Panel id="video" defaultSize="68%" minSize="25%" style={{ overflow: 'hidden', minHeight: 0 }}>
                <VideoPlayer
                  videoId={videoId}
                  transcription={transcription}
                  style={style}
                  videoRef={videoRef}
                  onTimeChange={setCurrentTime}
                  fillHeight
                />
              </Panel>

              <Separator className="panel-resize-handle vertical" />

              <Panel id="transcription" defaultSize="32%" minSize="20%" style={{ overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <TranscriptionPanel
                  transcription={transcription}
                  isTranscribing={isTranscribing}
                  selectedProvider={selectedProvider}
                  onProviderChange={setSelectedProvider}
                  onTranscribe={handleTranscribe}
                  exportFormats={EXPORT_FORMATS}
                  onExport={handleExport}
                  availableProviders={availableProviders}
                  currentTime={currentTime}
                  speakerAliases={speakerAliases}
                  onSpeakerAliasesChange={handleSpeakerAliasesChange}
                  onSegmentEdit={handleSegmentEdit}
                  listMaxHeight={null}
                />
              </Panel>
            </Group>
          </div>
        </Panel>

        {/* Drag handle */}
        <Separator className="panel-resize-handle" />

        {/* Right: tabbed sidebar */}
        <Panel id="sidebar" defaultSize="17%" minSize="14%" maxSize="50%"
          style={{ background: 'var(--surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <StyleEditor
            style={style}
            onChange={setStyle}
            onReset={() => setStyle(DEFAULT_STYLE)}
            canBurn={Boolean(transcription)}
            burnState={burnState}
            onBurn={handleBurn}
          />
        </Panel>

      </Group>
    </div>
  )
}
