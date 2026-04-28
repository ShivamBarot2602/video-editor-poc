import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const ALL_PROVIDERS = [
  { id: 'assemblyai',   label: 'AssemblyAI' },
  { id: 'deepgram',     label: 'Deepgram' },
  { id: 'gladia',       label: 'Gladia' },
  { id: 'mistral',      label: 'Mistral' },
  { id: 'groq',         label: 'Groq' },
  { id: 'openai',       label: 'OpenAI' },
  { id: 'revai',        label: 'Rev AI' },
  { id: 'speechmatics', label: 'Speechmatics' },
  { id: 'pyannote',     label: 'pyannoteAI' },
]

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function ProviderPanel({ providerId, onProviderChange, transcription, otherTranscription, onUse }) {
  const prov = ALL_PROVIDERS.find(p => p.id === providerId)
  const segments = transcription?.segments || null
  const otherSegments = otherTranscription?.segments || null

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
          {ALL_PROVIDERS.map(p => (
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
          const other = otherSegments?.[i]
          const differs = other && other.text !== seg.text
          return (
            <div key={i} style={{
              display: 'flex', gap: 8, padding: '6px 10px',
              borderLeft: `3px solid ${differs ? 'var(--diff)' : 'transparent'}`,
              background: differs ? 'var(--diff-bg)' : 'transparent',
              borderBottom: '1px solid var(--border-sub)',
            }}>
              <span style={{ color: 'var(--text-faint)', fontSize: 10, minWidth: 28, paddingTop: 1, flexShrink: 0 }}>
                {fmtTime(seg.start)}
              </span>
              <span style={{ color: differs ? 'var(--diff-text)' : 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
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
  const [videos, setVideos] = useState(null)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [checked, setChecked] = useState({})
  const [transcriptions, setTranscriptions] = useState({})
  const [running, setRunning] = useState({})
  const [leftProvider, setLeftProvider] = useState('assemblyai')
  const [rightProvider, setRightProvider] = useState('deepgram')

  useEffect(() => {
    fetch('/api/videos')
      .then(r => r.json())
      .then(vids => {
        setVideos(vids)
        if (vids.length > 0) {
          const v = vids[0]
          setSelectedVideo(v)
          // Pre-check providers that already have transcriptions
          const initialChecked = {}
          ALL_PROVIDERS.forEach(p => { initialChecked[p.id] = v.providers.includes(p.id) })
          setChecked(initialChecked)
          // Load existing transcriptions
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

  const toggleProvider = (id) => setChecked(prev => ({ ...prev, [id]: !prev[id] }))

  const runAll = async () => {
    if (!selectedVideo) return
    const toRun = ALL_PROVIDERS.filter(p => checked[p.id] && !transcriptions[p.id])
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
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>

      {/* LEFT: video + controls */}
      <div style={{
        width: 260, flexShrink: 0,
        background: 'var(--surface-dark)', borderRight: '1px solid var(--border-sub)',
        display: 'flex', flexDirection: 'column', padding: 14, gap: 12, overflow: 'hidden',
      }}>
        {/* Video thumbnail */}
        {selectedVideo ? (
          <div style={{
            width: '100%', aspectRatio: '16/9', background: '#000',
            borderRadius: 6, overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img
              src={`/api/video/${selectedVideo.id}/thumbnail`}
              alt={selectedVideo.filename}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.parentElement.innerHTML = `<span style="color:#333;font-size:11px">▶ ${selectedVideo.filename}</span>`
              }}
            />
          </div>
        ) : (
          <div style={{
            width: '100%', aspectRatio: '16/9', background: 'var(--surface)',
            borderRadius: 6, flexShrink: 0, border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
              {videos === null ? 'Loading…' : 'No video selected'}
            </span>
          </div>
        )}

        {/* Provider checklist */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Transcribe Providers
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ALL_PROVIDERS.map(p => {
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

      {/* RIGHT: two comparison panels */}
      <div style={{ flex: 1, display: 'flex', gap: 10, padding: 14, overflow: 'hidden', minWidth: 0 }}>
        <ProviderPanel
          providerId={leftProvider}
          onProviderChange={setLeftProvider}
          transcription={transcriptions[leftProvider] || null}
          otherTranscription={transcriptions[rightProvider] || null}
          onUse={handleUse}
        />
        <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
        <ProviderPanel
          providerId={rightProvider}
          onProviderChange={setRightProvider}
          transcription={transcriptions[rightProvider] || null}
          otherTranscription={transcriptions[leftProvider] || null}
          onUse={handleUse}
        />
      </div>
    </div>
  )
}
