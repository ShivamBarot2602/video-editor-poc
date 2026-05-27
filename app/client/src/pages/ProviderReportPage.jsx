// STT Provider Evaluation — PM-facing decision report.
// Data verified May 2026. Mirrors docs/STT-Provider-POC-Summary.

const RECOMMENDATIONS = [
  { tag: '★ Default — best overall value', pick: 'AssemblyAI', price: '$0.17/hr · 99+ languages', pick_: true,
    body: 'Highest accuracy + best-in-class diarization at a low price. Handles multilingual and code-mixed content; generous file/duration limits, no chunking needed.' },
  { tag: 'Cheapest with diarization', pick: 'xAI Grok', price: '$0.10/hr · synchronous',
    body: 'Diarization included in a single fast call (no polling). Trade-off: only 25 languages and newer / less battle-tested.' },
  { tag: 'Cheapest overall', pick: 'Groq', price: '$0.04/hr · fastest',
    body: 'Unbeatable price and speed — but no speaker diarization. Use only for single-speaker content.' },
  { tag: 'Indian / code-mixed content', pick: 'Sarvam AI', price: '~$0.54/hr · 22 Indic langs',
    body: 'Purpose-built for Hinglish / Tanglish and Indian languages. The right call when the audience speaks Indian languages.' },
  { tag: 'Long-form video (> 1 hr)', pick: 'Rev AI', price: '$0.20/hr · up to 17 hr',
    body: 'Most permissive limits (17 hr / 5 TB). No chunking for long podcasts or interviews.' },
  { tag: 'Best for free evaluation', pick: 'pyannoteAI', price: '€0.168/hr · 150 free hrs',
    body: '150 hours free, no card required — diarization-first with voiceprints. Great for a no-cost pilot.' },
]

// free: 'ok' | 'bad'
const PRICING = [
  { p: 'Groq', m: 'whisper-large-v3-turbo', base: '$0.04', diar: 'N/A (no diarize)', lang: '99+', limit: '100 MB', free: 'Free tier' },
  { p: 'xAI Grok', m: 'grok-stt', base: '$0.10', diar: '$0.10', lang: '25', limit: '500 MB', free: 'Not documented', freeWarn: true },
  { p: 'AssemblyAI', m: 'universal-2', base: '$0.15', diar: '$0.17', lang: '99+', limit: '~5 GB / ~10 hr', free: 'Trial credits', hl: true },
  { p: 'Mistral', m: 'voxtral-mini-latest', base: '$0.18', diar: '$0.18', lang: '13', limit: '1 GB / 3 hr', free: 'Limited' },
  { p: 'pyannoteAI', m: 'precision-2', base: '€0.168', diar: '€0.168', lang: 'Multi', limit: 'Not stated', free: '150 hours!' },
  { p: 'Rev AI', m: 'reverb-asr', base: '$0.20', diar: '$0.20', lang: '57', limit: '5 TB / 17 hr', free: 'Limited' },
  { p: 'ElevenLabs', m: 'scribe_v2', base: '$0.22', diar: '$0.22', lang: '90+', limit: '3 GB', free: 'Limited' },
  { p: 'Speechmatics', m: 'enhanced', base: '$0.24', diar: '$0.24', lang: '55+', limit: '2 hr', free: '480 min/mo' },
  { p: 'OpenAI', m: 'gpt-4o-transcribe-diarize', base: '$0.36', diar: '$0.36', lang: '55+', limit: '25 MB', limitWarn: true, free: 'New acct credits' },
  { p: 'Sarvam AI', m: 'saaras:v3', base: '~$0.36', diar: '~$0.54', lang: '22 Indic', limit: '1 hr (Batch)', free: '₹1,000 credits' },
  { p: 'Deepgram', m: 'nova-3', base: '$0.462', diar: '$0.582', lang: '50+', limit: '2 GB / 10 min', limitWarn: true, free: '$200 credits' },
  { p: 'Gladia', m: 'solaria-1', base: '$0.61', diar: '$0.61', lang: '100+', limit: '1 GB / 135 min', free: '10 hr/mo' },
  { p: 'Sonix', m: 'Sonix AI', base: '$10.00', diar: '$10.00', lang: '53+', limit: '100 MB', free: 'None', freeBad: true },
]

