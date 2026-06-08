import { Sparkles, Loader2, Scissors } from 'lucide-react'
import { PROVIDERS } from '../providers'

const PROVIDER_LABELS = Object.fromEntries(PROVIDERS.map(p => [p.id, p.label]))

// Must match the backend bucket keys in lib/clipPrompt.js.
export const BUCKETS = [
  { id: 'auto',   label: 'Auto' },
  { id: 'short',  label: '≤30s' },
  { id: 'medium', label: '30–60s' },
  { id: 'long',   label: '60–90s' },
]

export const SUGGEST_PROVIDERS = [
  { id: 'gemini', label: 'Gemini', model: 'gemini-2.5-pro' },
  { id: 'openai', label: 'OpenAI', model: 'gpt-4.1-mini' },
]

const COUNTS = [3, 4, 5]

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

/* Segmented radiogroup — same pattern as ThumbnailsPage RerankerSelect. */
function Segmented({ options, value, onChange, disabled, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex', gap: 2, padding: 2,
        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-sub)',
        borderRadius: 8, opacity: disabled ? 0.5 : 1, width: 'fit-content',
      }}
    >
      {options.map(o => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            title={o.model}
            style={{
              padding: '3px 12px', fontSize: 12, lineHeight: 1.5,
              fontWeight: active ? 600 : 500, borderRadius: 6, border: 'none',
              cursor: disabled ? 'default' : 'pointer',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--text-muted)',
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* Chip group built on the existing .toggle-btn class. */
function Chips({ options, value, onChange, disabled, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={`toggle-btn ${active ? 'active' : ''}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Controls bar for the clips page: transcript source, suggest LLM, duration
 * bucket, clip count, and the Suggest action.
 */
export default function ClipControlsBar({
  transcriptProviders, transcriptProvider, onTranscriptProvider,
  suggestProvider, onSuggestProvider,
  bucket, onBucket, count, onCount,
  onSuggest, suggesting, disabled,
}) {
  const countOpts = COUNTS.map(n => ({ id: n, label: String(n) }))

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap',
      padding: '14px 20px', borderBottom: '1px solid var(--border-sub)',
      background: 'var(--surface-dark)',
    }}>
      <Field label="Transcript source">
        <select
          value={transcriptProvider || ''}
          onChange={e => onTranscriptProvider(e.target.value)}
          disabled={disabled || suggesting}
          style={{ width: 'auto', minWidth: 150 }}
        >
          {(transcriptProviders || []).map(id => (
            <option key={id} value={id}>{PROVIDER_LABELS[id] || id}</option>
          ))}
        </select>
      </Field>

      <Field label="Suggested by">
        <Segmented
          options={SUGGEST_PROVIDERS}
          value={suggestProvider}
          onChange={onSuggestProvider}
          disabled={disabled || suggesting}
          ariaLabel="Clip suggestion provider"
        />
      </Field>

      <Field label="Clip length">
        <Chips options={BUCKETS} value={bucket} onChange={onBucket} disabled={disabled || suggesting} ariaLabel="Clip duration bucket" />
      </Field>

      <Field label="How many">
        <Chips options={countOpts} value={count} onChange={onCount} disabled={disabled || suggesting} ariaLabel="Number of clips" />
      </Field>

      <button
        className="btn btn-primary"
        onClick={onSuggest}
        disabled={disabled || suggesting}
        style={{ gap: 8, marginLeft: 'auto' }}
      >
        {suggesting
          ? <><Loader2 size={14} className="spin" /> Suggesting…</>
          : <><Sparkles size={14} /> Suggest clips</>}
      </button>
    </div>
  )
}
