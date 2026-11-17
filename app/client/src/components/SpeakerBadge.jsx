import { useEffect, useRef, useState } from 'react'

// SPEAKER_00 / SPEAKER_A → var(--spk1), SPEAKER_01 / SPEAKER_B → var(--spk2) …
// cycling through the four speaker colors, so the transcript and the timeline
// color a speaker the same. Providers number or letter their speakers.
export function speakerColor(speaker) {
  const s = String(speaker ?? '')
  const digits = s.match(/\d+/)
  const n = digits ? parseInt(digits[0], 10) : s.toUpperCase().charCodeAt(s.length - 1) - 65
  return `var(--spk${((Number.isFinite(n) ? n : 0) % 4 + 4) % 4 + 1})`
}

export default function SpeakerBadge({ speaker, label, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  if (speaker == null) return null
  const speakerStr = String(speaker)
  if (!speakerStr) return null

  const color = speakerColor(speakerStr)
  const displayLabel = label ?? speakerStr

  const pillStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 7px',
    borderRadius: 99,
    fontSize: 11,
    lineHeight: 1,
    fontWeight: 600,
    flexShrink: 0,
    alignSelf: 'center',
    whiteSpace: 'nowrap',
    background: `color-mix(in srgb, ${color} 16%, transparent)`,
    color,
    userSelect: 'none',
  }

  const commit = (e) => {
    e?.stopPropagation()
    const trimmed = draft.trim()
    if (trimmed) onSave(trimmed)
    setEditing(false)
  }

  const cancel = (e) => {
    e?.stopPropagation()
    setEditing(false)
  }

  if (editing) {
    return (
      <span style={pillStyle} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter') { e.preventDefault(); commit(e) }
            if (e.key === 'Escape') { e.preventDefault(); cancel(e) }
          }}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'inherit',
            padding: 0,
            width: `${Math.max(draft.length + 1, 4)}ch`,
            minWidth: 24,
          }}
        />
      </span>
    )
  }

  return (
    <span
      title={onSave ? 'Click to rename' : undefined}
      onClick={onSave ? (e) => { e.stopPropagation(); setDraft(displayLabel); setEditing(true) } : undefined}
      style={{ ...pillStyle, cursor: onSave ? 'pointer' : 'default' }}
    >
      {displayLabel}
    </span>
  )
}
