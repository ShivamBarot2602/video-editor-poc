import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'
import {
  Sparkles, Wand2, Image as ImageIcon, Check, AlertTriangle,
  ArrowLeft, Loader2, RefreshCw, Play,
} from 'lucide-react'
import VideoPlayer from '../components/VideoPlayer'

const PHASES = [
  { id: 'extracting', label: 'Extracting frames' },
  { id: 'scoring',    label: 'Scoring frames' },
  { id: 'dedup',      label: 'Deduplicating' },
  { id: 'reranking',  label: 'Vision rerank' },
  { id: 'polishing',  label: 'Image-gen polish' },
  { id: 'done',       label: 'Done' },
]

const PROVIDER_META = {
  original: { label: 'Original',       icon: ImageIcon, color: 'var(--text-muted)' },
  gemini:   { label: 'Gemini polish',  icon: Sparkles,  color: '#8a7df0' },
  openai:   { label: 'OpenAI polish',  icon: Wand2,     color: '#10a37f' },
}

// Selectable rerankers. Gemini is the default; if the chosen one fails at run
// time the server falls back to the other available provider.
const RERANKERS = [
  { id: 'gemini', label: 'Gemini', model: 'gemini-2.5-pro' },
  { id: 'openai', label: 'OpenAI', model: 'gpt-4.1-mini' },
]

function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return '–'
  const m = Math.floor(seconds / 60)
  const s = (seconds - m * 60).toFixed(1)
  return `${m}:${s.padStart(4, '0')}`
}

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

export default function ThumbnailsPage() {
  const { videoId } = useParams()
  const videoRef = useRef(null)
  const [state, setState]       = useState(null)         // server-side thumbnails.json
  const [stateLoading, setStateLoading] = useState(true)
  const [running, setRunning]   = useState(false)
  const [phase, setPhase]       = useState(null)
  const [phaseMeta, setPhaseMeta] = useState({})         // counts, warnings
  const [warnings, setWarnings] = useState([])
  const [error, setError]       = useState(null)
  const [reranker, setReranker] = useState(() => localStorage.getItem('thumb_reranker') || 'gemini')
  const [runCandidates, setRunCandidates] = useState(null)  // progressive picks during a live run
  const [runMeta, setRunMeta] = useState(null)              // rerank model + video, from the `picks` event

  useEffect(() => { localStorage.setItem('thumb_reranker', reranker) }, [reranker])

  // ─── load cached state on mount ──────────────────────────────────────────
  useEffect(() => {
    let cancel = false
    setStateLoading(true)
    fetch(`/api/thumbnails/${videoId}`)
      .then(r => r.ok ? r.json() : null)
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

    const es = new EventSource(`/api/thumbnails/${videoId}/stream?reranker=${encodeURIComponent(reranker)}`)
    evtSourceRef.current = es

    es.onmessage = (msg) => {
      let event
      try { event = JSON.parse(msg.data) } catch { return }

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
      } else if (event.type === 'error') {
        setError(event.message)
        es.close()
        evtSourceRef.current = null
        setRunning(false)
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects on transient errors, but once the server
      // closes the stream after sending `done`, we get an error event. If we
      // already have `done`/`error` state, this is benign and `running` is
      // already false. Otherwise surface a generic message.
      if (es.readyState === EventSource.CLOSED) return
      setError('SSE connection lost')
      try { es.close() } catch (_) {}
      evtSourceRef.current = null
      setRunning(false)
    }
  }

  // Cleanup on unmount.
  useEffect(() => () => {
    if (evtSourceRef.current) {
      try { evtSourceRef.current.close() } catch (_) {}
      evtSourceRef.current = null
    }
  }, [])

  // ─── select / unselect a thumbnail ───────────────────────────────────────
  async function handleChoose(key) {
    const next = state?.selectedKey === key ? null : key
    try {
      const res = await fetch(`/api/thumbnails/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedKey: next }),
      })
      if (res.ok) setState(await res.json())
    } catch (_) { /* ignore */ }
  }

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
              selectedKey={state?.selectedKey || null}
              running={running}
              phase={phase}
              live={liveRun}
              stateLoading={stateLoading}
              onChoose={handleChoose}
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
      <code style={{ fontSize: 10, color: 'var(--text-faint)', padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
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
          background: '#000', borderRadius: 'var(--radius)',
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
            background: 'rgba(255,255,255,0.05)',
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
function RightPane({ candidates, selectedKey, running, phase, live, stateLoading, onChoose, onSeek, meta, videoAspectRatio }) {
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
            selectedKey={selectedKey}
            onChoose={onChoose}
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
function PickRow({ rank, candidate, selectedKey, onChoose, onSeek, videoAspectRatio }) {
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
            chosen={selectedKey === cell.key}
            onChoose={() => onChoose(cell.key)}
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

function ThumbCell({ cell, chosen, onChoose, timestamp, aspectRatio = '16 / 9' }) {
  const meta = PROVIDER_META[cell.providerId] || PROVIDER_META.original
  const Icon = meta.icon
  const failed = cell.status === 'error'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${chosen ? 'var(--accent)' : 'var(--border)'}`,
        outline: chosen ? '1px solid var(--accent)' : 'none',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        transition: 'border-color 150ms, outline-color 150ms',
      }}
    >
      <div style={{
        position: 'relative', width: '100%', aspectRatio,
        background: failed ? 'rgba(220,38,38,0.05)' : '#0a0a0a',
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

        {/* Chosen badge */}
        {chosen && (
          <span style={{
            position: 'absolute', bottom: 8, right: 8,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 999,
            background: 'var(--accent)', color: '#fff',
            fontSize: 10, fontWeight: 700,
            boxShadow: '0 2px 8px rgba(15,103,234,0.5)',
          }}>
            <Check size={10} strokeWidth={3} /> CHOSEN
          </span>
        )}
      </div>

      <div style={{ padding: 8, display: 'flex', gap: 6 }}>
        <button
          className={chosen ? 'btn btn-secondary btn-sm' : 'btn btn-outline btn-sm'}
          style={{ flex: 1, fontSize: 11, padding: '5px 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          onClick={onChoose}
          disabled={failed}
          aria-pressed={chosen}
        >
          {chosen ? <><Check size={11} /> Chosen</> : 'Choose'}
        </button>
      </div>
    </div>
  )
}
