import Field from './Field'

// Labelled range input with the current value shown on the label row.
export default function Slider({ label, value, min, max, step, onChange, unit = '', format }) {
  return (
    <Field
      label={label}
      aside={
        <span className="tc" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {format ? format(value) : `${value}${unit}`}
        </span>
      }
    >
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
    </Field>
  )
}
