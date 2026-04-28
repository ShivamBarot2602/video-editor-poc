import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { PROVIDERS } from '../providers'

const SIDEBAR_PREVIEW_MAX_HEIGHT = 'clamp(180px, 42vh, 420px)'

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function ProviderPanel({ providerId, onProviderChange, transcription, onUse, currentTime }) {
  const segments = transcription?.segments || null
  const rowRefs = useRef({})

  const activeIdx = segments
    ? segments.findIndex(seg => currentTime >= seg.start && currentTime < seg.end)
    : -1

  useEffect(() => {
    if (activeIdx >= 0 && rowRefs.current[activeIdx]) {
      rowRefs.current[activeIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
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
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {transcription && (
          <>
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
              Use →
            </button>
          </>
        )}
      </div>

      {/* Segments */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
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

export default function PlaygroundPage() {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const [videos, setVideos] = useState(null)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [checked, setChecked] = useState({})
  const [transcriptions, setTranscriptions] = useState({})
  const [running, setRunning] = useState({})
  const [leftProvider, setLeftProvider] = useState('assemblyai')
  const [rightProvider, setRightProvider] = useState('deepgram')
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    fetch('/api/videos')
      .then(r => r.json())
      .then(vids => {
        setVideos(vids)
        if (vids.length > 0) {
          const v = vids[0]
          setSelectedVideo(v)
          const initialChecked = {}
          PROVIDERS.forEach(p => { initialChecked[p.id] = v.providers.includes(p.id) })
          setChecked(initialChecked)
          v.providers.forEach(async (pid) => {
            try {
              const res = await fetch(`/api/transcription/${v.id}/${pid}`)
              if (res.ok) {
                const data = await res.json()
                setTranscriptions(prev => ({ ...prev, [pid]: data }))
              }
            } catch (_) {}
          })
        }
      })
      .catch(() => setVideos([]))
  }, [])

  useEffect(() => { setCurrentTime(0) }, [selectedVideo?.id])

  const toggleProvider = (id) => setChecked(prev => ({ ...prev, [id]: !prev[id] }))

  const runAll = async () => {
    if (!selectedVideo) return
    const toRun = PROVIDERS.filter(p => checked[p.id] && !transcriptions[p.id])
    for (const p of toRun) {
      setRunning(prev => ({ ...prev, [p.id]: true }))
      try {
        const res = await fetch(`/api/transcribe/${selectedVideo.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: p.id }),
        })
        if (res.ok) {
          const data = await res.json()
          setTranscriptions(prev => ({ ...prev, [p.id]: data }))
        }
      } catch (_) {}
      setRunning(prev => ({ ...prev, [p.id]: false }))
    }
  }

  const handleUse = (providerId) => {
    if (selectedVideo) navigate(`/editor/${selectedVideo.id}?provider=${providerId}`)
  }

  return (
    <Group orientation="horizontal" style={{ flex: 1, height: '100%' }}>

      {/* LEFT: sidebar */}
      <Panel defaultSize="22%" minSize="16%" maxSize="35%"
        style={{ background: 'var(--surface-dark)', borderRight: '1px solid var(--border-sub)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', padding: 14, gap: 12, height: '100%', overflow: 'hidden' }}>

          {/* Video player */}
          {selectedVideo ? (
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
          ) : (
            <div style={{
              position: 'relative',
              width: '100%',
              height: SIDEBAR_PREVIEW_MAX_HEIGHT,
              background: 'var(--surface)',
              borderRadius: 6,
              flexShrink: 0,
              border: '1px solid var(--border)',
            }}>
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 11 }}>
                {videos === null ? 'Loading…' : 'No video selected'}
              </span>
            </div>
          )}

          {/* Provider checklist */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Transcribe Providers
            </div>
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
                    {isRunning && <span style={{ color: 'var(--accent)', fontSize: 10 }}>⟳</span>}
                    {!isRunning && tx && (
                      <span style={{ color: 'var(--success)', fontSize: 10 }}>
                        ✓{tx.metadata?.confidence ? ` ${(tx.metadata.confidence * 100).toFixed(0)}%` : ''}
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
              disabled={!selectedVideo || Object.keys(running).some(k => running[k])}
              style={{ fontSize: 12, padding: '7px' }}
            >
              ▶ Run All
            </button>
            <button
              className="btn btn-outline btn-full btn-sm"
              onClick={() => navigate('/')}
              style={{ color: 'var(--text-dim)', fontSize: 11 }}
            >
              ↑ Upload new video
            </button>
          </div>
        </div>
      </Panel>

      <Separator className="panel-resize-handle" />

      {/* RIGHT: comparison panels */}
      <Panel style={{ overflow: 'hidden' }}>
        <Group orientation="horizontal" style={{ height: '100%', padding: 14, gap: 0 }}>
          <Panel defaultSize="50%" minSize="25%" style={{ overflow: 'hidden', display: 'flex' }}>
            <ProviderPanel
              providerId={leftProvider}
              onProviderChange={setLeftProvider}
              transcription={transcriptions[leftProvider] || null}
              onUse={handleUse}
              currentTime={currentTime}
            />
          </Panel>
          <Separator className="panel-resize-handle" style={{ margin: '0 5px' }} />
          <Panel defaultSize="50%" minSize="25%" style={{ overflow: 'hidden', display: 'flex' }}>
            <ProviderPanel
              providerId={rightProvider}
              onProviderChange={setRightProvider}
              transcription={transcriptions[rightProvider] || null}
              onUse={handleUse}
              currentTime={currentTime}
            />
          </Panel>
        </Group>
      </Panel>

    </Group>
  )
}
