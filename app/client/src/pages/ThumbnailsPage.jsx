import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'
import {
  Sparkles, Wand2, Image as ImageIcon, Check, AlertTriangle,
  ArrowLeft, Loader2, RefreshCw, Play, Info, Download, Eye, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import VideoPlayer from '../components/VideoPlayer'
import UploadZone from '../components/UploadZone'
import TimerToast from '../components/TimerToast'
import { fmtTimecodeTenths as fmtTime, fmtSize, fmtDate } from '../lib/format'
import { listVideos } from '../api/videos'
import { getThumbnails } from '../api/thumbnails'
import { useLocalStorageState } from '../hooks/useLocalStorageState'
import { openThumbnailStream } from '../api/thumbnails'

const PHASES = [
  { id: 'extracting', label: 'Extracting frames', hint: 'Grab still snapshots from across the video' },
  { id: 'scoring',    label: 'Scoring frames',    hint: 'Rate each snapshot for sharpness and lighting' },
  { id: 'dedup',      label: 'Deduplicating',     hint: 'Drop near-identical snapshots, keep the variety' },
  { id: 'reranking',  label: 'Vision rerank',     hint: 'AI picks the 3 best-looking frames' },
  { id: 'polishing',  label: 'Image-gen polish',  hint: 'AI turns each pick into a finished thumbnail' },
  { id: 'done',       label: 'Done',              hint: 'Thumbnails ready — choose your favorite' },
]

const PROVIDER_META = {
  original: { label: 'Original',       icon: ImageIcon, color: 'var(--text-muted)' },
  gemini:   { label: 'Gemini polish',  icon: Sparkles,  color: 'var(--provider-gemini)' },
  openai:   { label: 'OpenAI polish',  icon: Wand2,     color: '#10a37f' },
}

// Selectable rerankers. Gemini is the default; if the chosen one fails at run
// time the server falls back to the other available provider.
const RERANKERS = [
  { id: 'gemini', label: 'Gemini', model: 'gemini-2.5-pro' },
  { id: 'openai', label: 'OpenAI', model: 'gpt-4.1-mini' },
]

/**
 * Resolve the CSS `aspect-ratio` string to use for thumbnail cells.
 * Prefers explicit width/height from state; falls back to aspect category.
 */
function resolveAspectRatio(video) {
  if (video?.width && video?.height) return `${video.width} / ${video.height}`
  switch (video?.aspect) {
    case 'portrait':  return '9 / 16'
    case 'square':    return '1 / 1'
    case 'landscape': return '16 / 9'
    default:          return '16 / 9' // safe default
  }
}

/* No-video entry (`/thumbnails`): upload or pick a recent session, then route
   to `/thumbnails/:id`. Mirrors the Playground empty state. */
function ThumbnailsPicker() {
  const navigate = useNavigate()
  const [videos, setVideos] = useState(null)
  const [thumbErrors, setThumbErrors] = useState({})

  useEffect(() => {
    listVideos().then(setVideos).catch(() => setVideos([]))
  }, [])

  const go = (id) => navigate(`/thumbnails/${id}`)

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden', borderRadius: 'var(--radius)', margin: '0 8px 8px' }}>
      {/* Left: upload + recent sessions */}
      <div style={{
        width: 300, flexShrink: 0, background: 'var(--surface-dark)',
        borderRight: '1px solid var(--border-sub)', display: 'flex', flexDirection: 'column',
        padding: 20, gap: 14, overflow: 'hidden',
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
          Upload Video
        </div>
        <div style={{ flexShrink: 0 }}>
          <UploadZone onUpload={(id) => go(id)} compact />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-sub)', paddingTop: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
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
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.65'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <div style={{ width: 46, height: 28, flexShrink: 0, background: 'var(--video-bg)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                  {!thumbErrors[v.id] ? (
                    <img src={v.thumbnail} alt={v.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setThumbErrors(p => ({ ...p, [v.id]: true }))} />
                  ) : (
                    <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}><Play size={10} /></span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.filename}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{fmtSize(v.size)} · {fmtDate(v.uploadedAt)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: hint */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ border: '1.5px dashed var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--surface)', padding: '48px 64px', maxWidth: 440 }}>
          <div style={{ width: 40, height: 40, border: '1.5px dashed var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={20} style={{ color: 'var(--text-dim)' }} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Generate thumbnails</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
            Upload a video or pick a recent session to<br />generate ranked thumbnail candidates.
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ThumbnailsPage() {
  const { videoId } = useParams()
  // No video in the URL (global `/thumbnails` entry) → show the picker.
  if (!videoId) return <ThumbnailsPicker />
  return <ThumbnailsEditor key={videoId} videoId={videoId} />
}

function ThumbnailsEditor({ videoId }) {
  const videoRef = useRef(null)
  const [state, setState]       = useState(null)         // server-side thumbnails.json
  const [stateLoading, setStateLoading] = useState(true)
  const [running, setRunning]   = useState(false)
  const [phase, setPhase]       = useState(null)
  const [phaseMeta, setPhaseMeta] = useState({})         // counts, warnings
  const [warnings, setWarnings] = useState([])
  const [error, setError]       = useState(null)
  const [reranker, setReranker] = useLocalStorageState('thumb_reranker', 'gemini')
  const [runCandidates, setRunCandidates] = useState(null)  // progressive picks during a live run
  const [runMeta, setRunMeta] = useState(null)              // rerank model + video, from the `picks` event

  // ─── load cached state on mount ──────────────────────────────────────────
  useEffect(() => {
    let cancel = false
    setStateLoading(true)
    getThumbnails(videoId)
      .then(s => { if (!cancel) setState(s) })
      .catch(() => {})
      .finally(() => { if (!cancel) setStateLoading(false) })
    return () => { cancel = true }
  }, [videoId])

  // ─── generate (EventSource SSE) ──────────────────────────────────────────
  // Use EventSource (native browser SSE) instead of fetch + ReadableStream.
  // The fetch-based approach was buffered end-to-end by something between the
  // server and the browser (likely the vite dev proxy), batching all events
  // into a single dump at response end. EventSource doesn't suffer from this.
  const evtSourceRef = useRef(null)
  function handleGenerate() {
    if (running) return
    setRunning(true)
    setPhase(null)
    setPhaseMeta({})
    setWarnings([])
    setError(null)
    setRunCandidates([])   // enter live mode; rows appear once the `picks` event arrives
    setRunMeta(null)

    // Tear down any previous stream.
    if (evtSourceRef.current) {
      try { evtSourceRef.current.close() } catch (_) {}
      evtSourceRef.current = null
    }

    const tid = toast.loading(<TimerToast label="Generating thumbnails…" />)
    const es = openThumbnailStream(videoId, reranker, {
      onMessage: (event) => {
        if (event.type === 'phase') {
          setPhase(event.phase)
          setPhaseMeta(prev => ({ ...prev, [event.phase]: event }))
        } else if (event.type === 'picks') {
          // Rerank finished — render the rows now, each polish cell pending.
          setRunMeta({ rerankProvider: event.rerankProvider, rerankModel: event.rerankModel, video: event.video })
          const pending = {}
          ;(event.providers || []).forEach(p => { pending[p] = { status: 'pending' } })
          setRunCandidates((event.picks || []).map(p => ({ ...p, polished: { ...pending } })))
        } else if (event.type === 'polished') {
          // A polish job finished — fill that one cell live.
          setRunCandidates(prev => prev && prev.map(c => c.idx === event.idx
            ? { ...c, polished: { ...c.polished, [event.provider]: { status: 'ok', url: event.url, model: event.model } } }
            : c))
        } else if (event.type === 'polish_failed') {
          setWarnings(w => [...w, { stage: event.provider || 'polish', message: event.message }])
          setRunCandidates(prev => prev && prev.map(c => c.idx === event.idx
            ? { ...c, polished: { ...c.polished, [event.provider]: { status: 'error', error: event.message } } }
            : c))
        } else if (event.type === 'warn') {
          setWarnings(w => [...w, { stage: event.stage || event.provider || 'unknown', message: event.message }])
        } else if (event.type === 'done') {
          setPhase('done')
          setState(event.state)
          setRunCandidates(null)   // hand off to authoritative saved state
          setRunMeta(null)
          es.close()
          evtSourceRef.current = null
          setRunning(false)
          toast.success('Thumbnails ready!', { id: tid })
        } else if (event.type === 'error') {
          setError(event.message)
          es.close()
          evtSourceRef.current = null
          setRunning(false)
          toast.error(event.message || 'Thumbnail generation failed', { id: tid })
        }
      },
      onError: () => {
        // EventSource auto-reconnects on transient errors, but once the server
        // closes the stream after sending `done`, we get an error event. If we
        // already have `done`/`error` state, this is benign and `running` is
        // already false. Otherwise surface a generic message.
        if (es.readyState === EventSource.CLOSED) return
        setError('SSE connection lost')
        try { es.close() } catch (_) {}
        evtSourceRef.current = null
        setRunning(false)
        toast.error('Connection lost during generation', { id: tid })
      },
    })
    evtSourceRef.current = es
  }

  // Cleanup on unmount.
  useEffect(() => () => {
    if (evtSourceRef.current) {
      try { evtSourceRef.current.close() } catch (_) {}
      evtSourceRef.current = null
    }
  }, [])

  // ─── lightbox preview ─────────────────────────────────────────────────────
  // Holds { url, downloadUrl, label } for the full-size overlay, or null.
  const [preview, setPreview] = useState(null)

  // ─── derived ─────────────────────────────────────────────────────────────
  // During a live run show the progressive `runCandidates`; otherwise the saved state.
  const liveRun = runCandidates != null
  const candidates = liveRun ? runCandidates : (state?.candidates || [])
  const displayMeta = liveRun ? { ...(state || {}), ...(runMeta || {}) } : state
  const aspectSource = (liveRun ? runMeta?.video : state?.video) || state?.video
  const hasCandidates = candidates.length > 0
  const activePhaseIdx = phase ? PHASES.findIndex(p => p.id === phase) : -1

  // ─── render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
      <PageBar videoId={videoId} hasCandidates={hasCandidates} />

      <div style={{ flex: 1, minHeight: 0 }}>
        <Group orientation="horizontal" style={{ height: '100%', display: 'flex' }}>
          <Panel id="thumbnails-left" defaultSize="32%" minSize="22%" maxSize="48%" style={{ overflow: 'hidden', display: 'flex' }}>
            <LeftPane
              videoId={videoId}
              videoRef={videoRef}
              running={running}
              hasCandidates={hasCandidates}
              phase={phase}
              activePhaseIdx={activePhaseIdx}
              phaseMeta={phaseMeta}
              warnings={warnings}
              error={error}
              reranker={reranker}
              onRerankerChange={setReranker}
              onGenerate={handleGenerate}
            />
          </Panel>

          <Separator className="panel-resize-handle" />

          <Panel id="thumbnails-right" defaultSize="68%" minSize="40%" style={{ overflow: 'hidden', display: 'flex' }}>
            <RightPane
              candidates={candidates}
              running={running}
              phase={phase}
              live={liveRun}
              stateLoading={stateLoading}
              onPreview={setPreview}
              onSeek={(t) => {
                if (videoRef.current && Number.isFinite(t)) {
                  videoRef.current.currentTime = t
                  videoRef.current.play?.().catch(() => {})
                }
              }}
              meta={displayMeta}
              videoAspectRatio={resolveAspectRatio(aspectSource)}
            />
          </Panel>
        </Group>
      </div>

      <Lightbox preview={preview} onClose={() => setPreview(null)} />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Top bar                                                                  */
function PageBar({ videoId, hasCandidates }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      borderBottom: '1px solid var(--border-sub)',
      background: 'var(--surface-dark)',
      flexShrink: 0,
    }}>
      <Link
        to="/"
        className="btn btn-ghost btn-sm"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
      >
        <ArrowLeft size={14} /> Back
      </Link>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-bright)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={14} color="var(--accent)" />
        Thumbnail Candidates
      </div>
      <code style={{ fontSize: 10, color: 'var(--text-faint)', padding: '2px 6px', background: 'var(--hover-overlay)', borderRadius: 4 }}>
        {videoId}
      </code>
      {hasCandidates && (
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
          Pick one or generate again to refresh.
        </span>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Left pane: video preview + controls + progress                           */
function LeftPane({
  videoId, videoRef, running, hasCandidates, phase, activePhaseIdx,
  phaseMeta, warnings, error, reranker, onRerankerChange, onGenerate,
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--border-sub)',
      background: 'var(--surface-dark)',
    }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border-sub)' }}>
        <div style={{
          background: 'var(--video-bg)', borderRadius: 'var(--radius)',
          overflow: 'hidden', aspectRatio: '16 / 9',
        }}>
          <VideoPlayer videoId={videoId} videoRef={videoRef} fillHeight={true} />
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <RerankerSelect value={reranker} onChange={onRerankerChange} disabled={running} />
        <button
          className="btn btn-primary btn-full"
          onClick={onGenerate}
          disabled={running}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}
        >
          {running
            ? <><Loader2 size={14} className="spin" /> Generating…</>
            : hasCandidates
              ? <><RefreshCw size={14} /> Re-run Polish</>
              : <><Sparkles size={14} /> Generate Candidates</>}
        </button>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.5 }}>
          Frames + scoring are cached after first run. Re-running redoes the vision
          rerank and the image-gen polish stage.
        </div>
      </div>

      <div style={{ padding: '4px 12px 12px', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>
          Pipeline
        </div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PHASES.map((p, i) => {
            const isDone = activePhaseIdx > i || (phase === 'done' && p.id === 'done')
            const isActive = phase === p.id && p.id !== 'done'
            const isIdle = activePhaseIdx < i && !(phase === 'done' && p.id === 'done')
            const meta = phaseMeta[p.id]
            return (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <PhaseDot state={isDone ? 'done' : isActive ? 'active' : 'idle'} />
                <span style={{
                  color: isDone ? 'var(--success)' : isActive ? 'var(--text-bright)' : 'var(--text-faint)',
                  fontWeight: isActive ? 600 : 400,
                }}>
                  {p.label}
                </span>
                <StepInfo hint={p.hint} />
                {meta?.count != null && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-faint)' }}>
                    {meta.count}
                  </span>
                )}
                {meta?.cached && (
                  <span style={{ marginLeft: meta?.count != null ? 6 : 'auto', fontSize: 9, color: 'var(--text-faint)' }}>
                    cached
                  </span>
                )}
                {meta?.skipped && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-faint)', fontStyle: 'italic' }}>
                    skipped
                  </span>
                )}
                {p.id === 'reranking' && meta?.model && !meta?.skipped && (
                  <span style={{ marginLeft: meta?.count != null ? 6 : 'auto', fontSize: 9, color: meta?.fallback ? 'var(--error)' : 'var(--text-faint)' }}>
                    {meta.model}{meta?.fallback ? ' (fallback)' : ''}
                  </span>
                )}
              </li>
            )
          })}
        </ol>

        {warnings.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>
              Warnings
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {warnings.map((w, i) => (
                <li key={i} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <AlertTriangle size={12} color="var(--error)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span><b style={{ color: 'var(--text-bright)' }}>{w.stage}:</b> {w.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 16, padding: 10,
            background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
            borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--error)',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      <style>{`@keyframes thumb-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } } .spin { animation: thumb-spin 1s linear infinite }`}</style>
    </div>
  )
}

/* Compact reranker picker: label + right-aligned segmented toggle on one row,
   with a subtle model/fallback hint beneath. */
function RerankerSelect({ value, onChange, disabled }) {
  const active = RERANKERS.find(r => r.id === value) || RERANKERS[0]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Reranker</span>
        <div
          role="radiogroup"
          aria-label="Vision reranker"
          style={{
            display: 'inline-flex', gap: 2, padding: 2,
            background: 'var(--hover-overlay)',
            border: '1px solid var(--border-sub)',
            borderRadius: 8,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {RERANKERS.map(r => {
            const isActive = r.id === active.id
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={disabled}
                onClick={() => onChange(r.id)}
                title={r.model}
                style={{
                  padding: '3px 12px', fontSize: 12, lineHeight: 1.5,
                  fontWeight: isActive ? 600 : 500,
                  borderRadius: 6, border: 'none',
                  cursor: disabled ? 'default' : 'pointer',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'right' }}>
        {active.model} · auto-fallback
      </div>
    </div>
  )
}

/* Info icon with a hover tooltip (fixed-positioned so it never clips inside the
   scrollable pipeline list). Plain-English explanation of the step. */
function StepInfo({ hint }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ x: r.right + 8, y: r.top + r.height / 2 })
  }
  const hide = () => setPos(null)
  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        tabIndex={0}
        onFocus={show}
        onBlur={hide}
        aria-label={hint}
        style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help', color: 'var(--text-faint)', flexShrink: 0 }}
      >
        <Info size={12} />
      </span>
      {pos && (
        <div
          role="tooltip"
          style={{
            position: 'fixed', left: pos.x, top: pos.y, transform: 'translateY(-50%)',
            zIndex: 1000, maxWidth: 220, padding: '6px 9px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            fontSize: 11, lineHeight: 1.45, color: 'var(--text-bright)', pointerEvents: 'none',
          }}
        >
          {hint}
        </div>
      )}
    </>
  )
}

function PhaseDot({ state }) {
  const size = 14
  if (state === 'done') {
    return (
      <span style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--success)', color: '#000',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}><Check size={9} strokeWidth={3} /></span>
    )
  }
  if (state === 'active') {
    return (
      <span style={{
        width: size, height: size, borderRadius: '50%',
        border: '2px solid var(--accent)', flexShrink: 0,
        boxShadow: '0 0 0 3px rgba(15,103,234,0.18)',
      }} />
    )
  }
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      border: '1px solid var(--border)', flexShrink: 0,
    }} />
  )
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Right pane: candidate rows                                               */
function RightPane({ candidates, running, phase, live, stateLoading, onPreview, onSeek, meta, videoAspectRatio }) {
  const phaseLabel = (PHASES.find(p => p.id === phase)?.label) || 'Generating'
  if (stateLoading) {
    return <CenteredHint><Loader2 size={14} className="spin" /> Loading…</CenteredHint>
  }
  if (candidates.length === 0 && !running) {
    return (
      <CenteredHint>
        <Sparkles size={20} color="var(--text-faint)" />
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>No thumbnails generated yet.</div>
        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-faint)' }}>Click "Generate Candidates" on the left to start.</div>
      </CenteredHint>
    )
  }
  if (candidates.length === 0 && running) {
    // Pre-picks stages (extract / score / dedup / rerank) — show what's happening.
    return (
      <CenteredHint>
        <Loader2 size={20} className="spin" color="var(--accent)" />
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>{phaseLabel}…</div>
        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-faint)' }}>Picks appear as soon as the rerank finishes.</div>
      </CenteredHint>
    )
  }

  return (
    <div style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'auto', padding: '16px 20px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-bright)' }}>
          Top {candidates.length} picks
        </h2>
        {meta?.rerankModel && (
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            ranked by {meta.rerankModel}
          </span>
        )}
        {running ? (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={11} className="spin" /> {phaseLabel}…
          </span>
        ) : meta?.generatedAt && (
          <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto' }}>
            {new Date(meta.generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {candidates.map((c, rank) => (
          <PickRow
            key={c.idx}
            rank={rank + 1}
            candidate={c}
            onPreview={onPreview}
            onSeek={onSeek}
            videoAspectRatio={videoAspectRatio}
          />
        ))}
      </div>
    </div>
  )
}

function CenteredHint({ children }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', fontSize: 13, gap: 6,
    }}>{children}</div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Single pick row: original + N polished cells                              */
function PickRow({ rank, candidate, onPreview, onSeek, videoAspectRatio }) {
  const polishedKeys = Object.keys(candidate.polished || {})
  const cells = useMemo(() => {
    const list = [{
      providerId: 'original',
      url: candidate.originalUrl,
      status: 'ok',
      key: `${candidate.idx}_original`,
    }]
    for (const provId of polishedKeys) {
      const info = candidate.polished[provId]
      list.push({
        providerId: provId,
        url: info.url,
        status: info.status,
        errorMessage: info.error,
        key: `${candidate.idx}_${provId}`,
      })
    }
    return list
  }, [candidate, polishedKeys.join('|')])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'var(--accent)', color: '#fff',
          fontSize: 11, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{rank}</span>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {candidate.vlmScore != null && (
            <ScorePill score={candidate.vlmScore} />
          )}
          {Number.isFinite(candidate.t) && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 6px' }}
              onClick={() => onSeek(candidate.t)}
              title="Seek video to this timestamp"
            >
              <Play size={10} /> {fmtTime(candidate.t)}
            </button>
          )}
          {candidate.rationale && (
            <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>"{candidate.rationale}"</span>
          )}
        </div>
      </div>

      <div className="thumb-row-grid">
        {cells.map(cell => (
          <ThumbCell
            key={cell.key}
            cell={cell}
            onPreview={onPreview}
            timestamp={cell.providerId === 'original' ? candidate.t : null}
            aspectRatio={videoAspectRatio}
          />
        ))}
      </div>

      <style>{`
        .thumb-row-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        @media (max-width: 820px) { .thumb-row-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}

function ScorePill({ score }) {
  const num = Number(score)
  const safe = Number.isFinite(num) ? num : 0
  // Hue: low=red, mid=amber, high=green. Encode also via icon for color-blind safety.
  const tone = safe >= 8 ? 'high' : safe >= 5 ? 'mid' : 'low'
  const bg = tone === 'high' ? 'rgba(34,197,94,0.18)' : tone === 'mid' ? 'rgba(234,179,8,0.18)' : 'rgba(220,38,38,0.18)'
  const fg = tone === 'high' ? 'var(--success)' : tone === 'mid' ? '#eab308' : 'var(--error)'
  return (
    <span
      title={`Vision rerank score: ${safe.toFixed(1)} / 10`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: bg, color: fg, fontWeight: 700, fontSize: 10,
        padding: '2px 7px', borderRadius: 999,
      }}
    >
      <Sparkles size={9} /> {safe.toFixed(1)}
    </span>
  )
}

function ThumbCell({ cell, onPreview, timestamp, aspectRatio = '16 / 9' }) {
  const meta = PROVIDER_META[cell.providerId] || PROVIDER_META.original
  const Icon = meta.icon
  const failed = cell.status === 'error'
  const ready = !failed && !!cell.url
  // Same-origin download route (attachment) — swap /file/ → /download/ so the
  // browser saves the image instead of opening the public S3 URL inline.
  const downloadUrl = cell.url ? cell.url.replace('/file/', '/download/') : null

  const cellBtn = {
    flex: 1, fontSize: 11, padding: '5px 8px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    textDecoration: 'none',
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
      }}
    >
      <div style={{
        position: 'relative', width: '100%', aspectRatio,
        background: failed ? 'rgba(220,38,38,0.05)' : 'var(--video-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {failed ? (
          <div style={{ textAlign: 'center', padding: 12, color: 'var(--error)', fontSize: 11 }}>
            <AlertTriangle size={20} style={{ marginBottom: 6 }} />
            <div style={{ fontWeight: 600 }}>Polish failed</div>
            <div style={{ marginTop: 4, color: 'var(--text-faint)', fontSize: 10, lineHeight: 1.4 }}>
              {(cell.errorMessage || 'Unknown error').slice(0, 140)}
            </div>
          </div>
        ) : cell.url ? (
          <img
            src={cell.url}
            alt={meta.label}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
            <Loader2 size={18} className="spin" />
            {cell.providerId !== 'original' && (
              <div style={{ marginTop: 6, fontSize: 10 }}>Polishing…</div>
            )}
          </div>
        )}

        {/* Top-left provider label */}
        <span style={{
          position: 'absolute', top: 8, left: 8,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 8px', borderRadius: 999,
          background: 'rgba(0,0,0,0.65)', color: '#fff',
          fontSize: 10, fontWeight: 600,
        }}>
          <Icon size={11} color={meta.color} /> {meta.label}
        </span>

        {/* Top-right timestamp on the original */}
        {timestamp != null && Number.isFinite(timestamp) && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            padding: '3px 7px', borderRadius: 4,
            background: 'rgba(0,0,0,0.65)', color: '#fff',
            fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          }}>{fmtTime(timestamp)}</span>
        )}

      </div>

      <div style={{ padding: 8, display: 'flex', gap: 6 }}>
        {ready ? (
          <a
            className="btn btn-outline btn-sm"
            style={cellBtn}
            href={downloadUrl}
            download
            aria-label={`Download ${meta.label} thumbnail`}
          >
            <Download size={12} /> Download
          </a>
        ) : (
          <button className="btn btn-outline btn-sm" style={cellBtn} disabled>
            <Download size={12} /> Download
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          style={cellBtn}
          onClick={() => onPreview({ url: cell.url, downloadUrl, label: meta.label })}
          disabled={!ready}
          aria-label={`Preview ${meta.label} thumbnail`}
        >
          <Eye size={12} /> Preview
        </button>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Full-size preview lightbox — Esc / backdrop / X to dismiss                 */
function Lightbox({ preview, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    if (!preview) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // Lock background scroll while open; move focus to the close button.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [preview, onClose])

  if (!preview) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${preview.label} thumbnail preview`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex', flexDirection: 'column',
        animation: 'lb-fade 150ms ease-out',
      }}
    >
      {/* Toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{preview.label}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {preview.downloadUrl && (
            <a
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none', fontSize: 12 }}
              href={preview.downloadUrl}
              download
            >
              <Download size={13} /> Download
            </a>
          )}
          <button
            ref={closeRef}
            className="btn btn-ghost btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#fff' }}
            onClick={onClose}
            aria-label="Close preview"
          >
            <X size={14} /> Close
          </button>
        </div>
      </div>

      {/* Image stage */}
      <div
        onClick={onClose}
        style={{
          flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px 24px',
        }}
      >
        <img
          src={preview.url}
          alt={`${preview.label} thumbnail`}
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
            borderRadius: 'var(--radius)', boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
          }}
        />
      </div>

      <style>{`
        @keyframes lb-fade { from { opacity: 0 } to { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