// m: 'ok' | 'warn' | 'bad'; t: optional label
const FEATURES = [
  { p: 'AssemblyAI', hl: true, diar: { m: 'ok' }, word: { m: 'ok' }, mix: { m: 'ok' }, lang: '99+', auto: { m: 'ok' } },
  { p: 'Deepgram', diar: { m: 'ok' }, word: { m: 'ok' }, mix: { m: 'ok' }, lang: '50+', auto: { m: 'ok' } },
  { p: 'Gladia', diar: { m: 'ok' }, word: { m: 'ok' }, mix: { m: 'ok' }, lang: '100+', auto: { m: 'ok' } },
  { p: 'OpenAI', diar: { m: 'ok' }, word: { m: 'warn', t: 'segment' }, mix: { m: 'warn' }, lang: '55+', auto: { m: 'ok' } },
  { p: 'Groq', diar: { m: 'bad' }, word: { m: 'ok' }, mix: { m: 'warn' }, lang: '99+', auto: { m: 'ok' } },
  { p: 'Mistral', diar: { m: 'ok' }, word: { m: 'ok' }, mix: { m: 'warn' }, lang: '13', auto: { m: 'ok' } },
  { p: 'ElevenLabs', diar: { m: 'ok' }, word: { m: 'ok', t: 'word+char' }, mix: { m: 'warn' }, lang: '90+', auto: { m: 'ok' } },
  { p: 'Rev AI', diar: { m: 'ok' }, word: { m: 'ok' }, mix: { m: 'warn' }, lang: '57', auto: { m: 'warn' } },
  { p: 'Speechmatics', diar: { m: 'ok' }, word: { m: 'ok' }, mix: { m: 'ok', t: 'bilingual' }, lang: '55+', auto: { m: 'ok' } },
  { p: 'pyannoteAI', diar: { m: 'ok', t: 'best' }, word: { m: 'ok' }, mix: { m: 'warn' }, lang: 'Multi', auto: { m: 'ok' } },
  { p: 'Sonix', diar: { m: 'ok', t: '30 spk' }, word: { m: 'ok' }, mix: { m: 'bad' }, lang: '53+', auto: { m: 'ok' } },
  { p: 'Sarvam AI', diar: { m: 'ok' }, word: { m: 'ok' }, mix: { m: 'ok', t: 'Indic' }, lang: '22 Indic', auto: { m: 'ok' } },
  { p: 'xAI Grok', diar: { m: 'ok' }, word: { m: 'ok' }, mix: { m: 'warn' }, lang: '25', auto: { m: 'ok' } },
]

