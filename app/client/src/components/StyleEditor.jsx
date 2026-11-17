import { useState, useEffect } from 'react'
import { Flame, Download, RefreshCw, Check, Loader2 } from 'lucide-react'
import { FONT_FAMILIES } from '../config/subtitleStyle'
import Field from '../ui/Field'
import Slider from '../ui/Slider'
import Segmented from '../ui/Segmented'

const FONTS = FONT_FAMILIES
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

function ColorField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px' }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 18, height: 18, flexShrink: 0, border: 'none', borderRadius: 2, padding: 0, background: 'none', cursor: 'pointer' }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 11, flex: 1 }}>{label}</span>
      <span style={{ color: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--mono)' }}>{value}</span>
    </div>
  )
}

// Animated mini-preview of the karaoke effect + fade. Mirrors buildAss's
// semantics: word-highlight/fill = spoken words stay lit (cumulative);
// color-sweep = only the current word is lit (moving highlight); fade replays
// on each loop. Purely illustrative — the pixel-accurate WYSIWYG is the video.
const PREVIEW_WORDS = ["can't", 'stop', 'laughing', 'again']

function EffectPreview({ style }) {
  const [active, setActive] = useState(-1)
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    let i = -1
    setActive(-1)
    const id = setInterval(() => {
      i += 1
      if (i > PREVIEW_WORDS.length) { i = -1; setCycle(c => c + 1) }
      setActive(Math.min(i, PREVIEW_WORDS.length - 1))
    }, 500)
    return () => clearInterval(id)
  }, [style.karaokeStyle])

  const base = 'var(--text-muted)'
  const hi = style.karaokeColor
  const sweep = style.karaokeStyle === 'color-sweep'
  const fill = style.karaokeStyle === 'fill-left-to-right'
  const colorFor = i => (active < 0 ? base : sweep ? (i === active ? hi : base) : (i <= active ? hi : base))

  const box = style.backgroundBox === 'solid' || style.backgroundBox === 'blur'
  const boxBg = box ? `rgba(0,0,0,${(style.backgroundOpacity ?? 70) / 100})` : 'transparent'
  const pad = box ? Math.min(18, (style.boxPadding ?? 20) / 2) : 0
  const textShadow = !box && style.outlineThickness > 0
    ? `${style.outlineColor} 1px 1px 0, ${style.outlineColor} -1px -1px 0, ${style.outlineColor} 1px -1px 0, ${style.outlineColor} -1px 1px 0`
    : 'none'
  const fade = style.animationIn === 'fade'

  return (
    <Field label="Preview">
      <div style={{
        background: 'var(--surface-2)', border: '1px dashed var(--border)',
        borderRadius: 6, padding: '18px 8px', textAlign: 'center', overflow: 'hidden',
      }}>
        <span
          key={fade ? cycle : 'static'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'center',
            background: boxBg, borderRadius: box ? 4 : 0,
            padding: box ? `${4 + pad}px ${8 + pad}px` : 0,
            animation: fade ? 'fade-in 450ms ease' : 'none',
          }}
        >
          {PREVIEW_WORDS.map((w, i) => (
            <span key={i} style={{
              color: colorFor(i), fontSize: 14, fontWeight: style.fontWeight, textShadow,
              transition: fill ? 'color 350ms ease' : 'color 120ms ease',
            }}>{w}</span>
          ))}
        </span>
      </div>
    </Field>
  )
}

