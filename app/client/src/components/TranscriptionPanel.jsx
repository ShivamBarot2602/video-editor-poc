const PROVIDERS = [
  { id: 'assemblyai',    label: 'AssemblyAI',    note: 'Best diarization · code-mixing' },
  { id: 'deepgram',      label: 'Deepgram',      note: 'Nova-3 · fast' },
  { id: 'openai',        label: 'OpenAI',        note: 'gpt-4o-transcribe-diarize · 25 MB cap' },
  { id: 'groq',          label: 'Groq',          note: 'Whisper Turbo · 100 MB cap' },
  { id: 'mistral',       label: 'Mistral',       note: 'Voxtral Mini · $0.001/min · 30 min cap' },
  { id: 'speechmatics',  label: 'Speechmatics',  note: 'Enhanced · 55 langs · 1 GB cap' },
  { id: 'sonix',         label: 'Sonix',         note: '30 speakers · $10/hr' },
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
      display: 'inline-block', padding: '1px 7px', borderRadius: 99,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      background: `hsla(${hue}, 60%, 40%, 0.25)`,
      color: `hsl(${hue}, 70%, 70%)`,
      marginRight: 6, flexShrink: 0,
    }}>
      {speaker}
    </span>
  )
}

export default function TranscriptionPanel({
  transcription, isTranscribing,
  selectedProvider, onProviderChange, onTranscribe, onDownload,
  availableProviders = [],
}) {
  const meta = transcription?.metadata

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {/* Controls row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
      }}>
        <p className="section-label" style={{ marginBottom: 0, flexShrink: 0 }}>Transcription</p>

        <div style={{ position: 'relative', display: 'inline-block' }}>
          <select
            value={selectedProvider}
            onChange={e => onProviderChange(e.target.value)}
            disabled={isTranscribing}
            style={{ maxWidth: 160 }}
          >
            {PROVIDERS.map(p => (
              <option key={p.id} value={p.id}>
                {availableProviders.includes(p.id) ? `✓ ${p.label}` : p.label}
              </option>
            ))}
          </select>
        </div>

        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
          {PROVIDERS.find(p => p.id === selectedProvider)?.note}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {transcription && (
            <button
              className="btn btn-ghost"
              onClick={onDownload}
              title="Download transcription JSON"
            >
              Download JSON
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={onTranscribe}
            disabled={isTranscribing}
          >
            {isTranscribing ? (
              <><Spinner /> Transcribing…</>
            ) : transcription ? 'Re-transcribe' : 'Transcribe'}
          </button>
        </div>
      </div>

      {/* Metadata strip */}
      {meta && (
        <div style={{
          display: 'flex', gap: 16, padding: '10px 16px', flexWrap: 'wrap',
          borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
          fontSize: 12, color: 'var(--text-muted)',
        }}>
          <span><strong style={{ color: 'var(--text)' }}>{meta.provider}</strong> · {meta.model}</span>
          {meta.detected_language && <span>Lang: <strong style={{ color: 'var(--text)' }}>{meta.detected_language}</strong></span>}
          {meta.speakers?.length > 0 && <span>Speakers: <strong style={{ color: 'var(--text)' }}>{meta.speakers.length}</strong></span>}
          {meta.segment_count != null && <span>Segments: <strong style={{ color: 'var(--text)' }}>{meta.segment_count}</strong></span>}
          {meta.audio_duration_s && <span>Duration: <strong style={{ color: 'var(--text)' }}>{fmtTime(meta.audio_duration_s)}</strong></span>}
          {meta.confidence && <span>Confidence: <strong style={{ color: 'var(--text)' }}>{(meta.confidence * 100).toFixed(1)}%</strong></span>}
        </div>
      )}

      {/* Segments */}
      <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
        {!transcription && !isTranscribing && (
          <p style={{ color: 'var(--text-dim)', padding: '24px 16px', textAlign: 'center', fontSize: 13 }}>
            Select a provider and click Transcribe to get started.
          </p>
        )}
        {isTranscribing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 16px', color: 'var(--text-muted)', justifyContent: 'center' }}>
            <Spinner /> Processing audio with {selectedProvider}…
          </div>
        )}
        {transcription?.segments.map((seg, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, padding: '8px 16px',
            borderBottom: '1px solid var(--border)',
            fontSize: 13, alignItems: 'flex-start',
          }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 11, flexShrink: 0, paddingTop: 1, minWidth: 40 }}>
              {fmtTime(seg.start)}
            </span>
            <SpeakerBadge speaker={seg.speaker} />
            <span style={{ color: 'var(--text)', lineHeight: 1.5 }}>{seg.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 14" />
    </svg>
  )
}
