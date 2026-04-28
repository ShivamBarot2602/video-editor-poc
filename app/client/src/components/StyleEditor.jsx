import { useState } from 'react'

const FONTS = ['Arial', 'Source Sans Pro', 'Roboto', 'Impact', 'Times New Roman', 'Courier New']
const KARAOKE_STYLES = [
  { id: 'word-highlight',     label: 'Word Highlight' },
  { id: 'fill-left-to-right', label: 'Fill Left → Right' },
  { id: 'color-sweep',        label: 'Color Sweep' },
]
const ANIMATION_IN = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
]
const POSITIONS = [
  ['top-left', 'top-center', 'top-right'],
  ['mid-left', 'center', 'mid-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
]
const TABS = ['Type', 'Position', 'Effects', 'Export']

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function SliderField({ label, value, min, max, onChange, unit = '' }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-dim)', fontSize: 10, minWidth: 24, textAlign: 'right' }}>{value}{unit}</span>
      </div>
    </Field>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px' }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 18, height: 18, flexShrink: 0, border: 'none', borderRadius: 2, padding: 0, background: 'none', cursor: 'pointer' }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 11, flex: 1 }}>{label}</span>
      <span style={{ color: 'var(--text-faint)', fontSize: 10, fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
}

function SegmentBtns({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          flex: 1, padding: '4px 0', fontSize: 10, borderRadius: 4, cursor: 'pointer',
          border: '1px solid', fontFamily: 'inherit',
          borderColor: value === o.id ? 'var(--accent)' : 'var(--border)',
          background: value === o.id ? 'var(--accent-dim)' : 'var(--surface-2)',
          color: value === o.id ? 'var(--accent)' : 'var(--text-dim)',
          transition: 'all 150ms',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 14" />
    </svg>
  )
}

export default function StyleEditor({ style, onChange, onReset, canBurn, burnState, onBurn }) {
  const [tab, setTab] = useState('Type')
  const set = key => val => onChange(prev => ({ ...prev, [key]: val }))
  const { status, progress, burnedUrl } = burnState || {}
  const isBurning = status === 'burning'
  const isDone = status === 'done'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-sub)', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t} className={`sidebar-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── TYPE ── */}
        {tab === 'Type' && <>
          <Field label="Font Family">
            <select value={style.fontFamily} onChange={e => set('fontFamily')(e.target.value)}
              style={{ fontSize: 11, padding: '4px 8px' }}>
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>

          <SliderField label="Font Size" value={style.fontSize} min={12} max={72} unit="px" onChange={set('fontSize')} />

          <Field label="Weight">
            <SegmentBtns
              options={[{ id: 400, label: 'Regular' }, { id: 600, label: 'SemiBold' }, { id: 700, label: 'Bold' }]}
              value={style.fontWeight}
              onChange={set('fontWeight')}
            />
          </Field>

          <Field label="Colors">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <ColorField label="Primary" value={style.primaryColor} onChange={set('primaryColor')} />
              <ColorField label="Karaoke" value={style.karaokeColor} onChange={set('karaokeColor')} />
              <ColorField label="Outline" value={style.outlineColor} onChange={set('outlineColor')} />
            </div>
          </Field>

          <SliderField label="Outline Thickness" value={style.outlineThickness} min={0} max={8} unit="px" onChange={set('outlineThickness')} />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={onReset}>Reset defaults</button>
          </div>
        </>}

        {/* ── POSITION ── */}
        {tab === 'Position' && <>
          <Field label="Position">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
              {POSITIONS.map(row => row.map(pos => (
                <button key={pos} title={pos} onClick={() => set('position')(pos)} style={{
                  aspectRatio: '1', borderRadius: 4, border: '1px solid', cursor: 'pointer',
                  borderColor: style.position === pos ? 'var(--accent)' : 'var(--border)',
                  background: style.position === pos ? 'var(--accent-dim)' : 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 150ms',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: 99, background: style.position === pos ? 'var(--accent)' : 'var(--text-faint)' }} />
                </button>
              )))}
            </div>
          </Field>

          <SliderField label="Vertical Margin" value={style.verticalMargin} min={0} max={200} unit="px" onChange={set('verticalMargin')} />

          <Field label="Max Lines">
            <SegmentBtns
              options={[1, 2, 3, 4].map(n => ({ id: n, label: String(n) }))}
              value={style.maxLines}
              onChange={set('maxLines')}
            />
          </Field>

          <Field label="Background Box">
            <SegmentBtns
              options={[{ id: 'off', label: 'Off' }, { id: 'solid', label: 'Solid' }, { id: 'blur', label: 'Blur' }]}
              value={style.backgroundBox}
              onChange={set('backgroundBox')}
            />
          </Field>

          {style.backgroundBox !== 'off' && (
            <SliderField label="Box Opacity" value={style.backgroundOpacity} min={0} max={100} unit="%" onChange={set('backgroundOpacity')} />
          )}
        </>}

        {/* ── EFFECTS ── */}
        {tab === 'Effects' && <>
          <Field label="Karaoke Effect">
            <select value={style.karaokeStyle} onChange={e => set('karaokeStyle')(e.target.value)}
              style={{ fontSize: 11, padding: '4px 8px' }}>
              {KARAOKE_STYLES.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </Field>

          <Field label="Animation In">
            <select value={style.animationIn} onChange={e => set('animationIn')(e.target.value)}
              style={{ fontSize: 11, padding: '4px 8px' }}>
              {ANIMATION_IN.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </Field>

          <SliderField label="Word Timing Offset" value={style.wordTimingOffset} min={-500} max={500} unit="ms" onChange={set('wordTimingOffset')} />

          {/* Live preview */}
          <Field label="Preview">
            <div style={{
              background: 'var(--surface-2)', border: '1px dashed var(--border)',
              borderRadius: 6, padding: '10px 8px', textAlign: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: style.fontWeight }}>can't stop</span>
                <span style={{ color: style.karaokeColor, fontSize: 12, fontWeight: 700 }}>laughing</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: style.fontWeight }}>again</span>
              </div>
            </div>
          </Field>
        </>}

        {/* ── EXPORT ── */}
        {tab === 'Export' && <>
          <Field label="Output Format">
            <SegmentBtns
              options={[{ id: 'mp4', label: 'MP4' }, { id: 'webm', label: 'WebM' }]}
              value={style.outputFormat}
              onChange={set('outputFormat')}
            />
          </Field>

          <SliderField label="Quality (CRF)" value={style.quality} min={15} max={35} onChange={set('quality')} />

          <Field label="Burn Mode">
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '5px 8px', fontSize: 11, color: 'var(--text-dim)',
            }}>
              Hardcode (ASS)
            </div>
          </Field>

          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!isDone && (
              <button
                className="btn btn-primary btn-full"
                onClick={onBurn}
                disabled={isBurning || !canBurn}
                style={{ padding: '9px', fontSize: 13 }}
              >
                {isBurning ? <><Spinner /> Burning… {progress}%</> : '🔥 Burn Subtitles'}
              </button>
            )}

            {!canBurn && !isDone && (
              <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
                Transcribe the video first.
              </p>
            )}

            {isBurning && (
              <>
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 300ms ease' }} />
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'center' }}>
                  FFmpeg rendering…
                </p>
              </>
            )}

            {isDone && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                  borderRadius: 5, background: 'var(--success-dim)', color: 'var(--success)', fontSize: 12,
                }}>
                  <span>✓</span> Burned successfully
                </div>
                <a href={burnedUrl} download className="btn btn-secondary btn-full" style={{ textDecoration: 'none', fontSize: 12 }}>
                  ⬇ Download Video
                </a>
                <button className="btn btn-ghost btn-full btn-sm" onClick={onBurn}>
                  Re-burn with current style
                </button>
              </div>
            )}
          </div>
        </>}
      </div>
    </div>
  )
}
