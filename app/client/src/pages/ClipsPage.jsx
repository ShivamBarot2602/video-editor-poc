import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Scissors, ArrowLeft, Loader2, Sparkles, AlertTriangle, FileText, Bookmark, Film, VideoOff } from 'lucide-react'
import toast from 'react-hot-toast'
import UploadZone from '../components/UploadZone'
import ClipCard from '../components/ClipCard'
import ClipControlsBar from '../components/ClipControlsBar'
import ClipAnalyzeProgress from '../components/ClipAnalyzeProgress'
import SourceVideoPlayer from '../components/SourceVideoPlayer'
import { fmtSize } from '../lib/format'
import { triggerDownload } from '../lib/dom'
import { listVideos } from '../api/videos'
import { getClips, getSavedClips, suggestClips, saveClip, removeSavedClip, openSuggestStream, openExportStream } from '../api/clips'

const IDLE = { status: 'idle', progress: 0 }

function resolveAspectRatio(meta) {
  if (meta?.video_width && meta?.video_height) return `${meta.video_width} / ${meta.video_height}`
  return '16 / 9'
}

function seedExportStates(clips) {
  const out = {}
  for (const c of clips || []) {
    out[c.id] = c.exported && c.clipUrl ? { status: 'done', progress: 100, url: c.clipUrl } : IDLE
  }
  return out
}

// Mirror of the server's computeSavedId — lets a suggested card know whether its
// clip is already in the saved library.
function computeSavedId(clip) {
  return `saved-${clip.suggestProvider || 'clip'}-${Math.round(clip.start * 1000)}-${Math.round(clip.end * 1000)}`
}

