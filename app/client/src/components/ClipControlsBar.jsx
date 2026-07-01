import { Sparkles, Loader2, Film } from 'lucide-react'
import { PROVIDERS } from '../config/providers'

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
  { id: 'openai', label: 'OpenAI', model: 'gpt-5.4-mini' },
]

// Top-level method: read the transcript, or have Gemini watch the raw video.
export const METHODS = [
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'video',     label: 'Video understanding' },
]
export const VIDEO_MODEL = 'gemini-2.5-flash'
// Video-understanding model toggle. Must match server config/constants VIDEO_MODELS.
export const VIDEO_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Flash', model: 'gemini-2.5-flash · cheap, fast', hint: '~$0.03 / 5 min' },
  { id: 'gemini-2.5-pro',   label: 'Pro',   model: 'gemini-2.5-pro · best adherence', hint: 'sharper · ~4× cost' },
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
        background: 'var(--hover-overlay)', border: '1px solid var(--border-sub)',
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
  method = 'subtitles', onMethod,
  transcriptProviders, transcriptProvider, onTranscriptProvider,
  suggestProvider, onSuggestProvider,
  videoModel = VIDEO_MODEL, onVideoModel,
  bucket, onBucket, count, onCount,
  onSuggest, suggesting, disabled,
}) {
  const countOpts = COUNTS.map(n => ({ id: n, label: String(n) }))
  const isVideo = method === 'video'
  const busy = disabled || suggesting
  const videoHint = (VIDEO_MODELS.find(m => m.id === videoModel) || VIDEO_MODELS[0]).hint

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap',
      padding: '14px 20px', borderBottom: '1px solid var(--border-sub)',
      background: 'var(--surface-dark)',
    }}>
      <Field label="Method">
        <Segmented
          options={METHODS}
          value={method}
          onChange={onMethod}
          disabled={busy}
          ariaLabel="Suggestion method"
        />
      </Field>

      {isVideo ? (
        // Video understanding is Gemini-only — pick flash (cheap) or pro (sharper).
        <Field label="Model">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Segmented
              options={VIDEO_MODELS}
              value={videoModel}
              onChange={onVideoModel}
              disabled={busy}
              ariaLabel="Video understanding model"
            />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-faint)', fontSize: 11, whiteSpace: 'nowrap' }}>
              <Film size={12} color="var(--accent)" /> {videoHint}
            </span>
          </div>
        </Field>
      ) : (
        <>
          <Field label="Transcript source">
            <select
              value={transcriptProvider || ''}
              onChange={e => onTranscriptProvider(e.target.value)}
              disabled={busy}
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
              disabled={busy}
              ariaLabel="Clip suggestion provider"
            />
          </Field>
        </>
      )}

      <Field label="Clip length">
        <Chips options={BUCKETS} value={bucket} onChange={onBucket} disabled={busy} ariaLabel="Clip duration bucket" />
      </Field>

      <Field label="How many">
        <Chips options={countOpts} value={count} onChange={onCount} disabled={busy} ariaLabel="Number of clips" />
      </Field>

      <button
        className="btn btn-primary"
        onClick={onSuggest}
        disabled={busy}
        style={{ gap: 8, marginLeft: 'auto' }}
      >
        {suggesting
          ? <><Loader2 size={14} className="spin" /> {isVideo ? 'Analyzing…' : 'Suggesting…'}</>
          : isVideo
            ? <><Film size={14} /> Analyze video</>
            : <><Sparkles size={14} /> Suggest clips</>}
      </button>
    </div>
  )
}