export default function StyleEditor({ style, onChange, onReset, canBurn, burnState, onBurn }) {
  const [tab, setTab] = useState('Type')
  const set = key => val => onChange(prev => ({ ...prev, [key]: val }))
  const { status, phase, progress, burnedUrl } = burnState || {}
  const isBurning = status === 'burning'
  const isDone = status === 'done'
  // Every phase (S3 download → ffmpeg → S3 upload) streams its own 0–100;
  // progress resets on each phase event. Fall back to an indeterminate pulse
  // until the first percent of a phase arrives.
  const burnLabel = phase === 'preparing' ? `Preparing video… ${progress}%`
    : phase === 'uploading' ? `Finalizing… ${progress}%`
    : `Burning… ${progress}%`
  const burnHint = phase === 'preparing' ? 'Fetching original from storage…'
    : phase === 'uploading' ? 'Uploading burned video…'
    : 'FFmpeg rendering…'
  const indeterminate = (phase === 'preparing' || phase === 'uploading') && progress === 0

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
          <Field label="Font family">
            <select value={style.fontFamily} onChange={e => set('fontFamily')(e.target.value)}>
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>

          <Slider label="Font size" value={style.fontSize} min={12} max={200} unit="px" onChange={set('fontSize')} />

          <Field label="Weight">
            <Segmented block ariaLabel="Weight"
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

          <Slider label="Outline thickness" value={style.outlineThickness} min={0} max={8} unit="px" onChange={set('outlineThickness')} />
          {style.backgroundBox !== 'off' && (
            <p style={{ fontSize: 10, color: 'var(--warning, #e0a030)', margin: 0, lineHeight: 1.4 }}>
              ⚠ Outline is disabled while a solid box is on — the box replaces it. Turn the box off (Position tab) to use an outline.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={onReset} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={11} /> Reset defaults
            </button>
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
            <button
              onClick={() => onChange(prev => ({ ...prev, position: 'custom', customPosition: prev.customPosition || { x: 0.5, y: 0.9 } }))}
              style={{
                marginTop: 4, padding: '6px 0', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                border: '1px solid', fontFamily: 'inherit', width: '100%',
                borderColor: style.position === 'custom' ? 'var(--accent)' : 'var(--border)',
                background: style.position === 'custom' ? 'var(--accent-dim)' : 'var(--surface-2)',
                color: style.position === 'custom' ? 'var(--accent)' : 'var(--text-dim)',
              }}
            >
              Custom (drag on video)
            </button>
            {style.position === 'custom' && (
              <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                Drag the handle on the video preview to place subtitles anywhere.
              </p>
            )}
          </Field>

          {style.position !== 'custom' && (
            <Slider label="Vertical margin" value={style.verticalMargin} min={0} max={200} unit="px" onChange={set('verticalMargin')} />
          )}

          <Field label="Max lines">
            <Segmented block ariaLabel="Max lines"
              options={[1, 2, 3, 4].map(n => ({ id: n, label: String(n) }))}
              value={style.maxLines}
              onChange={set('maxLines')}
            />
          </Field>

          <Slider
            label="Words / line"
            value={style.wordsPerLine ?? 0}
            min={0} max={12}
            onChange={set('wordsPerLine')}
            format={v => (v === 0 ? 'Auto' : String(v))}
          />

          <Field label="Background box">
            <Segmented block ariaLabel="Background box"
              options={[{ id: 'off', label: 'Off' }, { id: 'solid', label: 'Solid' }]}
              value={style.backgroundBox === 'blur' ? 'solid' : style.backgroundBox}
              onChange={set('backgroundBox')}
            />
          </Field>

          {style.backgroundBox !== 'off' && (<>
            <Slider label="Box opacity" value={style.backgroundOpacity} min={0} max={100} unit="%" onChange={set('backgroundOpacity')} />
            <Slider label="Box padding" value={style.boxPadding ?? 20} min={0} max={60} unit="px" onChange={set('boxPadding')} />
          </>)}
        </>}

        {/* ── EFFECTS ── */}
        {tab === 'Effects' && <>
          <Field label="Karaoke effect">
            <select value={style.karaokeStyle} onChange={e => set('karaokeStyle')(e.target.value)}>
              {KARAOKE_STYLES.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </Field>

          <Field label="Animation in">
            <select value={style.animationIn} onChange={e => set('animationIn')(e.target.value)}>
              {ANIMATION_IN.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </Field>

          <Slider label="Word timing offset" value={style.wordTimingOffset} min={-500} max={500} unit="ms" onChange={set('wordTimingOffset')} />

          <EffectPreview style={style} />
        </>}

        {/* ── EXPORT ── */}
        {tab === 'Export' && <>
          <Field label="Output format">
            <Segmented block ariaLabel="Output format"
              options={[{ id: 'mp4', label: 'MP4' }, { id: 'webm', label: 'WebM' }]}
              value={style.outputFormat}
              onChange={set('outputFormat')}
            />
          </Field>


          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!isDone && (
              <button
                className="btn btn-primary btn-full"
                onClick={onBurn}
                disabled={isBurning || !canBurn}
                style={{ padding: '9px', fontSize: 13 }}
              >
                {isBurning ? <><Loader2 size={14} className="spin" /> {burnLabel}</> : <><Flame size={14} /> Burn Subtitles</>}
              </button>
            )}

            {!canBurn && !isDone && (
              <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
                Transcribe the video first.
              </p>
            )}

            {isBurning && (
              <>
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    width: indeterminate ? '100%' : `${progress}%`,
                    height: '100%',
                    background: 'var(--accent)',
                    transition: 'width 300ms ease',
                    ...(indeterminate ? { animation: 'pulse 1.2s ease-in-out infinite', opacity: 0.5 } : {}),
                  }} />
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center' }}>
                  {burnHint}
                </p>
              </>
            )}

            {isDone && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                  borderRadius: 5, background: 'var(--success-dim)', color: 'var(--success)', fontSize: 12,
                }}>
                  <Check size={13} strokeWidth={2.5} /> Burned successfully
                </div>
                <a href={burnedUrl} download className="btn btn-secondary btn-full" style={{ textDecoration: 'none', fontSize: 12 }}>
                  <Download size={13} /> Download Video
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
