import { useState } from 'react'

const PROVIDERS = [
  { id: 'assemblyai',   label: 'AssemblyAI',   note: 'Best diarization · code-mixing' },
  { id: 'deepgram',     label: 'Deepgram',     note: 'Nova-3 · fast' },
  { id: 'gladia',       label: 'Gladia',       note: 'Solaria-1 · diarization · code-switching' },
  { id: 'openai',       label: 'OpenAI',       note: 'gpt-4o-transcribe · diarize' },
  { id: 'groq',         label: 'Groq',         note: 'Whisper Turbo · 100 MB cap' },
  { id: 'mistral',      label: 'Mistral',      note: 'Voxtral · $0.003/min · 3 hr cap' },
  { id: 'revai',        label: 'Rev AI',       note: 'Reverb ASR · premium diarization' },
  { id: 'speechmatics', label: 'Speechmatics', note: 'Enhanced · 55 langs · 1 GB cap' },
  { id: 'pyannote',     label: 'pyannoteAI',   note: 'precision-2 · diarization + STT orchestration' },
  { id: 'sonix',        label: 'Sonix',        note: '30 speakers · $10/hr' },
]

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function SpeakerBadge({ speaker }) {
  const hue = (speaker.charCodeAt(speaker.length - 1) * 37 + 180) % 360
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 99,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', flexShrink: 0,
      background: `hsla(${hue},50%,40%,0.25)`,
      color: `hsl(${hue},60%,65%)`,
    }}>
      {speaker}
    </span>
  )
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 14" />
    </svg>
  )
}

export default function TranscriptionPanel({
  transcription, isTranscribing,
  selectedProvider, onProviderChange, onTranscribe, onDownload,
  availableProviders = [],
}) {
  const [activeSegIdx, setActiveSegIdx] = useState(null)
  const meta = transcription?.metadata
  const prov = PROVIDERS.find(p => p.id === selectedProvider)

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>

      {/* Controls row */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border-sub)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', flexShrink: 0 }}>
          TRANSCRIPTION
        </span>

        {/* Provider pills */}
        <div style={{ display: 'flex', gap: 5, flex: 1, flexWrap: 'wrap' }}>
          {PROVIDERS.map(p => {
            const hasTx = availableProviders.includes(p.id)
            const isSelected = p.id === selectedProvider
            return (
              <button
                key={p.id}
                onClick={() => onProviderChange(p.id)}
                style={{
                  padding: '2px 9px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                  fontFamily: 'inherit', border: '1px solid', transition: 'all 150ms',
                  borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                  background: isSelected ? 'var(--accent-dim)' : 'var(--surface-2)',
                  color: isSelected ? 'var(--accent)' : 'var(--text-dim)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {hasTx && <span style={{ color: 'var(--success)', fontSize: 9 }}>✓</span>}
                {p.label}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
          {transcription && (
            <button className="btn btn-ghost btn-sm" onClick={onDownload}>
              ↓ JSON
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={onTranscribe} disabled={isTranscribing}>
            {isTranscribing ? <><Spinner /> Transcribing…</> : transcription ? 'Re-transcribe' : 'Transcribe'}
          </button>
        </div>
      </div>

      {/* Metadata strip */}
      {meta && (
        <div style={{
          display: 'flex', gap: 14, padding: '6px 12px', flexWrap: 'wrap',
          borderBottom: '1px solid var(--border-sub)', background: 'var(--surface-dark)',
          fontSize: 11, color: 'var(--text-dim)',
        }}>
          <span><strong style={{ color: 'var(--text-muted)' }}>{meta.provider}</strong> · {meta.model}</span>
          {meta.detected_language && <span>Lang: <strong style={{ color: 'var(--text-muted)' }}>{meta.detected_language}</strong></span>}
          {meta.speakers?.length > 0 && <span>Speakers: <strong style={{ color: 'var(--text-muted)' }}>{meta.speakers.length}</strong></span>}
          {meta.segment_count != null && <span>Segments: <strong style={{ color: 'var(--text-muted)' }}>{meta.segment_count}</strong></span>}
          {meta.audio_duration_s && <span>Duration: <strong style={{ color: 'var(--text-muted)' }}>{fmtTime(meta.audio_duration_s)}</strong></span>}
          {meta.confidence && <span>Conf: <strong style={{ color: 'var(--text-muted)' }}>{(meta.confidence * 100).toFixed(1)}%</strong></span>}
        </div>
      )}

      {/* Note below controls when no transcription */}
      {prov && !transcription && !isTranscribing && (
        <div style={{ padding: '4px 12px 0', fontSize: 10, color: 'var(--text-faint)' }}>
          {prov.note}
        </div>
      )}

      {/* Segment list */}
      <div style={{ maxHeight: 280, overflowY: 'auto', padding: '4px 0' }}>
        {!transcription && !isTranscribing && (
          <p style={{ color: 'var(--text-faint)', padding: '20px 12px', textAlign: 'center', fontSize: 12 }}>
            Select a provider and click Transcribe to get started.
          </p>
        )}
        {isTranscribing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 12px', color: 'var(--text-dim)', justifyContent: 'center', fontSize: 12 }}>
            <Spinner /> Processing with {selectedProvider}…
          </div>
        )}
        {transcription?.segments.map((seg, i) => (
          <div
            key={i}
            className={`segment-row ${activeSegIdx === i ? 'active' : ''}`}
            onClick={() => setActiveSegIdx(activeSegIdx === i ? null : i)}
          >
            <span style={{ color: 'var(--text-faint)', fontSize: 10, flexShrink: 0, paddingTop: 2, minWidth: 32 }}>
              {fmtTime(seg.start)}
            </span>
            <SpeakerBadge speaker={seg.speaker} />
            <span style={{ color: activeSegIdx === i ? 'var(--text-bright)' : 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, flex: 1 }}>
              {seg.text}
            </span>
            <div className="seg-actions">
              <span title="Edit" style={{ color: 'var(--text-faint)', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}>✎</span>
              <span title="Delete" style={{ color: 'var(--text-faint)', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}>✕</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
