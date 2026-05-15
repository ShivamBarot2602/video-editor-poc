import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { LayoutGrid, Play, ArrowUp, Check, Loader2, ChevronRight, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { PROVIDERS } from '../providers'
import UploadZone from '../components/UploadZone'
import SpeakerBadge from '../components/SpeakerBadge'

const SIDEBAR_PREVIEW_MAX_HEIGHT = 'clamp(180px, 42vh, 420px)'

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function scrollRowIntoView(containerEl, rowEl, padding = 12) {
  if (!containerEl || !rowEl) return
  const containerRect = containerEl.getBoundingClientRect()
  const rowRect = rowEl.getBoundingClientRect()
  const topLimit = containerRect.top + padding
  const bottomLimit = containerRect.bottom - padding
  if (rowRect.top < topLimit) {
    containerEl.scrollTop = Math.max(0, containerEl.scrollTop - (topLimit - rowRect.top))
  } else if (rowRect.bottom > bottomLimit) {
    containerEl.scrollTop = Math.max(0, containerEl.scrollTop + (rowRect.bottom - bottomLimit))
  }
}

function fmtDate(iso) {
  const d = new Date(iso), now = new Date()
  const mins = Math.floor((now - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

function ProviderPanel({ providerId, onProviderChange, transcription, onUse, currentTime, disabledProviderId }) {
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>Not yet transcribed</span>
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

/* ─── Empty State — Path A: direct nav to /playground ─── */
function PlaygroundEmptyState({ allVideos, onUpload, onSelectRecent }) {
  const [thumbErrors, setThumbErrors] = useState({})

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden', borderRadius: 'var(--radius)', margin: '0 8px 8px' }}>

      {/* Left: Upload + Recent Sessions */}
      <div style={{
        width: 300, flexShrink: 0,
        background: 'var(--surface-dark)',
        borderRight: '1px solid var(--border-sub)',
        display: 'flex', flexDirection: 'column',
        padding: 20, gap: 14, overflow: 'hidden',
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
          Upload Video
        </div>

        <div style={{ flexShrink: 0 }}>
          <UploadZone onUpload={onUpload} compact />
        </div>

        {/* Recent sessions mini-list */}
        <div style={{
          flex: 1, minHeight: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', gap: 10,
          borderTop: '1px solid var(--border-sub)', paddingTop: 14,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
            Or pick a recent session
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {allVideos === null ? (
              <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>Loading…</span>
            ) : allVideos.length === 0 ? (
              <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>No sessions yet.</span>
            ) : allVideos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => onSelectRecent(v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 0',
                  borderBottom: i < allVideos.length - 1 ? '1px solid var(--border-sub)' : 'none',
                  cursor: 'pointer', textAlign: 'left',
                  background: 'transparent', border: 'none', width: '100%',
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.65'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {/* Mini thumbnail */}
                <div style={{ width: 46, height: 28, flexShrink: 0, background: '#0a0a0a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                  {!thumbErrors[v.id] ? (
                    <img
                      src={v.thumbnail}
                      alt={v.filename}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={() => setThumbErrors(p => ({ ...p, [v.id]: true }))}
                    />
                  ) : (
                    <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}><Play size={10} /></span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v.filename}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
                    {fmtSize(v.size)} · {fmtDate(v.uploadedAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Empty comparison placeholders */}
      <div style={{ flex: 1, display: 'flex', gap: 12, padding: 16, overflow: 'hidden' }}>
        {['Provider A', 'Provider B'].map((label, i) => (
          <div key={i} style={{
            flex: 1,
            border: '1.5px dashed var(--border)',
            borderRadius: 8,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 10,
            background: 'var(--surface)',
          }}>
            <div style={{
              width: 36, height: 36,
              border: '1.5px dashed var(--border)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LayoutGrid size={18} style={{ color: 'var(--text-dim)' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6, padding: '0 24px' }}>
              Upload a video to<br />start comparing
            </div>
          </div>
        ))}
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
  const [allVideos, setAllVideos] = useState(null)      // all videos — for empty-state list
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [checked, setChecked] = useState({})
  const [transcriptions, setTranscriptions] = useState({})
  const [running, setRunning] = useState({})
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
    const initialChecked = {}
    PROVIDERS.forEach(p => { initialChecked[p.id] = video.providers.includes(p.id) })
    setChecked(initialChecked)
    setTranscriptions({})
    video.providers.forEach(async (pid) => {
      try {
        const res = await fetch(`/api/transcription/${video.id}/${pid}`)
        if (res.ok) {
          const data = await res.json()
          setTranscriptions(prev => ({ ...prev, [pid]: data }))
        }
      } catch (_) {}
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
    fetch('/api/videos')
      .then(r => r.json())
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

  /* Path A: upload inside the playground empty state */
  const handleUpload = async (id, meta) => {
    toast.success(`Uploaded: ${meta.name}`)
    const vids = await fetch('/api/videos').then(r => r.json())
    setAllVideos(vids)
    const v = vids.find(v => v.id === id)
    if (v) {
      selectVideo(v)
      setSearchParams({ video: id }, { replace: true })
    }
  }

  /* Path A: pick from recent sessions in empty state */
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

    // ── Step 1: Prepare (extract audio exactly once) ──────────────────────
    // All providers share the same audio.wav — do it upfront before firing
    // parallel requests so there is no race condition on the file write.
    try {
      const prepRes = await fetch(`/api/prepare/${selectedVideo.id}`, { method: 'POST' })
      if (!prepRes.ok) throw new Error('Audio preparation failed')
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
    // Each provider gets skipExtract: true so the server reuses the prepared
    // audio.wav instead of re-running ffmpeg N times.
    const transcribeOne = async (p) => {
      try {
        const res = await fetch(`/api/transcribe/${selectedVideo.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: p.id, skipExtract: true }),
        })
        if (res.ok) {
          const data = await res.json()
          // Update this provider's result as soon as it resolves — don't wait for others
          setTranscriptions(prev => ({ ...prev, [p.id]: data }))
        }
      } catch (_) {}
      // Clear spinner for this provider independently
      setRunning(prev => ({ ...prev, [p.id]: false }))
    }

    await Promise.allSettled(toRun.map(p => transcribeOne(p)))
  }

  const handleUse = (providerId) => {
    if (selectedVideo) navigate(`/editor/${selectedVideo.id}?provider=${providerId}`)
  }

  /* ── Path A: No video selected → show empty / upload state ── */
  if (!selectedVideo) {
    return (
      <PlaygroundEmptyState
        allVideos={allVideos}
        onUpload={handleUpload}
        onSelectRecent={handleSelectRecent}
      />
    )
  }

  /* ── Paths A (after upload), B, C: Full comparison view ── */
  return (
    <Group
      orientation="horizontal"
      defaultLayout={outerDefaultLayout}
      onLayoutChanged={onOuterLayoutChanged}
      style={{ flex: 1, height: '100%', borderRadius: 'var(--radius)', overflow: 'hidden', margin: '0 8px 8px' }}
    >

      {/* LEFT: sidebar */}
      <Panel id="sidebar" defaultSize="22%" minSize="16%" maxSize="35%"
        style={{ background: 'var(--surface-dark)', borderRight: '1px solid var(--border-sub)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', padding: 14, gap: 12, height: '100%', overflow: 'hidden' }}>

          {/* Video player */}
          <div style={{
            width: '100%',
            borderRadius: 6,
            overflow: 'hidden',
            flexShrink: 0,
            background: '#000',
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
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Transcribe Providers
            </div>
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
                    {!isRunning && !tx && checked[p.id] && (
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
              <Play size={12} fill="currentColor" /> Run Selected
            </button>
            <button
              className="btn btn-outline btn-full btn-sm"
              onClick={() => {
                setSelectedVideo(null)
                setTranscriptions({})
                setSearchParams({}, { replace: true })
              }}
              style={{ color: 'var(--text-dim)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <ArrowUp size={11} /> Upload / Change
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
            />
          </Panel>
        </Group>
      </Panel>

    </Group>
  )
}
