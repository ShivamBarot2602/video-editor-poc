const FONTS = ['Arial', 'Roboto', 'Impact', 'Times New Roman', 'Courier New']
const KARAOKE_STYLES = [
  { id: 'word-highlight',    label: 'Word Highlight' },
  { id: 'fill-left-to-right', label: 'Fill Left → Right' },
  { id: 'color-sweep',       label: 'Color Sweep' },
]

const POSITIONS = [
  ['top-left',    'top-center',    'top-right'   ],
  ['mid-left',    'center',        'mid-right'   ],
  ['bottom-left', 'bottom-center', 'bottom-right'],
]

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ flexShrink: 0 }} />
      <label style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{label}</label>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
}

function SliderRow({ label, value, min, max, onChange, unit = '' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{label}</label>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  )
}

export default function StyleEditor({ style, onChange, onReset }) {
  const set = (key) => (val) => onChange(prev => ({ ...prev, [key]: val }))

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 10px', borderBottom: '1px solid var(--border)',
      }}>
        <p className="section-label" style={{ marginBottom: 0 }}>Subtitle Style</p>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={onReset}>
          Reset
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Font */}
        <Row label="Font Family">
          <select value={style.fontFamily} onChange={e => set('fontFamily')(e.target.value)}>
            {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
        </Row>

        <SliderRow label="Font Size" value={style.fontSize} min={12} max={72} unit="px" onChange={set('fontSize')} />

        {/* Colors */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Colors</label>
          <ColorRow label="Primary text" value={style.primaryColor} onChange={set('primaryColor')} />
          <ColorRow label="Karaoke highlight" value={style.karaokeColor} onChange={set('karaokeColor')} />
          <ColorRow label="Outline" value={style.outlineColor} onChange={set('outlineColor')} />
        </div>

        <SliderRow label="Outline Thickness" value={style.outlineThickness} min={0} max={5} unit="px" onChange={set('outlineThickness')} />

        {/* Bold / Italic */}
        <Row label="Style">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`toggle-btn ${style.bold ? 'active' : ''}`} onClick={() => set('bold')(!style.bold)}>
              <strong>B</strong>
            </button>
            <button className={`toggle-btn ${style.italic ? 'active' : ''}`} onClick={() => set('italic')(!style.italic)}>
              <em>I</em>
            </button>
          </div>
        </Row>

        <div className="divider" />

        {/* Position picker */}
        <Row label="Position">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxWidth: 150 }}>
            {POSITIONS.map((row, ri) =>
              row.map((pos, ci) => (
                <button
                  key={pos}
                  title={pos}
                  onClick={() => set('position')(pos)}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 4,
                    border: '1px solid',
                    borderColor: style.position === pos ? 'var(--accent)' : 'var(--border)',
                    background: style.position === pos ? 'var(--accent-dim)' : 'var(--surface-2)',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span style={{
                    width: 5, height: 5, borderRadius: 99,
                    background: style.position === pos ? 'var(--accent)' : 'var(--text-dim)',
                  }} />
                </button>
              ))
            )}
          </div>
        </Row>

        <SliderRow label="Vertical Margin" value={style.verticalMargin} min={0} max={200} unit="px" onChange={set('verticalMargin')} />

        <div className="divider" />

        {/* Background box */}
        <Row label="Background Box">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className={`toggle-btn ${style.backgroundBox ? 'active' : ''}`}
              onClick={() => set('backgroundBox')(!style.backgroundBox)}
            >
              {style.backgroundBox ? 'On' : 'Off'}
            </button>
          </div>
        </Row>

        {style.backgroundBox && (
          <SliderRow label="Box Opacity" value={style.backgroundOpacity} min={0} max={100} unit="%" onChange={set('backgroundOpacity')} />
        )}

        <div className="divider" />

        {/* Karaoke style */}
        <Row label="Karaoke Effect">
          <select value={style.karaokeStyle} onChange={e => set('karaokeStyle')(e.target.value)}>
            {KARAOKE_STYLES.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Row>

        {/* Max lines per subtitle page */}
        <Row label="Max Lines per Subtitle">
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                onClick={() => set('maxLines')(n)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 13,
                  fontWeight: style.maxLines === n ? 700 : 400,
                  border: '1px solid',
                  borderColor: style.maxLines === n ? 'var(--accent)' : 'var(--border)',
                  background: style.maxLines === n ? 'var(--accent-dim)' : 'var(--surface-2)',
                  color: style.maxLines === n ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 150ms',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </Row>

      </div>
    </div>
  )
}
