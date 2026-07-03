import { useState, useEffect } from 'react'
import { Flame, Download, RefreshCw, Check,Info } from 'lucide-react'
import { FONT_FAMILIES, PRESETS, DEFAULT_STYLE } from '../config/subtitleStyle'

const FONTS = FONT_FAMILIES
const KARAOKE_STYLES = [
  { id: 'word-highlight',     label: 'Word Highlight' },
  { id: 'fill-left-to-right', label: 'Fill Left → Right' },
  { id: 'color-sweep',        label: 'Color Sweep' },
  { id: 'pop-on',             label: 'Pop-on (word by word)' },
]
const ANIMATION_OPTS = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
]

// Deterministic fallback hue for a speaker with no explicit colour — matches
// SpeakerBadge's derivation so the swatch preview lines up with the transcript.
function speakerHue(spk) {
  const s = String(spk || '')
  return (s.charCodeAt(s.length - 1) * 37 + 180) % 360
}
function hslToHex(h, s, l) {
  l /= 100; const a = (s * Math.min(l, 1 - l)) / 100
  const f = n => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}
const defaultSpeakerColor = spk => hslToHex(speakerHue(spk), 70, 60)
const POSITIONS = [
  ['top-left', 'top-center', 'top-right'],
  ['mid-left', 'center', 'mid-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
]
const TABS = ['Type', 'Position', 'Effects', 'Export']

// Small ⓘ dot with a short hover popover explaining a control.
function InfoDot({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {/* <span style={{
        width: 12, height: 12, borderRadius: 99, border: '1px solid var(--border)',
        color: 'var(--text-dim)', fontSize: 9, lineHeight: '11px', textAlign: 'center',
        display: 'inline-block', cursor: 'help', fontStyle: 'normal', fontWeight: 700,
      }}>i</span> */}
      <span style={{
        width: 12, height: 12, borderRadius: 99, border: '1px solid var(--border)',
        color: 'var(--text-dim)', fontSize: 9, lineHeight: '11px', textAlign: 'center',
        display: 'inline-block', cursor: 'help', fontStyle: 'normal', fontWeight: 700,
      }}>
        <Info size={12} />
      </span>
      {show && (
        <span style={{
          position: 'absolute', bottom: '150%', left: 0, width: 160, zIndex: 50,
          background: 'var(--surface-3, #23232a)', color: 'var(--text-muted)',
          fontSize: 10, lineHeight: 1.4, padding: '6px 8px', borderRadius: 5,
          border: '1px solid var(--border)', boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
          textTransform: 'none', letterSpacing: 0, fontWeight: 400, pointerEvents: 'none',
        }}>{text}</span>
      )}
    </span>
  )
}

function Field({ label, info, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}{info && <InfoDot text={info} />}
      </div>
      {children}
    </div>
  )
}

function SliderField({ label, value, min, max, onChange, unit = '', format, info }) {
  const display = format ? format(value) : `${value}${unit}`
  return (
    <Field label={label} info={info}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-dim)', fontSize: 10, minWidth: 30, textAlign: 'right' }}>{display}</span>
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
      <span style={{ color: 'var(--text-dim)', fontSize: 10, fontFamily: 'monospace' }}>{value}</span>
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
<circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 14" />
    </svg>
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

  const base = style.primaryColor || 'var(--text-muted)'
  const hi = style.karaokeColor
  const sweep = style.karaokeStyle === 'color-sweep'
  const fill = style.karaokeStyle === 'fill-left-to-right'
  const popOn = style.karaokeStyle === 'pop-on'
  const caps = style.textTransform === 'uppercase'
  const scale = Math.max(100, style.activeWordScale ?? 100) / 100

  // pop-on: word invisible until reached, then shown in base colour (with
  // active-scale on, the just-appeared word flashes the highlight colour —
  // mirrors buildBody's combo). sweep: only the current word lit. others:
  // spoken words stay lit (cumulative).
  const colorFor = i => {
    if (popOn) return (scale > 1 && i === active) ? hi : base
    if (active < 0) return base
    if (sweep) return i === active ? hi : base
    return i <= active ? hi : base
  }
  const opacityFor = i => (popOn ? (active >= 0 && i <= active ? 1 : 0) : 1)
  const scaleFor = i => (scale > 1 && i === active ? scale : 1)

  const box = style.backgroundBox === 'solid' || style.backgroundBox === 'blur'
  const boxBg = box ? `rgba(0,0,0,${(style.backgroundOpacity ?? 70) / 100})` : 'transparent'
  const pad = box ? Math.min(18, (style.boxPadding ?? 20) / 2) : 0
  const textShadow = !box && style.outlineThickness > 0
    ? `${style.outlineColor} 1px 1px 0, ${style.outlineColor} -1px -1px 0, ${style.outlineColor} 1px -1px 0, ${style.outlineColor} -1px 1px 0`
    : 'none'
  const fade = style.animationIn === 'fade' || style.animationOut === 'fade'

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
              color: colorFor(i), opacity: opacityFor(i), fontSize: 14,
              fontWeight: style.fontWeight, textShadow,
              textTransform: caps ? 'uppercase' : 'none',
              display: 'inline-block', transform: `scale(${scaleFor(i)})`,
              transition: fill ? 'color 350ms ease' : 'color 120ms ease, opacity 150ms ease, transform 120ms ease',
            }}>{w}</span>
          ))}
        </span>
      </div>
    </Field>
  )
}

