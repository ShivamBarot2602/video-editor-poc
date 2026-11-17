// Single-choice segmented control (a radiogroup). Options: [{ id, label, title? }];
// `model` is accepted as the tooltip too, since provider option lists carry one.
// `block` stretches it to the container width with equal-width options.
export default function Segmented({ options, value, onChange, disabled, ariaLabel, block }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={block ? 'seg seg-block' : 'seg'}
    >
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          disabled={disabled}
          onClick={() => onChange(o.id)}
          title={o.title ?? o.model}
          className="seg-opt"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
