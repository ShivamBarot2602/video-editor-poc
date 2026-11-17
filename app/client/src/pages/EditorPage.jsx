import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { FlaskConical, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import VideoPlayer from '../components/VideoPlayer'
import TranscriptionPanel from '../components/TranscriptionPanel'
import StyleEditor from '../components/StyleEditor'
import { speakerColor } from '../components/SpeakerBadge'
import Timeline from '../ui/Timeline'
import ProjectBar from '../shell/ProjectBar'
import { useJob } from '../shell/jobs'
import { PROVIDERS } from '../config/providers'
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

  // v2: transcript | stage + timeline | style (v1 stacked transcript under the video).
  const { defaultLayout: editorDefaultLayout, onLayoutChanged: onEditorLayoutChanged } = useDefaultLayout({
    id: 'sp-video-editor:editor-layout:v2',
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

        setVideoMeta(video)
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
    try {
      const res = await transcribe(videoId, { provider: selectedProvider })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Transcription failed')
      setTranscription(data)
      setAvailableProviders(prev => prev.includes(selectedProvider) ? prev : [...prev, selectedProvider])
      toast.success('Transcript ready')
    } catch (err) {
      toast.error(err.message)
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
          toast.success('Captioned video ready')
        } else if (event.type === 'error') throw new Error(event.message)
      })
    } catch (err) {
      setBurnState(s => ({ ...s, status: 'idle' }))
      toast.error(err.message)
    }
  }, [videoId, transcription, style, selectedProvider])

  const providerLabel = PROVIDERS.find(p => p.id === selectedProvider)?.label || selectedProvider
  useJob(`transcribe:${videoId}`, isTranscribing ? {
    videoId, tool: 'captions', label: 'Transcribing', detail: `Using ${providerLabel}`,
  } : null)
  useJob(`burn:${videoId}`, burnState.status === 'burning' ? {
    videoId, tool: 'captions', label: 'Burning captions',
    detail: burnState.phase === 'preparing' ? 'Fetching the original video'
      : burnState.phase === 'uploading' ? 'Saving the captioned video' : 'Rendering captions onto the video',
    progress: burnState.progress || undefined,
  } : null)

  // Timeline lanes: who is speaking (runs of one speaker merged) and the text.
  // Transcripts without diarization get the text lane only.
  const timelineLanes = useMemo(() => {
    const segs = transcription?.segments || []
    const turns = []
    for (const seg of segs) {
      const last = turns.at(-1)
      if (last && last.speaker === seg.speaker && seg.start - last.end < 1.5) last.end = seg.end
      else turns.push({ speaker: seg.speaker, start: seg.start, end: seg.end })
    }
    const lanes = [{
      id: 'text', label: 'Text',
      blocks: segs.map((seg, i) => ({ key: i, start: seg.start, end: seg.end, text: seg.text, color: speakerColor(seg.speaker) })),
    }]
    if (segs.some(seg => seg.speaker)) {
      lanes.unshift({
        id: 'speakers', label: 'Speakers',
        blocks: turns.map((t, i) => ({
          key: i, start: t.start, end: t.end, color: speakerColor(t.speaker),
          text: speakerAliases?.[t.speaker]?.trim() || t.speaker,
        })),
      })
    }
    return lanes
  }, [transcription, speakerAliases])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <ProjectBar videoId={videoId} video={videoMeta} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-dim)' }}>
          <Loader2 size={16} className="spin" /> Loading video…
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <ProjectBar
        videoId={videoId}
        video={videoMeta && { ...videoMeta, providers: availableProviders }}
      >
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => navigate(`/playground?video=${videoId}`)}
          title="Compare transcription providers side by side in the Lab"
        >
          <FlaskConical size={14} /> Compare providers
        </button>
      </ProjectBar>

      {/* Editor body: transcript | stage + timeline | style. Resizable. */}
      <Group
        orientation="horizontal"
        defaultLayout={editorDefaultLayout}
        onLayoutChanged={onEditorLayoutChanged}
        style={{ flex: 1, overflow: 'hidden', borderTop: '1px solid var(--border)' }}
      >
        <Panel id="transcript" defaultSize="26%" minSize="18%" maxSize="45%"
          style={{ background: 'var(--surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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

        <Separator className="panel-resize-handle" />

        <Panel id="stage" defaultSize="54%" minSize="35%" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="stage">
            <VideoPlayer
              videoId={videoId}
              transcription={transcription}
              style={style}
              onStyleChange={setStyle}
              videoRef={videoRef}
              onTimeChange={setCurrentTime}
              fillHeight
            />
          </div>
          <Timeline videoRef={videoRef} lanes={timelineLanes} />
        </Panel>

        <Separator className="panel-resize-handle" />

        <Panel id="style" defaultSize="20%" minSize="16%" maxSize="35%"
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