// A compact sample of one preset's look. Static at rest (middle word hinted in
// the highlight colour); when `animate` is true it loops the preset's karaoke
// effect. Font comes out generic (the shipped TTFs aren't registered for CSS —
// only libass uses them), so cards convey colour/case/box/effect/weight, which
// are the real differentiators; the video preview remains the exact WYSIWYG.
const SAMPLE_WORDS = ['make', 'it', 'pop']

function PresetSample({ st, animate }) {
  const [active, setActive] = useState(-1)
  useEffect(() => {
    if (!animate) { setActive(-1); return }
    let i = -1
    const id = setInterval(() => {
      i += 1
      if (i > SAMPLE_WORDS.length) i = -1
      setActive(Math.min(i, SAMPLE_WORDS.length - 1))
    }, 420)
    return () => clearInterval(id)
  }, [animate])

  const box = st.backgroundBox === 'solid' || st.backgroundBox === 'blur'
  const caps = st.textTransform === 'uppercase'
  const scaleUp = Math.max(100, st.activeWordScale ?? 100) / 100
  const sweep = st.karaokeStyle === 'color-sweep'
  const popOn = st.karaokeStyle === 'pop-on'
  const hi = st.karaokeColor, base = st.primaryColor

  const colorFor = i => {
    if (!animate) return i === 1 ? hi : base            // static hint on middle word
    if (popOn) return (scaleUp > 1 && i === active) ? hi : base
    if (active < 0) return base
    if (sweep) return i === active ? hi : base
    return i <= active ? hi : base
  }
  const opacityFor = i => (animate && popOn ? (active >= 0 && i <= active ? 1 : 0) : 1)
  const scaleFor = i => (scaleUp > 1 && i === active ? scaleUp : 1)
  const textShadow = !box && (st.outlineThickness > 0 || (st.shadow ?? 0) > 0)
    ? `${st.outlineColor} 0 0 2px, ${st.outlineColor} 1px 1px 0px`
    : 'none'

  return (
    <span style={{
      display: 'inline-flex', gap: 4, alignItems: 'center', justifyContent: 'center',
      fontWeight: st.fontWeight, fontSize: 13, lineHeight: 1,
      background: box ? `rgba(0,0,0,${(st.backgroundOpacity ?? 80) / 100})` : 'transparent',
      padding: box ? '2px 6px' : 0, borderRadius: box ? 3 : 0,
      textTransform: caps ? 'uppercase' : 'none',
    }}>
      {SAMPLE_WORDS.map((w, i) => (
        <span key={i} style={{
          color: colorFor(i), opacity: opacityFor(i), display: 'inline-block',
          transform: `scale(${scaleFor(i)})`, textShadow, transition: 'all 150ms',
        }}>{w}</span>
      ))}
    </span>
  )
}

