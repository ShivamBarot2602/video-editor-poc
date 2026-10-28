import { ASPECTS } from '../core/editList.js'

const GLYPH_PX = 14

// A small outline of the aspect, GLYPH_PX on its long side.
function AspectGlyph({ aspect }) {
  const [w, h] = aspect.split(':').map(Number)
  const scale = GLYPH_PX / Math.max(w, h)
  return <span className="sc-aspect-glyph" style={{ width: w * scale, height: h * scale }} aria-hidden />
}

export default function AspectPicker({ value, onChange, aspects = ASPECTS, disabled = false }) {
  return (
    <div className="sc-picker" role="group" aria-label="Aspect ratio">
      <span className="sc-picker-label">Aspect</span>
      <div className="sc-segmented">
        {aspects.map((aspect) => (
          <button
            key={aspect}
            type="button"
            className="sc-segment"
            aria-pressed={aspect === value}
            disabled={disabled}
            onClick={() => onChange?.(aspect)}
          >
            <AspectGlyph aspect={aspect} />
            {aspect}
          </button>
        ))}
      </div>
    </div>
  )
}
