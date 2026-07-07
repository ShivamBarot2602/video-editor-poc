// /docs — documentation hub. One card per POC linking to its deep-dive page.
import { Link } from 'react-router-dom'
import { POCS } from './_shared'

export default function DocsHubPage() {
  return (
    <div className="rpt-page">
      <div className="rpt-hero">
        <div className="rpt-wrap">
          <p className="rpt-eyebrow">SP Video Editor POC · Internal</p>
          <h1>Documentation</h1>
          <p className="rpt-lede">
            Three proof-of-concept modules built into the video editor — each evaluated against real providers
            for accuracy, cost, and fit. Pick one to read how it works, what it costs, and what we recommend.
          </p>
          <p className="rpt-meta">
            3 POCs · Prices &amp; capabilities verified against each provider&apos;s own docs · Updated July 2026
          </p>
        </div>
      </div>

      <main className="rpt-wrap">
        <div className="doc-hub-grid">
          {POCS.map((p) => {
            const Icon = p.icon
            return (
              <Link key={p.slug} to={`/docs/${p.slug}`} className="doc-hub-card">
                <span className="doc-hub-icon" aria-hidden="true"><Icon /></span>
                <h2 className="doc-hub-title">{p.label}</h2>
                <p className="doc-hub-tagline">{p.tagline}</p>
                <p className="doc-hub-blurb">{p.blurb}</p>
                <dl className="doc-hub-stats">
                  {p.stats.map(([k, v]) => (
                    <div key={k} className="doc-hub-stat">
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <span className="doc-hub-go">
                  Read docs
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            )
          })}
        </div>

        <footer className="rpt-footer">
          SP Video Editor POC · Module documentation · Internal<br />
          Each module&apos;s pricing &amp; model claims verified against provider docs; mirrors the offline summary decks.
        </footer>
      </main>
    </div>
  )
}
