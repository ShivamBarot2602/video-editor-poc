import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { Play, ArrowLeftRight, Check, Loader2, ChevronRight, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { PROVIDERS } from '../config/providers'
import LabBar from '../shell/LabBar'
import SpeakerBadge from '../components/SpeakerBadge'
import { fmtClock as fmtTime, fmtSize } from '../lib/format'
import { scrollRowIntoView } from '../lib/dom'
import { listVideos } from '../api/videos'
import { getTranscriptionOrNull, transcribe, prepare } from '../api/transcription'

const SIDEBAR_PREVIEW_MAX_HEIGHT = 'clamp(180px, 42vh, 420px)'

function ProviderPanel({ providerId, onProviderChange, transcription, onUse, currentTime, disabledProviderId, error, isRunning, isLoading }) {
  const segments = transcription?.segments || null
  const rowRefs = useRef({})
  const listRef = useRef(null)
  const prov = PROVIDERS.find(p => p.id === providerId)

  const activeIdx = segments
    ? segments.findIndex(seg => currentTime >= seg.start && currentTime < seg.end)
    : -1

  useEffect(() => {
    if (activeIdx < 0) return
    scrollRowIntoView(listRef.current, rowRefs.current[activeIdx])
  }, [activeIdx])

  return (
    <div style={{
      flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
    }}>
      {/* Panel header */}
      <div style={{
        padding: '8px 10px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--surface-dark)', flexShrink: 0,
      }}>
        <select
          value={providerId}
          onChange={e => onProviderChange(e.target.value)}
          style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
        >
          {PROVIDERS.map(p => (
            <option key={p.id} value={p.id} disabled={p.id === disabledProviderId}>
              {p.label}{p.id === disabledProviderId ? ' (selected in other panel)' : ''}
            </option>
          ))}
        </select>
        {transcription && (
          <>
            {transcription.metadata?.word_timestamps && (
              <Zap size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} fill="currentColor" />
            )}
            {transcription.metadata?.confidence && (
              <span style={{ color: 'var(--success)', fontSize: 10, whiteSpace: 'nowrap' }}>
                {(transcription.metadata.confidence * 100).toFixed(0)}%
              </span>
            )}
            <button
              className="btn btn-sm"
              onClick={() => onUse(providerId)}
              style={{ color: 'var(--accent)', borderColor: 'var(--accent)', background: 'transparent', fontSize: 10 }}
            >
              Use <ChevronRight size={10} />
            </button>
          </>
        )}
      </div>

      {/* Segments */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto' }}>
        {!segments ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, padding: '0 16px' }}>
            {isRunning || isLoading ? (
              <>
                <Loader2 size={16} style={{ color: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  {isRunning ? `Transcribing with ${prov?.label || providerId}…` : `Loading ${prov?.label || providerId} transcription…`}
                </span>
              </>
            ) : error ? (
              <>
                <span style={{ color: 'var(--error, #f87171)', fontSize: 13 }}>✕</span>
                <span style={{ color: 'var(--error, #f87171)', fontSize: 11, textAlign: 'center', lineHeight: 1.5, wordBreak: 'break-word' }}>{error}</span>
              </>
            ) : (
              <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>Not yet transcribed</span>
            )}
          </div>
        ) : segments.map((seg, i) => {
          const isActive = i === activeIdx
          return (
            <div
              key={i}
              ref={el => { rowRefs.current[i] = el }}
              style={{
                display: 'flex', gap: 8, padding: '6px 10px',
                borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                borderBottom: '1px solid var(--border-sub)',
                transition: 'background 150ms',
              }}
            >
              <span style={{ color: 'var(--text-faint)', fontSize: 10, minWidth: 28, paddingTop: 1, flexShrink: 0 }}>
                {fmtTime(seg.start)}
              </span>
              {seg.speaker && prov?.diarization !== false && (
                <SpeakerBadge speaker={seg.speaker} />
              )}
              <span style={{
                fontSize: 11, lineHeight: 1.5,
                color: isActive ? 'var(--text-bright)' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 400,
              }}>
                {seg.text}
              </span>
            </div>
          )
        })}
      </div>

      {/* Confidence bar */}
      {transcription?.metadata?.confidence && (
        <div style={{ padding: '5px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2 }}>
            <div style={{ width: `${transcription.metadata.confidence * 100}%`, height: '100%', background: 'var(--success)', borderRadius: 2 }} />
          </div>
          <span style={{ color: 'var(--success)', fontSize: 10 }}>
            {(transcription.metadata.confidence * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  )
}

/* ─── No video chosen: pick one from the Library ─── */
function VideoPicker({ allVideos, onSelect }) {
  const [thumbErrors, setThumbErrors] = useState({})
  return (
    <div className="lib">
      <div className="lib-inner">
        <header className="lib-head">
          <h1 className="lib-title" style={{ fontSize: 20 }}>Pick a video</h1>
        </header>
        <p className="sc-intro">
          Pick a video to run several speech-to-text providers on it and read their transcripts side by side.
          To add a video, upload it in the <Link to="/">Library</Link>.
        </p>
        {allVideos === null ? (
          <div className="lib-grid" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="vcard"><div className="vcard-thumb shimmer" /></div>
            ))}
          </div>
        ) : allVideos.length === 0 ? (
          <div className="lib-empty">
            <strong>No videos yet</strong>
            <span>Upload a video in the Library first.</span>
            <Link to="/" className="btn btn-primary">Go to Library</Link>
          </div>
        ) : (
          <div className="lib-grid">
            {allVideos.map(v => (
              <button key={v.id} type="button" className="vcard vcard-btn" onClick={() => onSelect(v)}>
                <div className="vcard-thumb">
                  {!thumbErrors[v.id]
                    ? <img src={v.thumbnail} alt="" loading="lazy" onError={() => setThumbErrors(p => ({ ...p, [v.id]: true }))} />
                    : <Play size={20} aria-hidden="true" />}
                </div>
                <div className="vcard-text">
                  <span className="vcard-title" title={v.filename}>{v.filename}</span>
                  <span className="vcard-meta">
                    {v.providers?.length ? `${v.providers.length} transcript${v.providers.length > 1 ? 's' : ''}` : 'No transcripts yet'} · {fmtSize(v.size)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Main Playground Page ─── */
export default function PlaygroundPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const videoParam = searchParams.get('video')

  const { defaultLayout: outerDefaultLayout, onLayoutChanged: onOuterLayoutChanged } = useDefaultLayout({
    id: 'sp-video-editor:playground-layout:v1',
    storage: localStorage,
  })

  const { defaultLayout: innerDefaultLayout, onLayoutChanged: onInnerLayoutChanged } = useDefaultLayout({
    id: 'sp-video-editor:playground-compare-layout:v1',
    storage: localStorage,
  })

  const videoRef = useRef(null)
  const selectAllRef = useRef(null)
  // Tracks the videoId whose transcriptions have been kicked off. React 18
  // StrictMode double-mounts effects in dev, which would otherwise fire the
  // S3 fetch for every provider twice on load. This ref dedupes.
  const loadedForVideoIdRef = useRef(null)
  const [allVideos, setAllVideos] = useState(null)      // all videos — for empty-state list
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [checked, setChecked] = useState({})
  const [transcriptions, setTranscriptions] = useState({})
  const [running, setRunning] = useState({})
  const [errors, setErrors] = useState({})
  // Providers whose cached transcription is being fetched from S3 (e.g. on
  // initial video load). Distinct from `running`, which tracks a fresh
  // transcription pass. UI shows the same spinner for both.
  const [loadingProviders, setLoadingProviders] = useState({})
  const [leftProvider, setLeftProvider] = useState('assemblyai')
  const [rightProvider, setRightProvider] = useState('deepgram')
  const [currentTime, setCurrentTime] = useState(0)

  const handleLeftProviderChange = (nextId) => {
    if (nextId === rightProvider) setRightProvider(leftProvider)
    setLeftProvider(nextId)
  }

  const handleRightProviderChange = (nextId) => {
    if (nextId === leftProvider) setLeftProvider(rightProvider)
    setRightProvider(nextId)
  }

  const allSelected = PROVIDERS.every(p => checked[p.id])
  const anySelected = PROVIDERS.some(p => checked[p.id])

  /* Load transcriptions for a video */
  const loadTranscriptions = (video) => {
    // Dedupe re-entry for the same videoId. React 18 StrictMode double-mounts
    // the initial useEffect in dev, which without this guard fires the S3
    // fetch twice for every provider.
    if (loadedForVideoIdRef.current === video.id) return
    loadedForVideoIdRef.current = video.id

    const initialChecked = {}
    PROVIDERS.forEach(p => { initialChecked[p.id] = video.providers.includes(p.id) })
    setChecked(initialChecked)
    setTranscriptions({})
    // Flag every provider whose transcription is being fetched so the
    // ProviderPanel shows a loader instead of "Not yet transcribed" while the
    // S3 fetch is in flight.
    const initialLoading = {}
    video.providers.forEach(pid => { initialLoading[pid] = true })
    setLoadingProviders(initialLoading)
    video.providers.forEach(async (pid) => {
      try {
        const data = await getTranscriptionOrNull(video.id, pid)
        if (data) {
          setTranscriptions(prev => ({ ...prev, [pid]: data }))
        }
      } catch (_) {}
      finally {
        setLoadingProviders(prev => { const next = { ...prev }; delete next[pid]; return next })
      }
    })
  }

  /* Select a video and load its transcriptions */
  const selectVideo = (v) => {
    setSelectedVideo(v)
    setCurrentTime(0)
    loadTranscriptions(v)
  }

  /* Initial fetch — respect ?video= param */
  useEffect(() => {
    listVideos()
      .then(vids => {
        setAllVideos(vids)
        if (videoParam) {
          // Path B or C: specific video requested via URL
          const v = vids.find(v => v.id === videoParam)
          if (v) {
            selectVideo(v)
          } else {
            toast.error('Video not found')
            setSearchParams({}, { replace: true })
          }
        }
        // Path A: no param → stay in empty state (selectedVideo = null)
      })
      .catch(() => setAllVideos([]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setCurrentTime(0) }, [selectedVideo?.id])

  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = anySelected && !allSelected
  }, [anySelected, allSelected])

  // Safety net: if state ever ends up equal, keep them distinct.
  useEffect(() => {
    if (leftProvider === rightProvider) {
      const alt = PROVIDERS.find(p => p.id !== leftProvider)
      if (alt) setRightProvider(alt.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftProvider, rightProvider])

  /* Pick a video from the picker */
  const handleSelectRecent = (v) => {
    selectVideo(v)
    setSearchParams({ video: v.id }, { replace: true })
  }

  const toggleProvider = (id) => setChecked(prev => ({ ...prev, [id]: !prev[id] }))
  const toggleAllProviders = () => {
    const nextValue = !allSelected
    setChecked(prev => {
      const next = { ...prev }
      PROVIDERS.forEach(p => { next[p.id] = nextValue })
      return next
    })
  }

  const runAll = async () => {
    if (!selectedVideo) return
    const toRun = PROVIDERS.filter(p => checked[p.id])
    if (toRun.length === 0) return

    // Mark every provider as running immediately so the UI reflects all spinners at once
    setRunning(prev => {
      const next = { ...prev }
      toRun.forEach(p => { next[p.id] = true })
      return next
    })

    // Clear any previous errors for providers we're about to re-run
    setErrors(prev => {
      const next = { ...prev }
      toRun.forEach(p => { delete next[p.id] })
      return next
    })

    // ── Step 1: Prepare (extract audio exactly once) ──────────────────────
    // All providers share the same audio.wav — do it upfront before firing
    // parallel requests so there is no race condition on the file write.
    try {
      await prepare(selectedVideo.id)
    } catch (err) {
      toast.error(`Preparation failed: ${err.message}`)
      setRunning(prev => {
        const next = { ...prev }
        toRun.forEach(p => { next[p.id] = false })
        return next
      })
      return
    }

    // ── Step 2: Fire all providers in parallel ────────────────────────────
    // The server reuses audio.wav automatically once it exists in S3 (the
    // prepare() call above created it) — no per-request flag needed.
    const transcribeOne = async (p) => {
      try {
        const res = await transcribe(selectedVideo.id, { provider: p.id })
        if (res.ok) {
          const data = await res.json()
          // Update this provider's result as soon as it resolves — don't wait for others
          setTranscriptions(prev => ({ ...prev, [p.id]: data }))
        } else {
          const data = await res.json().catch(() => ({}))
          const msg = data?.error || `HTTP ${res.status}`
          setErrors(prev => ({ ...prev, [p.id]: msg }))
          toast.error(`${p.label}: ${msg}`)
        }
      } catch (err) {
        const msg = err.message || 'Network error'
        setErrors(prev => ({ ...prev, [p.id]: msg }))
        toast.error(`${p.label}: ${msg}`)
      }
      // Clear spinner for this provider independently
      setRunning(prev => ({ ...prev, [p.id]: false }))
    }

    await Promise.allSettled(toRun.map(p => transcribeOne(p)))
  }

  const handleUse = (providerId) => {
    if (selectedVideo) navigate(`/v/${selectedVideo.id}/captions?provider=${providerId}`)
  }

  /* ── Path A: No video selected → show empty / upload state ── */
  if (!selectedVideo) {
    return (
      <div className="lab-page">
        <LabBar />
        <VideoPicker allVideos={allVideos} onSelect={handleSelectRecent} />
      </div>
    )
  }

  const changeVideo = () => {
    setSelectedVideo(null)
    setTranscriptions({})
    setLoadingProviders({})
    loadedForVideoIdRef.current = null
    setSearchParams({}, { replace: true })
  }

  /* ── Paths A (after upload), B, C: Full comparison view ── */
  return (
    <div className="lab-page">
    <LabBar>
      <span className="lab-video" title={selectedVideo.filename}>{selectedVideo.filename}</span>
      <button type="button" className="btn btn-quiet btn-sm" onClick={changeVideo}>
        <ArrowLeftRight size={13} /> Change video
      </button>
    </LabBar>
    <Group
      orientation="horizontal"
      defaultLayout={outerDefaultLayout}
      onLayoutChanged={onOuterLayoutChanged}
      style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderTop: '1px solid var(--border)' }}
    >

      {/* LEFT: sidebar */}
      <Panel id="sidebar" defaultSize="22%" minSize="16%" maxSize="35%"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border-sub)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', padding: 14, gap: 12, height: '100%', overflow: 'hidden' }}>

          {/* Video player */}
          <div style={{
            width: '100%',
            borderRadius: 6,
            overflow: 'hidden',
            flexShrink: 0,
            background: 'var(--video-bg)',
            maxHeight: SIDEBAR_PREVIEW_MAX_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <video
              ref={videoRef}
              key={selectedVideo.id}
              src={`/api/video/${selectedVideo.id}`}
              controls
              style={{
                width: '100%',
                maxHeight: SIDEBAR_PREVIEW_MAX_HEIGHT,
                objectFit: 'contain',
                display: 'block',
              }}
              onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
            />
          </div>

          {/* Video name */}
          <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
            {selectedVideo.filename}
          </div>

          {/* Provider checklist */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="section-label">Providers to run</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }}>
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={toggleAllProviders}
                style={{ accentColor: 'var(--accent)', width: 11, height: 11, flexShrink: 0 }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 11, flex: 1 }}>Select all</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PROVIDERS.map(p => {
                const tx = transcriptions[p.id]
                const isRunning = running[p.id]
                return (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!checked[p.id]}
                      onChange={() => toggleProvider(p.id)}
                      style={{ accentColor: 'var(--accent)', width: 11, height: 11, flexShrink: 0 }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flex: 1 }}>{p.label}</span>
                    {isRunning && <Loader2 size={10} style={{ color: 'var(--accent)', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
                    {!isRunning && tx && (
                      <span style={{ color: 'var(--success)', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <Check size={9} strokeWidth={3} />{tx.metadata?.confidence ? ` ${(tx.metadata.confidence * 100).toFixed(0)}%` : ''}
                      </span>
                    )}
                    {!isRunning && !tx && errors[p.id] && (
                      <span style={{ color: 'var(--error, #f87171)', fontSize: 10 }}>✕</span>
                    )}
                    {!isRunning && !tx && !errors[p.id] && checked[p.id] && (
                      <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>—</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button
              className="btn btn-primary btn-full"
              onClick={runAll}
              disabled={!anySelected || Object.keys(running).some(k => running[k])}
              style={{ fontSize: 12, padding: '7px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Play size={12} fill="currentColor" /> Run selected
            </button>

          </div>
        </div>
      </Panel>

      <Separator className="panel-resize-handle" />

      {/* RIGHT: comparison panels */}
      <Panel id="content" defaultSize="78%" minSize="65%" style={{ overflow: 'hidden' }}>
        <Group
          orientation="horizontal"
          defaultLayout={innerDefaultLayout}
          onLayoutChanged={onInnerLayoutChanged}
          style={{ height: '100%', padding: 14, gap: 0 }}
        >
          <Panel id="left" defaultSize="50%" minSize="25%" style={{ overflow: 'hidden', display: 'flex' }}>
            <ProviderPanel
              providerId={leftProvider}
              onProviderChange={handleLeftProviderChange}
              transcription={transcriptions[leftProvider] || null}
              onUse={handleUse}
              currentTime={currentTime}
              disabledProviderId={rightProvider}
              error={errors[leftProvider] || null}
              isRunning={!!running[leftProvider]}
              isLoading={!!loadingProviders[leftProvider]}
            />
          </Panel>
          <Separator className="panel-resize-handle" style={{ margin: '0 5px' }} />
          <Panel id="right" defaultSize="50%" minSize="25%" style={{ overflow: 'hidden', display: 'flex' }}>
            <ProviderPanel
              providerId={rightProvider}
              onProviderChange={handleRightProviderChange}
              transcription={transcriptions[rightProvider] || null}
              onUse={handleUse}
              currentTime={currentTime}
              disabledProviderId={leftProvider}
              error={errors[rightProvider] || null}
              isRunning={!!running[rightProvider]}
              isLoading={!!loadingProviders[rightProvider]}
            />
          </Panel>
        </Group>
      </Panel>

    </Group>
    </div>
  )
}
