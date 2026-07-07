import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, LayoutGrid, Sparkles, Scissors } from 'lucide-react'
import toast from 'react-hot-toast'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import VideoPlayer from '../components/VideoPlayer'
import TranscriptionPanel from '../components/TranscriptionPanel'
import TimerToast from '../components/TimerToast'
import StyleEditor from '../components/StyleEditor'
import { DEFAULT_STYLE, EXPORT_FORMATS, migrateStyleFonts } from '../config/subtitleStyle'
import { getVideoOrNull } from '../api/videos'
import { getTranscriptionOrNull, patchTranscription, transcribe, burn, subtitleDownloadUrl, downloadAss } from '../api/transcription'
import { readJsonLines } from '../api/stream'

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
  const [isLoadingTranscription, setIsLoadingTranscription] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState(
    searchParams.get('provider') || 'assemblyai'
  )
  const [availableProviders, setAvailableProviders] = useState([])
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [styleLoaded, setStyleLoaded] = useState(false)
  const [burnState, setBurnState] = useState({ status: 'idle', progress: 0, burnedUrl: null })
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [speakerAliases, setSpeakerAliases] = useState({})

  const videoRef = useRef(null)

  // Loads video metadata only — a single GET /api/videos/:id, not the whole
  // list. Transcription fetching is owned entirely by the effect below (keyed
  // off availableProviders + selectedProvider) so it only ever fires once per
  // actual provider/video change, never duplicated here too.
  useEffect(() => {
    if (!videoId) { navigate('/'); return }

    let cancelled = false
    setStyleLoaded(false) // block the save effect until this videoId's saved style has been read
    const load = async () => {
      setLoading(true)
      try {
        const video = await getVideoOrNull(videoId)
        if (cancelled) return
        if (!video) { toast.error('Video not found'); navigate('/'); return }

        setVideoMeta({ name: video.filename, size: video.size })
        setAvailableProviders(video.providers)
        setBurnState({ status: 'idle', progress: 0, burnedUrl: video.hasBurned ? `/api/video/${videoId}/burned` : null })

        const saved = localStorage.getItem(`style_${videoId}`)
        if (saved) { try { setStyle(migrateStyleFonts(JSON.parse(saved))) } catch (_) {} }
      } catch (err) {
        if (!cancelled) toast.error('Failed to load video')
      } finally {
        if (!cancelled) { setLoading(false); setStyleLoaded(true) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [videoId, navigate])

  // Gated on styleLoaded so this can't fire with the DEFAULT_STYLE initial
  // state and clobber a real saved style before the load effect above has
  // had a chance to read it (race: save-on-mount vs. async load-on-mount).
  useEffect(() => {
    if (videoId && styleLoaded) localStorage.setItem(`style_${videoId}`, JSON.stringify(style))
  }, [style, videoId, styleLoaded])

  // Single owner of transcription fetching: runs on mount (once availableProviders
  // loads), on provider switch, and on videoId change.
  useEffect(() => {
    if (!videoId || availableProviders.length === 0) return
    if (!availableProviders.includes(selectedProvider)) {
      setTranscription(null)
      setIsLoadingTranscription(false)
      return
    }

    // Clear stale transcription from prior provider + show loader while the
    // stored file is fetched (typically pulled from S3, non-trivial latency).
    let cancelled = false
    setTranscription(null)
    setIsLoadingTranscription(true)
    getTranscriptionOrNull(videoId, selectedProvider)
      .then(data => { if (!cancelled && data) setTranscription(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoadingTranscription(false) })
    return () => { cancelled = true }
  }, [videoId, selectedProvider, availableProviders])

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
      const updated = await patchTranscription(videoId, selectedProvider, { speaker_aliases: aliases || {} }, 'Failed to save speaker names')
      // Keep local transcription in sync so refresh/download reflect server state.
      setTranscription(updated)
    } catch (err) {
      toast.error(err.message)
    }
  }, [videoId, selectedProvider])

  const handleSegmentEdit = useCallback(async (segIdx, newText) => {
    if (!videoId || !selectedProvider) return
    try {
      setTranscription(await patchTranscription(videoId, selectedProvider, { segment_edits: { [segIdx]: newText } }, 'Failed to save edit'))
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
    const toastId = toast.loading(<TimerToast label="Transcribing…" />)
    try {
      const res = await transcribe(videoId, { provider: selectedProvider })
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

  // JSON is built client-side (enriched with speaker_display); SRT downloads the
  // server-rendered file (kept in sync with edits). ASS also renders server-side
  // but uses the current editor style, so it goes over POST with a style body.
  const handleExport = useCallback(async (formatId) => {
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

    if (formatId === 'ass') {
      try {
        const res = await downloadAss(videoId, selectedProvider, style)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `HTTP ${res.status}`)
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `transcription_${selectedProvider}.ass`; a.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        toast.error(`ASS export failed: ${err.message}`)
      }
      return
    }

    const a = document.createElement('a')
    a.href = subtitleDownloadUrl(videoId, selectedProvider, formatId)
    a.download = `transcription_${selectedProvider}.${formatId}`
    a.click()
  }, [transcription, videoId, selectedProvider, speakerAliases, style])

  const handleBurn = useCallback(async () => {
    if (!videoId || !transcription) return
    setBurnState({ status: 'burning', phase: 'preparing', progress: 0, burnedUrl: null })
    const toastId = toast.loading(<TimerToast label="Burning subtitles…" />)

    // Derive bold flag from fontWeight for ASS compat
    const burnStyle = { ...style, bold: style.fontWeight >= 600 }

    try {
      const res = await burn(videoId, { style: burnStyle, provider: selectedProvider })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Burn failed') }

      await readJsonLines(res, (event) => {
        if (event.type === 'phase') setBurnState(s => ({ ...s, phase: event.phase, progress: 0 }))
        else if (event.type === 'progress') setBurnState(s => ({ ...s, progress: event.percent }))
        else if (event.type === 'done') {
          setBurnState({ status: 'done', progress: 100, burnedUrl: event.burnedUrl })
          toast.success('Subtitles burned!', { id: toastId })
        } else if (event.type === 'error') throw new Error(event.message)
      })
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
                  onStyleChange={setStyle}
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
                  isLoadingTranscription={isLoadingTranscription}
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
