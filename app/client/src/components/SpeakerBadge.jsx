import { useEffect, useRef, useState } from 'react'

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

  const hue = (speakerStr.charCodeAt(speakerStr.length - 1) * 37 + 180) % 360
  const displayLabel = label ?? speakerStr

  const pillStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 6px',
    borderRadius: 99,
    fontSize: 9,
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: '0.05em',
    flexShrink: 0,
    alignSelf: 'center',
    whiteSpace: 'nowrap',
    background: `hsla(${hue},50%,40%,0.25)`,
    color: `hsl(${hue},60%,65%)`,
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
            color: `hsl(${hue},60%,65%)`,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.05em',
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