// Hover-animated preset picker. At rest each card shows its name + a static
// sample; on hover the name nudges up and the sample animates. Only the hovered
// card animates (single interval), so many cards stay cheap.
function PresetGallery({ current, onApply }) {
  const [hover, setHover] = useState(null)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {PRESETS.map(p => {
        const st = { ...DEFAULT_STYLE, ...p.style }
        const active = hover === p.id
        return (
          <button
            key={p.id}
            onClick={() => onApply(p)}
            onMouseEnter={() => setHover(p.id)}
            onMouseLeave={() => setHover(h => (h === p.id ? null : h))}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 5, height: 60, borderRadius: 6, cursor: 'pointer', overflow: 'hidden',
              border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--border)',
              background: active ? 'var(--accent-dim)' : 'var(--surface-2)',
              fontFamily: 'inherit', transition: 'border-color 150ms, background 150ms',
            }}
          >
            <span style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
              color: active ? 'var(--accent)' : 'var(--text-dim)',
              transform: active ? 'translateY(-3px)' : 'none', transition: 'all 200ms',
            }}>{p.label}</span>
            <span style={{ transform: active ? 'scale(1.08)' : 'scale(1)', transition: 'transform 200ms' }}>
              <PresetSample st={st} animate={active} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function StyleEditor({ style, onChange, onReset, canBurn, burnState, onBurn, speakers = [], speakerAliases = {} }) {
  const [tab, setTab] = useState('Type')
  const set = key => val => onChange(prev => ({ ...prev, [key]: val }))
  const applyPreset = preset => onChange(prev => ({ ...prev, ...preset.style }))
  const setSpeakerColor = (spk, hex) =>
    onChange(prev => ({ ...prev, speakerColors: { ...(prev.speakerColors || {}), [spk]: hex } }))
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
          <Field label="Preset" info="One-click looks. Hover a card to preview its animation, click to apply — then fine-tune below.">
            <PresetGallery current={style} onApply={applyPreset} />
          </Field>

          <Field label="Font Family" info="The typeface used for your captions.">
            <select value={style.fontFamily} onChange={e => set('fontFamily')(e.target.value)}
              style={{ fontSize: 11, padding: '4px 8px' }}>
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>

          <SliderField label="Font Size" value={style.fontSize} min={12} max={200} unit="px" onChange={set('fontSize')} info="How big the captions are, sized on a 1920×1080 canvas." />

          <Field label="Weight" info="Text thickness. Shipped fonts have one weight, so SemiBold looks close to Bold.">
            <SegmentBtns
              options={[{ id: 400, label: 'Regular' }, { id: 600, label: 'SemiBold' }, { id: 700, label: 'Bold' }]}
              value={style.fontWeight}
              onChange={set('fontWeight')}
            />
          </Field>

          <Field label="Case" info="Force ALL CAPS or keep the original casing.">
            <SegmentBtns
              options={[{ id: 'none', label: 'Normal' }, { id: 'uppercase', label: 'ALL CAPS' }]}
              value={style.textTransform || 'none'}
              onChange={set('textTransform')}
            />
          </Field>

          <Field label="Colors" info="Primary = normal words. Karaoke = the highlighted/spoken word. Outline = the border around letters.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <ColorField label="Primary" value={style.primaryColor} onChange={set('primaryColor')} />
              <ColorField label="Karaoke" value={style.karaokeColor} onChange={set('karaokeColor')} />
              <ColorField label="Outline" value={style.outlineColor} onChange={set('outlineColor')} />
            </div>
          </Field>

          <SliderField label="Outline Thickness" value={style.outlineThickness} min={0} max={8} unit="px" onChange={set('outlineThickness')} info="Thickness of the border drawn around the letters." />
          {style.backgroundBox !== 'off' && (
            <p style={{ fontSize: 10, color: 'var(--warning, #e0a030)', margin: 0, lineHeight: 1.4 }}>
              ⚠ Outline is disabled while a solid box is on — the box replaces it. Turn the box off (Position tab) to use an outline.
            </p>
          )}

          <SliderField label="Shadow" value={style.shadow ?? 0} min={0} max={10} unit="px" onChange={set('shadow')} info="Drop-shadow depth behind the text." />
          <SliderField label="Letter Spacing" value={style.letterSpacing ?? 0} min={-5} max={30} unit="px" onChange={set('letterSpacing')} info="Extra space between letters (tracking)." />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={onReset} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={11} /> Reset defaults
            </button>
          </div>
        </>}

        {/* ── POSITION ── */}
        {tab === 'Position' && <>
          <Field label="Position" info="Where captions sit on the frame. Use Custom to drag them anywhere on the video.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, maxWidth: 132 }}>
              {POSITIONS.map(row => row.map(pos => (
                <button key={pos} title={pos} onClick={() => set('position')(pos)} style={{
                  height: 26, borderRadius: 4, border: '1px solid', cursor: 'pointer',
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
            <SliderField label="Vertical Margin" value={style.verticalMargin} min={0} max={200} unit="px" onChange={set('verticalMargin')} info="Distance from the top/bottom edge of the frame." />
          )}

          <Field label="Max Lines" info="Most caption lines shown on screen at once.">
            <SegmentBtns
              options={[1, 2, 3, 4].map(n => ({ id: n, label: String(n) }))}
              value={style.maxLines}
              onChange={set('maxLines')}
            />
          </Field>

          <SliderField
            label="Words / Line"
            value={style.wordsPerLine ?? 0}
            min={0} max={12}
            onChange={set('wordsPerLine')}
            format={v => (v === 0 ? 'Auto' : String(v))}
            info="Force a fixed number of words per line. Auto fits by width."
          />

          <Field label="Background Box" info="Draw a solid box behind the text for readability.">
            <SegmentBtns
              options={[{ id: 'off', label: 'Off' }, { id: 'solid', label: 'Solid' }]}
              value={style.backgroundBox === 'blur' ? 'solid' : style.backgroundBox}
              onChange={set('backgroundBox')}
            />
          </Field>

          {style.backgroundBox !== 'off' && (<>
            <SliderField label="Box Opacity" value={style.backgroundOpacity} min={0} max={100} unit="%" onChange={set('backgroundOpacity')} info="How see-through the box is (100% = solid)." />
            <SliderField label="Box Padding" value={style.boxPadding ?? 20} min={0} max={60} unit="px" onChange={set('boxPadding')} info="Space between the text and the box edge." />
          </>)}
        </>}

        {/* ── EFFECTS ── */}
        {tab === 'Effects' && <>
          <Field label="Karaoke Effect" info="How words light up as they're spoken: highlight, fill, sweep, or pop-on (word-by-word).">
            <select value={style.karaokeStyle} onChange={e => set('karaokeStyle')(e.target.value)}
              style={{ fontSize: 11, padding: '4px 8px' }}>
              {KARAOKE_STYLES.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </Field>

          <SliderField
            label="Active Word Scale"
            value={style.activeWordScale ?? 100}
            min={100} max={130}
            onChange={set('activeWordScale')}
            format={v => (v === 100 ? 'Off' : `${v}%`)}
            info="Pops the spoken word bigger (and brighter) for emphasis. Off = no scaling."
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Field label="Animation In" info="How each caption appears (e.g. fade in).">
                <select value={style.animationIn} onChange={e => set('animationIn')(e.target.value)}
                  style={{ fontSize: 11, padding: '4px 8px', width: '100%' }}>
                  {ANIMATION_OPTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Animation Out" info="How each caption disappears (e.g. fade out).">
                <select value={style.animationOut || 'none'} onChange={e => set('animationOut')(e.target.value)}
                  style={{ fontSize: 11, padding: '4px 8px', width: '100%' }}>
                  {ANIMATION_OPTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <SliderField label="Word Timing Offset" value={style.wordTimingOffset} min={-500} max={500} unit="ms" onChange={set('wordTimingOffset')} info="Shift captions earlier (−) or later (+) to sync with the audio." />

          {speakers.length > 0 && (
            <Field label="Per-Speaker Colors" info="Give each detected speaker their own caption color.">

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!style.speakerColorsEnabled}
                    onChange={e => set('speakerColorsEnabled')(e.target.checked)} />
                  Color captions by speaker
                </label>
                {style.speakerColorsEnabled && speakers.map(spk => (
                  <ColorField
                    key={spk}
                    label={(speakerAliases?.[spk] || '').trim() || spk}
                    value={style.speakerColors?.[spk] || defaultSpeakerColor(spk)}
                    onChange={hex => setSpeakerColor(spk, hex)}
                  />
                ))}
              </div>
            </Field>
          )}

          <EffectPreview style={style} />
        </>}

        {/* ── EXPORT ── */}
        {tab === 'Export' && <>
          <Field label="Output Format" info="MP4 (H.264) is fast and works everywhere. WebM (VP9) encodes much slower.">
            <SegmentBtns
              options={[{ id: 'mp4', label: 'MP4' }, { id: 'webm', label: 'WebM' }]}
              value={style.outputFormat}
              onChange={set('outputFormat')}
            />
          </Field>
          {style.outputFormat === 'webm' && (
            <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: 0, lineHeight: 1.4 }}>
              WebM (VP9) encodes much slower than MP4. Use MP4 unless you need transparency/WebM.
            </p>
          )}

          <SliderField
            label="Quality (CRF · lower = better)"
            value={style.quality ?? 23}
            min={16} max={34}
            onChange={set('quality')}
            info="Lower = sharper video but bigger file. 23 is a good default."
          />

          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!isDone && (
              <button
                className="btn btn-primary btn-full"
                onClick={onBurn}
                disabled={isBurning || !canBurn}
                style={{ padding: '9px', fontSize: 13 }}
              >
                {isBurning ? <><Spinner /> {burnLabel}</> : <><Flame size={14} /> Burn Subtitles</>}
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
