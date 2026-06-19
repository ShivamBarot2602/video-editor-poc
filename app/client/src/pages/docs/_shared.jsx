// Shared building blocks for the POC documentation pages (/docs/*).
// Dark theme, reuses the .rpt-* styling kit + adds .doc-* classes (index.css).
import { Link, useLocation } from 'react-router-dom'

// ── POC registry (drives the hub cards + the in-docs sub-nav) ──────────────
export const POCS = [
  {
    slug: 'subtitles',
    label: 'Subtitles',
    tagline: 'Speech-to-text → diarized, styled, burned-in subtitles',
    blurb: 'Thirteen STT providers integrated behind one normalised shape — transcribe, diarize, edit speakers, then burn subtitles into the video.',
    stats: [['Providers', '13'], ['Default', 'AssemblyAI'], ['From', '$0.04/hr']],
    icon: IconCaption,
  },
  {
    slug: 'thumbnails',
    label: 'Thumbnails',
    tagline: 'Auto-pick the best frames, then A/B polish with image models',
    blurb: 'A cost-funnel: local CV drops weak frames for free, a vision model ranks the rest, and only the top 3 get polished by Gemini + OpenAI side by side.',
    stats: [['Models', '4'], ['Picks', 'Top 3'], ['~Cost', '$0.13–0.73/video']],
    icon: IconImage,
  },
  {
    slug: 'clips',
    label: 'Clips',
    tagline: 'An LLM reads the transcript and suggests short, feed-ready clips',
    blurb: 'Transcript-only stage: OpenAI or Gemini propose 3–5 ranked clips; preview streams the original (no cut), and ffmpeg only cuts on download.',
    stats: [['Models', '2'], ['Per run', '~$0.004–0.02'], ['Cut', 'Local / $0']],
    icon: IconClip,
  },
]

// ── Status mark (svg icon + optional label, accessible) ────────────────────
const MARK_LABEL = { ok: 'Supported', warn: 'Partial or unclear', bad: 'Not supported' }

export function Mark({ m, t }) {
  return (
    <span className={`rpt-mark ${m}`}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {m === 'ok' && <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {m === 'bad' && <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
        {m === 'warn' && <path d="M8 2.5l6 11H2l6-11zM8 6.8v3.1M8 11.6v.05" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {t && <span className="lbl">{t}</span>}
      <span className="sr-only">{MARK_LABEL[m]}{t ? ` (${t})` : ''}</span>
    </span>
  )
}

export function SectionTitle({ n, children }) {
  return <h2 className="rpt-h2"><span className="rpt-num" aria-hidden="true">{n}</span>{children}</h2>
}

// ── Flow: a vertical pipeline renderer for the "Workflow" sections ─────────
// steps: [{ n, title, detail?, meta?, tone?: 'user'|'free'|'paid'|'local'|'out',
//           branches?: [{ title, detail?, meta?, tone? }] }]
export function Flow({ steps }) {
  return (
    <ol className="doc-flow" aria-label="Pipeline steps">
      {steps.map((s, i) => (
        <li key={i} className={`doc-flow-step tone-${s.tone || 'free'}`}>
          <span className="doc-flow-rail" aria-hidden="true">
            <span className="doc-flow-node">{s.n != null ? s.n : ''}</span>
          </span>
          <div className="doc-flow-body">
            <div className="doc-flow-head">
              <span className="doc-flow-title">{s.title}</span>
              {s.meta && <span className="doc-flow-meta">{s.meta}</span>}
            </div>
            {s.detail && <p className="doc-flow-detail">{s.detail}</p>}
            {s.branches && (
              <div className="doc-flow-branches">
                {s.branches.map((b, j) => (
                  <div key={j} className={`doc-flow-branch tone-${b.tone || 'paid'}`}>
                    <div className="doc-flow-head">
                      <span className="doc-flow-title">{b.title}</span>
                      {b.meta && <span className="doc-flow-meta">{b.meta}</span>}
                    </div>
                    {b.detail && <p className="doc-flow-detail">{b.detail}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ── DocShell: breadcrumb + POC sub-nav + hero, wraps each subpage ──────────
export function DocShell({ active, eyebrow, title, lede, meta, children }) {
  const { pathname } = useLocation()
  return (
    <div className="rpt-page">
      <nav className="doc-subnav" aria-label="Documentation sections">
        <div className="rpt-wrap doc-subnav-inner">
          <Link to="/docs" className="doc-crumb">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3.5L5.5 8 10 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Docs
          </Link>
          <span className="doc-crumb-sep" aria-hidden="true">/</span>
          <div className="doc-tabs" role="tablist">
            {POCS.map((p) => {
              const to = `/docs/${p.slug}`
              const isActive = pathname === to || active === p.slug
              return (
                <Link key={p.slug} to={to} role="tab" aria-selected={isActive}
                  className={`doc-tab ${isActive ? 'active' : ''}`}>
                  {p.label}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      <div className="rpt-hero">
        <div className="rpt-wrap">
          <p className="rpt-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="rpt-lede">{lede}</p>
          {meta && <p className="rpt-meta">{meta}</p>}
        </div>
      </div>

      <main className="rpt-wrap">{children}</main>
    </div>
  )
}

// ── Icons (inline SVG, currentColor) ───────────────────────────────────────
export function IconCaption({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.5 11.2c-.5-.7-1.3-1-2-1-1.4 0-2.3 1-2.3 2.3s.9 2.3 2.3 2.3c.7 0 1.5-.3 2-1M18.5 11.2c-.5-.7-1.3-1-2-1-1.4 0-2.3 1-2.3 2.3s.9 2.3 2.3 2.3c.7 0 1.5-.3 2-1"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
export function IconImage({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.5" cy="9.5" r="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 17l4.5-4.2 3.2 3 3-2.6L20 17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
export function IconClip({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18M8 5v14M16 5v14" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.8 10.4v3.2l2.8-1.6-2.8-1.6z" fill="currentColor" />
    </svg>
  )
}
