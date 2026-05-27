import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Pencil, Check, Zap } from 'lucide-react'
import { PROVIDERS } from '../providers'
import SpeakerBadge from './SpeakerBadge'

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
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

function SegmentWords({ words, currentTime }) {
  return (
    <span style={{ fontSize: 12, lineHeight: 1.5, flex: 1, wordBreak: 'break-word' }}>
      {words.map((w, i) => {
        const isActive = currentTime >= w.start && currentTime <= w.end
        const isPast   = currentTime > w.end
        return (
          <span
            key={i}
            style={{
              color: isActive ? 'var(--accent)' : isPast ? 'var(--text-muted)' : 'var(--text-dim)',
              fontWeight: isActive ? 600 : 400,
              transition: 'color 80ms linear',
            }}
          >
            {w.word}{i < words.length - 1 ? ' ' : ''}
          </span>
        )
      })}
    </span>
  )
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
<circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 14" />
    </svg>
  )
}

export default function TranscriptionPanel({
  transcription, isTranscribing,
  selectedProvider, onProviderChange, onTranscribe, onDownload,
  availableProviders = [],
  currentTime,
  speakerAliases = {},
  onSpeakerAliasesChange,
  onSegmentEdit,
  listMaxHeight = 280,
}) {
  const [activeSegIdx, setActiveSegIdx] = useState(null)
  const [editingSegIdx, setEditingSegIdx] = useState(null)
  const [editingSegText, setEditingSegText] = useState('')
  const listRef = useRef(null)
  const rowRefs = useRef({})
  const editTextareaRef = useRef(null)
  const meta = transcription?.metadata
  const prov = PROVIDERS.find(p => p.id === selectedProvider)

  const playingSegIdx = useMemo(() => {
    if (!transcription?.segments || typeof currentTime !== 'number') return null
    const segments = transcription.segments
    for (let i = 0; i < segments.length; i++) {
      if (currentTime >= segments[i].start && currentTime <= segments[i].end) return i
    }
    return null
  }, [transcription, currentTime])

  useEffect(() => {
    if (playingSegIdx == null) return
    scrollRowIntoView(listRef.current, rowRefs.current[playingSegIdx])
  }, [playingSegIdx])

  // Auto-focus + resize textarea when entering edit mode
  useEffect(() => {
    if (editingSegIdx == null || !editTextareaRef.current) return
    const el = editTextareaRef.current
    el.focus()
    el.select()
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editingSegIdx])

  const startSegmentEdit = (e, i) => {
    e.stopPropagation()
    const seg = transcription.segments[i]
    setEditingSegIdx(i)
    setEditingSegText(seg.text_edited ?? seg.text)
  }

  const commitSegmentEdit = () => {
    if (editingSegIdx == null) return
    const trimmed = editingSegText.trim()
    if (trimmed && onSegmentEdit) {
      const originalText = transcription.segments[editingSegIdx].text
      // null = remove the override (revert to original transcription text)
      onSegmentEdit(editingSegIdx, trimmed === originalText ? null : trimmed)
    }
    setEditingSegIdx(null)
  }

  const cancelSegmentEdit = () => setEditingSegIdx(null)

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 8,
      overflow: 'hidden',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}>

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
                {hasTx && <Check size={9} strokeWidth={3} style={{ color: 'var(--success)', flexShrink: 0 }} />}
                {p.label}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
          {transcription && (
            <button className="btn btn-ghost btn-sm" onClick={onDownload} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Download size={11} /> JSON
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
          <span>
            Speakers:{' '}
            {prov && !prov.diarization
              ? <strong style={{ color: 'var(--text-faint)' }}>N/A</strong>
              : <strong style={{ color: 'var(--text-muted)' }}>{meta.speakers?.length ?? '—'}</strong>
            }
          </span>
          {meta.word_timestamps && (
            <span style={{ color: 'var(--accent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Zap size={10} fill="currentColor" /> Word-level
            </span>
          )}
          {meta.segment_count != null && <span>Segments: <strong style={{ color: 'var(--text-muted)' }}>{meta.segment_count}</strong></span>}
          {meta.audio_duration_s && <span>Duration: <strong style={{ color: 'var(--text-muted)' }}>{fmtTime(meta.audio_duration_s)}</strong></span>}
          {meta.confidence && <span>Conf: <strong style={{ color: 'var(--text-muted)' }}>{(meta.confidence * 100).toFixed(1)}%</strong></span>}
        </div>
      )}

      {/* Note below controls when no transcription */}
      {prov && !transcription && !isTranscribing && (
        <div style={{ padding: '4px 12px 0', fontSize: 10, color: 'var(--text-dim)' }}>
          {prov.note}
        </div>
      )}

      {/* Segment list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '4px 0',
          ...(listMaxHeight == null ? null : { maxHeight: listMaxHeight }),
        }}
      >
        {!transcription && !isTranscribing && (
          <p style={{ color: 'var(--text-dim)', padding: '20px 12px', textAlign: 'center', fontSize: 12 }}>
            Select a provider and click Transcribe to get started.
          </p>
        )}
        {isTranscribing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 12px', color: 'var(--text-dim)', justifyContent: 'center', fontSize: 12 }}>
            <Spinner /> Processing with {selectedProvider}…
          </div>
        )}
        {transcription?.segments.map((seg, i) => {
          const isEditing = editingSegIdx === i
          const isActive = activeSegIdx === i
          const isPlaying = playingSegIdx === i

          return (
            <div
              key={i}
              ref={el => { rowRefs.current[i] = el }}
              className={`segment-row ${isActive ? 'active' : ''} ${isPlaying ? 'playing' : ''}`}
              onClick={() => { if (!isEditing) setActiveSegIdx(isActive ? null : i) }}
            >
              <span style={{ color: 'var(--text-dim)', fontSize: 10, flexShrink: 0, minWidth: 32, lineHeight: 1.2 }}>
                {fmtTime(seg.start)}
              </span>

              {prov?.diarization !== false && (
                <span className="speaker-slot">
                  <SpeakerBadge
                    speaker={seg.speaker}
                    label={(speakerAliases?.[seg.speaker] || '').trim() || seg.speaker}
                    onSave={onSpeakerAliasesChange ? (newLabel) => {
                      const trimmed = newLabel.trim()
                      onSpeakerAliasesChange(prev => ({
                        ...(prev || {}),
                        [seg.speaker]: trimmed === seg.speaker ? '' : trimmed,
                      }))
                    } : undefined}
                  />
                </span>
              )}

              {isEditing ? (
                <textarea
                  ref={editTextareaRef}
                  value={editingSegText}
                  onChange={e => setEditingSegText(e.target.value)}
                  onBlur={commitSegmentEdit}
                  onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Escape') { e.preventDefault(); cancelSegmentEdit() }
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitSegmentEdit() }
                  }}
                  onInput={e => {
                    e.target.style.height = 'auto'
                    e.target.style.height = `${e.target.scrollHeight}px`
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    flex: 1, resize: 'none', overflow: 'hidden',
                    background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--text-bright)', fontSize: 12, lineHeight: 1.5,
                    fontFamily: 'inherit', padding: 0, minHeight: '1.5em',
                  }}
                />
              ) : isPlaying && seg.words?.length > 0 && !seg.text_edited ? (
                <SegmentWords words={seg.words} currentTime={currentTime} />
              ) : (
                <span style={{
                  color: (isActive || isPlaying) ? 'var(--text-bright)' : 'var(--text-muted)',
                  fontSize: 12, lineHeight: 1.5, flex: 1,
                }}>
                  {seg.text_edited ?? seg.text}
                  {seg.text_edited && (
                    <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>edited</span>
                  )}
                </span>
              )}

              {onSegmentEdit && !isEditing && (
                <div className="seg-actions">
                  <span
                    title="Edit text"
                    onClick={(e) => startSegmentEdit(e, i)}
                    style={{ color: 'var(--text-dim)', cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center' }}
                  >
                    <Pencil size={11} />
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