/* `/clips` entry with no video — upload or pick a recent session. */
function ClipsPicker() {
  const navigate = useNavigate()
  const [videos, setVideos] = useState(null)
  const [thumbErrors, setThumbErrors] = useState({})
  const go = (id) => navigate(`/clips/${id}`)

  useEffect(() => {
    listVideos().then(setVideos).catch(() => setVideos([]))
  }, [])

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden', borderRadius: 'var(--radius)', margin: '0 8px 8px' }}>
      <div style={{
        width: 300, flexShrink: 0, background: 'var(--surface-dark)',
        borderRight: '1px solid var(--border-sub)', display: 'flex', flexDirection: 'column',
        padding: 20, gap: 14, overflow: 'hidden',
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Upload Video
        </div>
        <UploadZone onUpload={(id) => go(id)} compact />
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-sub)', paddingTop: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Or pick a recent session
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {videos === null ? (
              <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>Loading…</span>
            ) : videos.length === 0 ? (
              <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>No sessions yet.</span>
            ) : videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => go(v.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
                  borderBottom: i < videos.length - 1 ? '1px solid var(--border-sub)' : 'none',
                  cursor: 'pointer', textAlign: 'left', background: 'transparent', border: 'none', width: '100%',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.65'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <div style={{ width: 46, height: 28, flexShrink: 0, background: 'var(--video-bg)', borderRadius: 3, overflow: 'hidden' }}>
                  {!thumbErrors[v.id] && (
                    <img src={v.thumbnail} alt={v.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setThumbErrors(p => ({ ...p, [v.id]: true }))} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.filename}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
                    {fmtSize(v.size)} · {v.providers?.length ? `${v.providers.length} transcript${v.providers.length > 1 ? 's' : ''}` : 'no transcript'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ border: '1.5px dashed var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: 'var(--surface)', padding: '48px 64px', maxWidth: 440 }}>
          <div style={{ width: 40, height: 40, border: '1.5px dashed var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Scissors size={20} style={{ color: 'var(--text-dim)' }} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Find engaging clips</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
            Upload a video or pick a recent session.<br />A transcript is required to suggest clips.
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ClipsPage() {
  const { videoId } = useParams()
  if (!videoId) return <ClipsPicker />
  return <ClipsEditor key={videoId} videoId={videoId} />
}

function ClipsEditor({ videoId }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [video, setVideo] = useState(null)
  const [transcriptProviders, setTranscriptProviders] = useState(null) // null = discovering
  const [selectedTranscriptProvider, setSelectedTranscriptProvider] = useState(searchParams.get('transcriptProvider') || '')
  const [suggestProvider, setSuggestProvider] = useState(
    () => searchParams.get('suggestProvider') || localStorage.getItem('clip_suggest_provider') || 'gemini'
  )
  const [method, setMethod] = useState(
    () => searchParams.get('method') || localStorage.getItem('clip_method') || 'subtitles'
  )
  const [videoModel, setVideoModel] = useState(
    () => searchParams.get('vmodel') || localStorage.getItem('clip_video_model') || 'gemini-2.5-flash'
  )
  const [bucket, setBucket] = useState(searchParams.get('bucket') || 'auto')
  const [count, setCount] = useState(parseInt(searchParams.get('count'), 10) || 3)

  const [clips, setClips] = useState(null)          // null = none yet
  const [metadata, setMetadata] = useState(null)
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [suggesting, setSuggesting] = useState(false)
  const [analyzePhase, setAnalyzePhase] = useState(null) // {phase, percent} during a video run
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(null)
  const [exportStates, setExportStates] = useState({})
  const [savedClips, setSavedClips] = useState([])

  const esMapRef = useRef(new Map())     // per-clip export streams
  const analyzeEsRef = useRef(null)      // the single video-analysis stream

  // ── deep-link + persistence ──────────────────────────────────────────────
  useEffect(() => {
    const next = { method, suggestProvider, bucket, count: String(count) }
    if (selectedTranscriptProvider) next.transcriptProvider = selectedTranscriptProvider
    if (method === 'video') next.vmodel = videoModel
    setSearchParams(next, { replace: true })
    localStorage.setItem('clip_suggest_provider', suggestProvider)
    localStorage.setItem('clip_method', method)
    localStorage.setItem('clip_video_model', videoModel)
  }, [method, suggestProvider, selectedTranscriptProvider, videoModel, bucket, count]) // eslint-disable-line

  // ── discover the video + its transcript providers ──────────────────────────
  useEffect(() => {
    let cancel = false
    listVideos().then(list => {
      if (cancel) return
      const v = (list || []).find(x => x.id === videoId)
      if (!v) { setNotFound(true); setTranscriptProviders([]); return }
      setVideo(v)
      setTranscriptProviders(v.providers || [])
      setSelectedTranscriptProvider(prev => (prev && v.providers?.includes(prev)) ? prev : (v.providers?.[0] || ''))
    }).catch(() => { if (!cancel) setTranscriptProviders([]) })
    return () => { cancel = true }
  }, [videoId, navigate])

  // ── load previously-saved suggestions for the active method/provider ───────
  const loadProvider = method === 'video' ? 'geminivideo' : suggestProvider
  useEffect(() => {
    let cancel = false
    setLoadingSaved(true)
    setError(null)
    getClips(videoId, loadProvider)
      .then(d => {
        if (cancel) return
        if (d) { setMetadata(d.metadata); setClips(d.clips || []); setExportStates(p => ({ ...p, ...seedExportStates(d.clips) })) }
        else { setMetadata(null); setClips(null) }
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoadingSaved(false) })
    return () => { cancel = true }
  }, [videoId, loadProvider])

  // ── load the persistent saved-clips library (cross-provider, survives runs) ──
  useEffect(() => {
    let cancel = false
    getSavedClips(videoId)
      .then(d => {
        if (cancel) return
        const list = d.clips || []
        setSavedClips(list)
        setExportStates(p => ({ ...p, ...seedExportStates(list) }))
      })
      .catch(() => {})
    return () => { cancel = true }
  }, [videoId])

  // ── tear down any open export streams on unmount ───────────────────────────
  useEffect(() => () => {
    for (const es of esMapRef.current.values()) { try { es.close() } catch (_) {} }
    esMapRef.current.clear()
    if (analyzeEsRef.current) { try { analyzeEsRef.current.close() } catch (_) {} analyzeEsRef.current = null }
  }, [])

  function handleSuggest() {
    if (suggesting) return
    if (method === 'video') return analyzeVideo()
    return suggestFromTranscript()
  }

  // Subtitles method — quick POST, returns JSON.
  async function suggestFromTranscript() {
    if (!selectedTranscriptProvider) { toast.error('Pick a transcript source first'); return }
    setSuggesting(true)
    setError(null)
    const tid = toast.loading('Suggesting clips…')
    try {
      const data = await suggestClips(videoId, { suggestProvider, transcriptProvider: selectedTranscriptProvider, bucket, count }, 'Failed to suggest clips')
      setMetadata(data.metadata)
      setClips(data.clips || [])
      setExportStates(p => ({ ...p, ...seedExportStates(data.clips) }))
      toast.success(`Found ${data.clips?.length || 0} clips`, { id: tid })
      ;(data.metadata?.warnings || []).forEach(w => toast(w, { icon: '⚠️' }))
    } catch (e) {
      setError(e.message)
      toast.error(e.message, { id: tid })
    } finally {
      setSuggesting(false)
    }
  }

  // Video-understanding method — long-running SSE (upload → analyze → extract).
  function analyzeVideo() {
    const prev = analyzeEsRef.current
    if (prev) { try { prev.close() } catch (_) {} analyzeEsRef.current = null }

    setSuggesting(true)
    setError(null)
    setAnalyzePhase({ phase: 'start', percent: 0 })
    const tid = toast.loading('Analyzing video…')

    let es
    const finish = () => {
      try { es.close() } catch (_) {}
      if (analyzeEsRef.current === es) analyzeEsRef.current = null
      setSuggesting(false)
      setAnalyzePhase(null)
    }

    es = openSuggestStream(videoId, { method: 'video', bucket, count, model: videoModel }, {
      onMessage: (ev) => {
        if (ev.type === 'start') {
          setAnalyzePhase({ phase: 'start', percent: 0 })
        } else if (ev.type === 'phase') {
          setAnalyzePhase({ phase: ev.phase, percent: ev.percent ?? 0 })
        } else if (ev.type === 'done') {
          setMetadata(ev.data?.metadata)
          setClips(ev.data?.clips || [])
          setExportStates(p => ({ ...p, ...seedExportStates(ev.data?.clips) }))
          toast.success(`Found ${ev.data?.clips?.length || 0} clips`, { id: tid })
          ;(ev.data?.metadata?.warnings || []).forEach(w => toast(w, { icon: '⚠️' }))
          finish()
        } else if (ev.type === 'error') {
          setError(ev.message)
          toast.error(ev.message || 'Analysis failed', { id: tid })
          finish()
        }
      },
      onError: () => {
        if (analyzeEsRef.current !== es) return // already finished/cancelled
        setError('Connection lost during analysis')
        toast.error('Connection lost during analysis', { id: tid })
        finish()
      },
    })
    analyzeEsRef.current = es
  }

  function cancelAnalyze() {
    const es = analyzeEsRef.current
    if (es) { try { es.close() } catch (_) {} analyzeEsRef.current = null }
    setSuggesting(false)
    setAnalyzePhase(null)
    toast('Analysis cancelled')
  }

  async function handleSave(clip) {
    try {
      const data = await saveClip(videoId, { clip, transcriptProvider: selectedTranscriptProvider, bucket }, 'Save failed')
      setSavedClips(data.clips || [])
      toast.success('Saved to your library')
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function handleRemoveSaved(savedId) {
    try {
      const data = await removeSavedClip(videoId, savedId, 'Remove failed')
      setSavedClips(data.clips || [])
      const es = esMapRef.current.get(savedId)
      if (es) { try { es.close() } catch (_) {} esMapRef.current.delete(savedId) }
      toast.success('Removed from saved')
    } catch (e) {
      toast.error(e.message)
    }
  }

  // Download = ffmpeg-cut on demand (SSE progress) then trigger a browser
  // download. Re-download is instant once the clip is cut. `source` selects
  // which library the clip lives in ('suggest' = current results, 'saved').
  function handleDownload(clip, source = 'suggest') {
    const id = clip.id
    const cur = exportStates[id]
    if (cur?.status === 'done' && cur.url) { triggerDownload(cur.url); return }

    const prev = esMapRef.current.get(id)
    if (prev) { try { prev.close() } catch (_) {} esMapRef.current.delete(id) }

    setExportStates(p => ({ ...p, [id]: { status: 'exporting', progress: 0 } }))
    const es = openExportStream(videoId, { clipId: id, source, suggestProvider: clip.suggestProvider || suggestProvider }, {
      onMessage: (ev) => {
        if (ev.type === 'start') {
          setExportStates(p => ({ ...p, [id]: { status: 'exporting', progress: 0 } }))
        } else if (ev.type === 'progress') {
          setExportStates(p => ({ ...p, [id]: { status: 'exporting', progress: ev.percent ?? 0 } }))
        } else if (ev.type === 'done') {
          setExportStates(p => ({ ...p, [id]: { status: 'done', progress: 100, url: ev.clipUrl } }))
          try { es.close() } catch (_) {}
          esMapRef.current.delete(id)
          triggerDownload(ev.clipUrl)
        } else if (ev.type === 'error') {
          setExportStates(p => ({ ...p, [id]: { status: 'error', error: ev.message } }))
          try { es.close() } catch (_) {}
          esMapRef.current.delete(id)
          toast.error(ev.message || 'Download failed')
        }
      },
      onError: () => {
        if (es.readyState === EventSource.CLOSED) return // benign close after done/error
        setExportStates(p => {
          const c = p[id]
          if (c?.status === 'done') return p
          return { ...p, [id]: { status: 'error', error: 'Connection lost' } }
        })
        try { es.close() } catch (_) {}
        esMapRef.current.delete(id)
      },
    })
    esMapRef.current.set(id, es)
  }

  const discovering = !notFound && transcriptProviders === null
  const noTranscript = !discovering && Array.isArray(transcriptProviders) && transcriptProviders.length === 0
  const isVideo = method === 'video'
  const aspectRatio = resolveAspectRatio(metadata)
  const hasClips = Array.isArray(clips) && clips.length > 0
  const savedIds = new Set(savedClips.map(c => c.id))

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
      <PageBar videoId={videoId} filename={video?.filename} count={hasClips ? clips.length : 0} />

      {notFound ? (
        <Centered>
          <VideoOff size={24} color="var(--text-faint)" />
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Video not found</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6, textAlign: 'center' }}>
            This video id doesn’t exist or was removed.
          </div>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 6, gap: 6 }}>
            <ArrowLeft size={14} /> Back home
          </Link>
        </Centered>
      ) : discovering ? (
        <Centered><Loader2 size={16} className="spin" /> Loading…</Centered>
      ) : (
        <>
          <ClipControlsBar
            method={method}
            onMethod={setMethod}
            transcriptProviders={transcriptProviders}
            transcriptProvider={selectedTranscriptProvider}
            onTranscriptProvider={setSelectedTranscriptProvider}
            suggestProvider={suggestProvider}
            onSuggestProvider={setSuggestProvider}
            videoModel={videoModel}
            onVideoModel={setVideoModel}
            bucket={bucket}
            onBucket={setBucket}
            count={count}
            onCount={setCount}
            onSuggest={handleSuggest}
            suggesting={suggesting}
          />

          <Group orientation="horizontal" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {/* LEFT — full source video, plays independently. Resizable. */}
            <Panel id="clips-source" defaultSize="42%" minSize="28%" maxSize="60%" style={{ overflow: 'hidden', display: 'flex' }}>
              <div style={{
                flex: 1, minWidth: 0,
                padding: '18px 20px', overflowY: 'auto',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                background: 'var(--surface-dark)',
              }}>
                <SourceVideoPlayer
                  videoId={videoId}
                  filename={video?.filename}
                  size={video?.size}
                  durationS={metadata?.video_duration_s}
                  width={metadata?.video_width}
                  height={metadata?.video_height}
                />
              </div>
            </Panel>

            <Separator className="panel-resize-handle" />

            {/* RIGHT — clip results (scrolls independently) */}
            <Panel id="clips-results" defaultSize="58%" minSize="40%" style={{ overflow: 'hidden', display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 20px 32px' }}>
            {error && (
              <div style={{
                marginBottom: 16, padding: 10,
                background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
                borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--error)',
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {savedClips.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Bookmark size={14} color="var(--accent)" />
                  <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-bright)' }}>Saved clips</h2>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{savedClips.length} kept across runs</span>
                </div>
                <div className="clips-grid">
                  {savedClips.map(c => (
                    <ClipCard
                      key={c.id}
                      videoId={videoId}
                      clip={c}
                      aspectRatio={aspectRatio}
                      variant="saved"
                      exportState={exportStates[c.id] || IDLE}
                      onDownload={(clip) => handleDownload(clip, 'saved')}
                      onRemove={handleRemoveSaved}
                    />
                  ))}
                </div>
                <div className="divider" style={{ marginTop: 20 }} />
              </div>
            )}

            {isVideo && suggesting ? (
              <>
                <ClipAnalyzeProgress
                  phase={analyzePhase?.phase || 'start'}
                  percent={analyzePhase?.percent || 0}
                  onCancel={cancelAnalyze}
                />
                <div className="clips-grid">
                  {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} aspectRatio={aspectRatio} />)}
                </div>
              </>
            ) : (!isVideo && noTranscript) ? (
              <Centered>
                <FileText size={22} color="var(--text-faint)" />
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>No transcript for the Subtitles method</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6, textAlign: 'center', maxWidth: 320 }}>
                  Transcribe this video first, or switch to{' '}
                  <strong style={{ color: 'var(--text-muted)' }}>Video understanding</strong> above (no transcript needed).
                </div>
                <Link to={`/editor/${videoId}`} className="btn btn-primary" style={{ marginTop: 6, gap: 6 }}>
                  Go to editor
                </Link>
              </Centered>
            ) : suggesting ? (
              <div className="clips-grid">
                {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} aspectRatio={aspectRatio} />)}
              </div>
            ) : loadingSaved ? (
              <Centered><Loader2 size={16} className="spin" /> Loading clips…</Centered>
            ) : hasClips ? (
              <>
                {metadata?.model && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12 }}>
                    {clips.length} clips · {metadata.model} · {(isVideo || metadata.method === 'video')
                      ? 'video understanding'
                      : `from ${metadata.transcriptProvider} transcript`}
                  </div>
                )}
                <div className="clips-grid">
                  {clips.map(c => (
                    <ClipCard
                      key={c.id}
                      videoId={videoId}
                      clip={c}
                      aspectRatio={aspectRatio}
                      variant="suggested"
                      isSaved={savedIds.has(computeSavedId(c))}
                      exportState={exportStates[c.id] || IDLE}
                      onSave={handleSave}
                      onDownload={(clip) => handleDownload(clip, 'suggest')}
                    />
                  ))}
                </div>
              </>
            ) : (
              <Centered>
                {isVideo ? <Film size={22} color="var(--text-faint)" /> : <Sparkles size={22} color="var(--text-faint)" />}
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No clips yet.</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                  {isVideo ? 'Click “Analyze video” to find clips.' : 'Pick your options above and click “Suggest clips”.'}
                </div>
              </Centered>
            )}
            </div>
            </Panel>
          </Group>
        </>
      )}

      <style>{`
        .clips-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; align-items: start; }
        .spin { animation: spin 1s linear infinite; }
        .clip-shimmer {
          background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface) 37%, var(--surface-2) 63%);
          background-size: 400% 100%; animation: clip-shimmer 1.4s ease infinite;
        }
        @keyframes clip-shimmer { 0% { background-position: 100% 0 } 100% { background-position: 0 0 } }
        @media (prefers-reduced-motion: reduce) { .clip-shimmer { animation: none } .spin { animation: none } }
      `}</style>
    </div>
  )
}

