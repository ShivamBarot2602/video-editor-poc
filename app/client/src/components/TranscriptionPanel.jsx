import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Pencil, Check, Zap, FileText, ChevronDown, Loader2 } from 'lucide-react'
import { PROVIDERS } from '../config/providers'
import SpeakerBadge from './SpeakerBadge'
import { fmtClock as fmtTime } from '../lib/format'
import { scrollRowIntoView } from '../lib/dom'

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

export default function TranscriptionPanel({
  transcription, isTranscribing, isLoadingTranscription = false,
  selectedProvider, onProviderChange, onTranscribe,
  exportFormats = [], onExport,
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
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const listRef = useRef(null)
  const rowRefs = useRef({})
  const editTextareaRef = useRef(null)
  const providerMenuRef = useRef(null)
  const exportMenuRef = useRef(null)
  const meta = transcription?.metadata
  const prov = PROVIDERS.find(p => p.id === selectedProvider)
  const readyCount = PROVIDERS.filter(p => availableProviders.includes(p.id)).length

  // Close any open header menu on outside click or Escape.
  useEffect(() => {
    if (!providerMenuOpen && !exportMenuOpen) return
    const onPointerDown = (e) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target)) setProviderMenuOpen(false)
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setExportMenuOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { setProviderMenuOpen(false); setExportMenuOpen(false) }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [providerMenuOpen, exportMenuOpen])

  // Transcribing locks provider switching — make sure any open menu closes.
  useEffect(() => {
    if (isTranscribing) setProviderMenuOpen(false)
  }, [isTranscribing])

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

        {/* Provider selector */}
        <div ref={providerMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <span
            title={isTranscribing ? 'Cannot switch provider while transcribing' : undefined}
            style={{ display: 'inline-flex', cursor: isTranscribing ? 'not-allowed' : 'default' }}
          >
            <button
              type="button"
              onClick={() => setProviderMenuOpen(o => !o)}
              disabled={isTranscribing}
              aria-haspopup="listbox"
              aria-expanded={providerMenuOpen}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', minWidth: 150, borderRadius: 6, fontSize: 12,
                fontFamily: 'inherit', border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: 'var(--text)',
                cursor: isTranscribing ? 'not-allowed' : 'pointer',
                opacity: isTranscribing ? 0.6 : 1, transition: 'border-color 150ms',
              }}
            >
              {availableProviders.includes(selectedProvider) && (
                <Check size={11} strokeWidth={3} style={{ color: 'var(--success)', flexShrink: 0 }} />
              )}
              <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>
                {prov?.label || selectedProvider}
              </span>
              {readyCount > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
                  {readyCount} ready
                </span>
              )}
              <ChevronDown
                size={13}
                style={{ flexShrink: 0, transition: 'transform 150ms', transform: providerMenuOpen ? 'rotate(180deg)' : 'none' }}
              />
            </button>
          </span>

          {providerMenuOpen && (
            <div
              role="listbox"
              style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
                minWidth: 280, maxHeight: 320, overflowY: 'auto',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 4,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {PROVIDERS.map(p => {
                const hasTx = availableProviders.includes(p.id)
                const isSelected = p.id === selectedProvider
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onProviderChange(p.id); setProviderMenuOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
                      padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', textAlign: 'left', transition: 'background 120ms',
                      background: isSelected ? 'var(--accent-dim)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ width: 12, flexShrink: 0, paddingTop: 2 }}>
                      {hasTx && <Check size={12} strokeWidth={3} style={{ color: 'var(--success)' }} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: 'block', fontSize: 12, fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? 'var(--accent)' : 'var(--text)',
                      }}>
                        {p.label}
                      </span>
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                        {p.note}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
          {transcription && exportFormats.length > 0 && (
            <div ref={exportMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setExportMenuOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Download size={11} /> Export Transcribe
                <ChevronDown
                  size={12}
                  style={{ transition: 'transform 150ms', transform: exportMenuOpen ? 'rotate(180deg)' : 'none' }}
                />
              </button>

              {exportMenuOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
                    minWidth: 220, background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                >
                  {exportFormats.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      role="menuitem"
                      onClick={() => { onExport?.(f.id); setExportMenuOpen(false) }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
                        padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'left', background: 'transparent',
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <FileText size={13} style={{ color: 'var(--text-dim)', flexShrink: 0, marginTop: 1 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                          {f.label}
                        </span>
                        {f.description && (
                          <span style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                            {f.description}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="btn btn-primary btn-sm" onClick={onTranscribe} disabled={isTranscribing}>
            {isTranscribing ? <><Loader2 size={14} className="spin" /> Transcribing…</> : transcription ? 'Re-transcribe' : 'Transcribe'}
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
      {prov && !transcription && !isTranscribing && !isLoadingTranscription && (
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
        {!transcription && !isTranscribing && !isLoadingTranscription && (
          <p style={{ color: 'var(--text-dim)', padding: '20px 12px', textAlign: 'center', fontSize: 12 }}>
            Select a provider and click Transcribe to get started.
          </p>
        )}
        {isLoadingTranscription && !isTranscribing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 12px', color: 'var(--text-dim)', justifyContent: 'center', fontSize: 12 }}>
            <Loader2 size={14} className="spin" /> Loading {selectedProvider} transcription…
          </div>
        )}
        {isTranscribing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 12px', color: 'var(--text-dim)', justifyContent: 'center', fontSize: 12 }}>
            <Loader2 size={14} className="spin" /> Processing with {selectedProvider}…
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