// hook: 'ok' | 'bad'
const TECH = [
  { p: 'AssemblyAI', hl: true, style: 'Async (SDK)', poll: 'SDK-managed (upload + poll)', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'Deepgram', style: 'Sync (SDK)', poll: '—', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'OpenAI', style: 'Sync REST', poll: '—', hook: 'bad', hookT: 'sync, inline', prep: 'WAV → MP3 128 kbps (25 MB)' },
  { p: 'Groq', style: 'Sync REST', poll: '—', hook: 'bad', hookT: 'sync, inline', prep: 'WAV → MP3 128 kbps (100 MB)' },
  { p: 'Mistral', style: 'Sync REST', poll: '—', hook: 'bad', hookT: 'sync, inline', prep: 'WAV' },
  { p: 'ElevenLabs', style: 'Sync REST', poll: '—', hook: 'ok', hookT: 'not used (async mode)', prep: 'WAV' },
  { p: 'xAI Grok', style: 'Sync REST', poll: '—', hook: 'bad', hookT: 'sync, inline', prep: 'WAV (500 MB cap check)' },
  { p: 'Gladia', style: 'Async batch', poll: 'upload → submit → poll · 3 s / 20 min', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'Rev AI', style: 'Async batch', poll: 'submit → poll → fetch · 5 s / 1 hr', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'Speechmatics', style: 'Async batch', poll: 'submit → poll → fetch · 3 s / 10 min', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'Sonix', style: 'Async batch', poll: 'upload → poll → fetch · 3 s / 30 min', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'pyannoteAI', style: 'Async batch', poll: 'presign → upload → submit → poll · 3 s / 20 min', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'Sarvam AI', style: 'Async batch', poll: 'job → upload → start → poll → download · 5 s / 20 min', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
]

const MARK_LABEL = { ok: 'Supported', warn: 'Partial or unclear', bad: 'Not supported' }

function Mark({ m, t }) {
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

function SectionTitle({ n, children }) {
  return <h2 className="rpt-h2"><span className="rpt-num" aria-hidden="true">{n}</span>{children}</h2>
}

export default function ProviderReportPage() {
  return (
    <div className="rpt-page">
      <div className="rpt-hero">
        <div className="rpt-wrap">
          <p className="rpt-eyebrow">SP Video Editor POC · Internal</p>
          <h1>Speech-to-Text Provider Evaluation</h1>
          <p className="rpt-lede">
            We integrated and tested 13 STT providers for the video subtitle &amp; clip-extraction
            pipeline. This is the decision summary: which provider to use, what it costs, and what each supports.
          </p>
          <p className="rpt-meta">
            13 providers benchmarked · Prices &amp; features verified <strong>May 2026</strong> ·
            Pipeline: upload video → transcribe → diarize → subtitle / clip
          </p>
        </div>
      </div>

      <main className="rpt-wrap">

        {/* 1. RECOMMENDATION */}
        <SectionTitle n="1">Recommendation</SectionTitle>
        <p className="rpt-sub">Best pick depends on the job. Prices are per hour of audio <strong>with speaker diarization enabled</strong>.</p>
        <div className="rpt-cards">
          {RECOMMENDATIONS.map((r) => (
            <article key={r.pick} className={`rpt-card ${r.pick_ ? 'is-pick' : ''}`}>
              <p className="rpt-tag">{r.tag}</p>
              <p className="rpt-pick">{r.pick}</p>
              <p className="rpt-price">{r.price}</p>
              <p>{r.body}</p>
            </article>
          ))}
        </div>
        <p className="rpt-callout">
          <strong>Bottom line:</strong> Ship on <strong>AssemblyAI</strong> as the default (best balance of
          accuracy, features, and cost at $0.17/hr). Use <strong>xAI Grok</strong> ($0.10/hr) where cost matters
          most and 25 languages suffice, <strong>Groq</strong> ($0.04/hr) for single-speaker content, and
          <strong> Sarvam AI</strong> for Indian-language audiences.
        </p>
        <p className="rpt-callout is-avoid">
          <strong>Watch out:</strong> Sonix is $10/hr (17–250× pricier than alternatives); Deepgram caps
          requests at 10 min and OpenAI at 25 MB — both need chunking for full-length video.
        </p>

        {/* 2. PRICING */}
        <SectionTitle n="2">Pricing</SectionTitle>
        <p className="rpt-sub">USD per hour, pay-as-you-go / entry tier. Sorted cheapest first by the with-diarization rate.</p>
        <div className="rpt-scroll">
          <table className="rpt-table">
            <thead>
              <tr>
                <th scope="col">Provider</th><th scope="col">Model</th>
                <th scope="col" className="c">Base / hr</th><th scope="col" className="c">With diarization</th>
                <th scope="col" className="c">Languages</th><th scope="col">File / duration limit</th>
                <th scope="col">Free tier</th>
              </tr>
            </thead>
            <tbody>
              {PRICING.map((r) => (
                <tr key={r.p} className={r.hl ? 'is-hl' : ''}>
                  <td className="rpt-prov">{r.p}{r.hl ? ' ★' : ''}</td>
                  <td className="rpt-model">{r.m}</td>
                  <td className="rpt-c rpt-num-cell">{r.base}</td>
                  <td className="rpt-c rpt-num-cell">{r.diar}</td>
                  <td className="rpt-c">{r.lang}</td>
                  <td>{r.limit}{r.limitWarn && <Mark m="warn" />}</td>
                  <td><span className={`rpt-badge ${r.freeBad ? 'bad' : r.freeWarn ? 'warn' : 'ok'}`}>{r.free}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="rpt-notes">
          <li><strong>ElevenLabs</strong> cut Scribe v2 ~40% in March 2026 (now $0.22/hr) — moved from priciest into the mid-tier.</li>
          <li><strong>Gladia</strong> drops to $0.20/hr on its Growth plan (volume commitment); <strong>Sonix</strong> Pro subscription is ≈ $2/hr at full usage but PAYG is $10/hr.</li>
        </ul>

        {/* 3. FEATURES */}
        <SectionTitle n="3">Feature comparison</SectionTitle>
        <p className="rpt-sub">The capabilities that matter for subtitles &amp; clip extraction.</p>
        <div className="rpt-scroll">
          <table className="rpt-table">
            <thead>
              <tr>
                <th scope="col">Provider</th><th scope="col" className="c">Diarization</th>
                <th scope="col" className="c">Word timestamps</th><th scope="col" className="c">Code-mixing</th>
                <th scope="col" className="c">Languages</th><th scope="col" className="c">Auto detect</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((r) => (
                <tr key={r.p} className={r.hl ? 'is-hl' : ''}>
                  <td className="rpt-prov">{r.p}{r.hl ? ' ★' : ''}</td>
                  <td className="rpt-c"><Mark {...r.diar} /></td>
                  <td className="rpt-c"><Mark {...r.word} /></td>
                  <td className="rpt-c"><Mark {...r.mix} /></td>
                  <td className="rpt-c">{r.lang}</td>
                  <td className="rpt-c"><Mark {...r.auto} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rpt-legend">
          <span><Mark m="ok" /> Supported</span>
          <span><Mark m="warn" /> Partial / unclear</span>
          <span><Mark m="bad" /> Not supported</span>
        </p>
        <ul className="rpt-notes">
          <li>Only <strong>Groq</strong> lacks diarization; <strong>ElevenLabs</strong> is the only provider with character-level timestamps.</li>
        </ul>

        {/* 4. TECHNICAL */}
        <SectionTitle n="4">Technical implementation (current POC)</SectionTitle>
        <p className="rpt-prose">
          Audio is extracted once via ffmpeg (16 kHz mono WAV), then sent to the chosen provider; every response
          is normalised to a common shape so subtitle/clip logic is provider-agnostic.
          <strong> 6 providers respond synchronously, 6 use async submit-then-poll, and AssemblyAI&apos;s SDK
          handles upload + polling.</strong> 9 of 13 APIs support webhooks, but the POC polls everywhere for
          uniformity (so the webhook column reads &ldquo;not used in POC&rdquo;).
        </p>
        <div className="rpt-scroll">
          <table className="rpt-table">
            <thead>
              <tr>
                <th scope="col">Provider</th><th scope="col" className="c">Request style</th>
                <th scope="col">Polling (interval / timeout)</th><th scope="col">Webhooks (API support)</th>
                <th scope="col">Audio pre-processing</th>
              </tr>
            </thead>
            <tbody>
              {TECH.map((r) => (
                <tr key={r.p} className={r.hl ? 'is-hl' : ''}>
                  <td className="rpt-prov">{r.p}{r.hl ? ' ★' : ''}</td>
                  <td className="rpt-c">{r.style}</td>
                  <td>{r.poll}</td>
                  <td><Mark m={r.hook} t={r.hookT} /></td>
                  <td>{r.prep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="rpt-notes">
          <li><strong>pyannoteAI</strong> uses <code>/v1/diarize</code> (precision-2) + faster-whisper for text — not the documented STT-orchestration bundle.</li>
          <li><strong>Mistral</strong> returns word timestamps only in auto-detect mode (no language set); <strong>OpenAI</strong> diarize is segment-level only and has no chunking yet.</li>
        </ul>

        <footer className="rpt-footer">
          SP Video Editor POC · STT Provider Evaluation · Internal · Verified May 2026<br />
          Source: provider docs &amp; pricing pages verified individually; mirrors the offline summary deck.
        </footer>
      </main>
    </div>
  )
}