function PageBar({ videoId, filename, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px', borderBottom: '1px solid var(--border-sub)',
      background: 'var(--surface-dark)', flexShrink: 0,
    }}>
      <Link to={`/editor/${videoId}`} className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <ArrowLeft size={14} /> Editor
      </Link>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-bright)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Scissors size={14} color="var(--accent)" /> Video Clips
      </div>
      {filename && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
          {filename}
        </span>
      )}
      <code style={{ fontSize: 10, color: 'var(--text-faint)', padding: '2px 6px', background: 'var(--hover-overlay)', borderRadius: 4 }}>
        {videoId}
      </code>
      {count > 0 && (
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
          Preview, then export the ones you want.
        </span>
      )}
    </div>
  )
}

function Centered({ children }) {
  return (
    <div style={{
      flex: 1, minHeight: 240, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
      color: 'var(--text-muted)', fontSize: 13, padding: 24,
    }}>{children}</div>
  )
}

function SkeletonCard({ aspectRatio }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-sub)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div className="clip-shimmer" style={{ width: '100%', aspectRatio }} />
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="clip-shimmer" style={{ height: 14, width: '80%', borderRadius: 4 }} />
        <div className="clip-shimmer" style={{ height: 11, width: '95%', borderRadius: 4 }} />
        <div className="clip-shimmer" style={{ height: 11, width: '40%', borderRadius: 4 }} />
        <div className="clip-shimmer" style={{ height: 30, width: '100%', borderRadius: 6, marginTop: 4 }} />
      </div>
    </div>
  )
}
