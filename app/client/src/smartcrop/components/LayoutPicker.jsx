import { LAYOUTS_BY_ASPECT, isLayoutSupported } from '../core/editList.js'

const LAYOUTS = [
  { id: 'fill', label: 'Fill', hint: 'Crop to the speaker' },
  { id: 'fit', label: 'Fit', hint: 'Whole frame, blurred background' },
  { id: 'split', label: 'Split', hint: 'Two speakers stacked' },
  { id: 'three', label: 'Three', hint: 'Three speakers stacked' },
  { id: 'four', label: 'Four', hint: 'Four speakers in a grid' },
]

// Every layout is shown; ones the aspect doesn't allow are disabled (05 §7.3).
export default function LayoutPicker({ aspect, value, onChange, layoutsByAspect = LAYOUTS_BY_ASPECT, disabled = false }) {
  return (
    <div className="sc-picker">
      <span className="sc-picker-label">Layout</span>
      <div className="seg" role="radiogroup" aria-label="Layout" aria-disabled={disabled || undefined}>
        {LAYOUTS.map(({ id, label, hint }) => {
          const supported = isLayoutSupported(aspect, id, layoutsByAspect)
          return (
            <button
              key={id}
              type="button"
              className="seg-opt sc-seg-opt"
            role="radio"
              aria-checked={id === value}
              disabled={disabled || !supported}
              title={supported ? hint : `Not available for ${aspect}`}
              onClick={() => onChange?.(id)}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
