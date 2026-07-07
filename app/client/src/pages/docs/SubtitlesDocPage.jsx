// /docs/subtitles — STT provider evaluation + subtitle pipeline.
// Data verified July 2026. Mirrors docs/STT-Provider-POC-Summary.
import { DocShell, SectionTitle, Flow, Mark } from './_shared'

const RECOMMENDATIONS = [
  { tag: '★ Default — best overall value', pick: 'AssemblyAI', price: '$0.17/hr · 99+ languages', pick_: true,
    body: 'Highest accuracy + best-in-class diarization at a low price. Handles multilingual and code-mixed content; generous file/duration limits, no chunking needed.' },
  { tag: 'Cheapest overall', pick: 'Groq', price: '$0.04/hr · fastest',
    body: 'Unbeatable price and speed — but no speaker diarization. Use only for single-speaker content.' },
  { tag: 'Indian / code-mixed content', pick: 'Sarvam AI', price: '~$0.54/hr · 22 Indic langs',
    body: 'Purpose-built for Hinglish / Tanglish and Indian languages. The right call when the audience speaks Indian languages.' },
  { tag: 'Long-form video (> 1 hr)', pick: 'Rev AI', price: '$0.20/hr · up to 17 hr',
    body: 'Most permissive limits (17 hr / 5 TB). No chunking for long podcasts or interviews.' },
  { tag: 'Best for free evaluation', pick: 'pyannoteAI', price: '€0.112/hr · free tier',
    body: 'Diarization-first with voiceprints, at the lowest per-hour rate here. Plan-tiered free hours make it a strong no-cost pilot.' },
]

// Sorted cheapest-first by the with-diarization rate. Model column = the id the
// POC actually pins; newer flagships noted below the table. Verified July 2026.
const PRICING = [
  { p: 'Groq', m: 'whisper-large-v3-turbo', base: '$0.04', diar: 'N/A (no diarize)', lang: '99+', limit: '100 MB', free: 'Free tier' },
  { p: 'pyannoteAI', m: 'precision-2', base: '€0.112', diar: '€0.112', lang: 'Multi', limit: 'Not stated', free: 'Free tier' },
  { p: 'AssemblyAI', m: 'universal-2', base: '$0.15', diar: '$0.17', lang: '99+', limit: '~5 GB / ~10 hr', free: 'Trial credits', hl: true },
  { p: 'Mistral', m: 'voxtral-mini-latest', base: '$0.18', diar: '$0.18', lang: '13', limit: '1 GB / 3 hr', free: 'Limited' },
  { p: 'Rev AI', m: 'reverb-asr', base: '$0.20', diar: '$0.20', lang: '57', limit: '5 TB / 17 hr', free: 'Limited' },
  { p: 'ElevenLabs', m: 'scribe_v2', base: '$0.22', diar: '$0.22', lang: '90+', limit: '3 GB', free: 'Limited' },
  { p: 'OpenAI', m: 'gpt-4o-transcribe-diarize', base: '$0.36', diar: '$0.36', lang: '55+', limit: '25 MB', limitWarn: true, free: 'New acct credits' },
  { p: 'Sarvam AI', m: 'saaras:v3', base: '~$0.36', diar: '~$0.54', lang: '22 Indic', limit: '1 hr (Batch)', free: '₹1,000 credits' },
  { p: 'Deepgram', m: 'nova-3', base: '$0.462', diar: '$0.582', lang: '50+', limit: '2 GB / 10 min', limitWarn: true, free: '$200 credits' },
  { p: 'Gladia', m: 'solaria-1', base: '$0.61', diar: '$0.61', lang: '100+', limit: '1 GB / 135 min', free: '10 hr/mo' },
  { p: 'Speechmatics', m: 'enhanced', base: '$1.04', diar: '$1.04', lang: '55+', limit: '2 hr', free: 'Free tier' },
  { p: 'Sonix', m: 'Sonix AI', base: '$10.00', diar: '$10.00', lang: '53+', limit: '100 MB', free: 'None', freeBad: true },
]

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
]

const TECH = [
  { p: 'AssemblyAI', hl: true, style: 'Async (SDK)', poll: 'SDK-managed (upload + poll)', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'Deepgram', style: 'Sync (SDK)', poll: '—', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'OpenAI', style: 'Sync REST', poll: '—', hook: 'bad', hookT: 'sync, inline', prep: 'WAV → MP3 128 kbps (25 MB)' },
  { p: 'Groq', style: 'Sync REST', poll: '—', hook: 'bad', hookT: 'sync, inline', prep: 'WAV → MP3 128 kbps (100 MB)' },
  { p: 'Mistral', style: 'Sync REST', poll: '—', hook: 'bad', hookT: 'sync, inline', prep: 'WAV' },
  { p: 'ElevenLabs', style: 'Sync REST', poll: '—', hook: 'ok', hookT: 'not used (async mode)', prep: 'WAV' },
  { p: 'Gladia', style: 'Async batch', poll: 'upload → submit → poll · 3 s / 20 min', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'Rev AI', style: 'Async batch', poll: 'submit → poll → fetch · 5 s / 1 hr', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'Speechmatics', style: 'Async batch', poll: 'submit → poll → fetch · 3 s / 10 min', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'Sonix', style: 'Async batch', poll: 'upload → poll → fetch · 3 s / 30 min', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'pyannoteAI', style: 'Async batch', poll: 'presign → upload → submit → poll · 3 s / 20 min', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
  { p: 'Sarvam AI', style: 'Async batch', poll: 'job → upload → start → poll → download · 5 s / 20 min', hook: 'ok', hookT: 'not used in POC', prep: 'WAV' },
]

const FLOW = [
  { n: 1, title: 'Upload video', tone: 'user', detail: 'Multer saves videos/<uuid>/original.<ext> + meta.json.' },
  { n: 2, title: 'Extract audio (once)', tone: 'local', meta: 'ffmpeg · $0', detail: '16 kHz mono WAV; some providers also get a 128 kbps MP3 to fit file-size caps. Cached on disk.' },
  { n: 3, title: 'Transcribe (pick a provider)', tone: 'paid', meta: '$0.04–$10 / hr', detail: '5 providers respond synchronously, 6 submit-then-poll, AssemblyAI’s SDK manages upload + polling. Every response is normalised to one common shape.' },
  { n: 4, title: 'Edit speakers & segments', tone: 'user', detail: 'Rename speaker aliases and fix text in the editor; saved back into the transcription JSON.' },
  { n: 5, title: 'Burn subtitles', tone: 'local', meta: 'ffmpeg · SSE', detail: 'Build a styled .ass file from the transcript, burn it into the video via the ffmpeg ass filter; progress streams over SSE.' },
]

export default function SubtitlesDocPage() {
  return (
    <DocShell
      active="subtitles"
      eyebrow="POC Documentation · Subtitles"
      title="Speech-to-Text Provider Evaluation"
      lede="We integrated and tested 12 STT providers behind one normalised output, then built the subtitle pipeline on top — transcribe, diarize, edit, and burn captions into the video. This is the decision summary: which provider to use, what it costs, and what each supports."
      meta={<>12 providers benchmarked · Prices &amp; features verified <strong>July 2026</strong> · Pipeline: upload → transcribe → diarize → subtitle / clip</>}
    >
      {/* 1. OVERVIEW */}
      <SectionTitle n="1">Overview &amp; objective</SectionTitle>
      <p className="rpt-prose">
        The goal was to find the best speech-to-text provider for subtitles and clip extraction — weighing
        <strong> accuracy, speaker diarization, language coverage, and cost</strong>. Rather than commit to one vendor,
        we wired <strong>12 providers</strong> behind a single normalised result shape, so the subtitle and clip logic
        is provider-agnostic and any provider can be swapped in per video. This page summarises the recommendation,
        pricing, supported features, and how each provider is wired into the POC.
      </p>

      {/* 2. WORKFLOW */}
      <SectionTitle n="2">Workflow</SectionTitle>
      <p className="rpt-sub">Audio is extracted once and reused; the chosen provider transcribes; the result feeds both subtitles and the clips module.</p>
      <Flow steps={FLOW} />

      {/* 3. RECOMMENDATION */}
      <SectionTitle n="3">Recommendation</SectionTitle>
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
        accuracy, features, and cost at $0.17/hr). Use <strong>pyannoteAI</strong> (€0.112/hr) when cost matters
        most and you need diarization, <strong>Groq</strong> ($0.04/hr) for single-speaker content, and
        <strong> Sarvam AI</strong> for Indian-language audiences.
      </p>
      <p className="rpt-callout is-avoid">
        <strong>Watch out:</strong> Sonix is $10/hr and Speechmatics&apos; <code>enhanced</code> jumped to $1.04/hr in 2026;
        Deepgram caps requests at 10 min and OpenAI at 25 MB — both need chunking for full-length video.
      </p>

      {/* 4. PRICING */}
      <SectionTitle n="4">Pricing</SectionTitle>
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
        <li><strong>Speechmatics</strong> restructured in 2026: <code>enhanced</code> batch is now <strong>$1.04/hr</strong> (was $0.24) and Standard is $0.80/hr — but its new <strong>Melia</strong> multilingual model is just <strong>$0.129/hr</strong> (10 hr/mo free), the cheapest multilingual option here.</li>
        <li><strong>pyannoteAI</strong> cut its rate to <strong>€0.112/hr</strong> (was €0.168); free hours are now tied to plan tiers rather than a flat 150-hour grant.</li>
        <li><strong>AssemblyAI</strong> ships a newer <code>universal-3.5-pro</code> flagship ($0.21 base / $0.23 w/ diarization); the POC still pins <code>universal-2</code> ($0.15 / $0.17), which remains available and cheaper.</li>
        <li><strong>Mistral</strong>&apos;s <code>voxtral-mini-latest</code> alias now resolves to <strong>Voxtral Transcribe 2</strong> (price unchanged); <strong>Gladia</strong> added a <code>Solaria-3</code> flagship (same tier; Growth plan reaches $0.20/hr on volume).</li>
        <li><strong>ElevenLabs</strong> Scribe v2 stayed at $0.22/hr; <strong>Sonix</strong> PAYG is still $10/hr (Pro ≈ $2/hr at full usage).</li>
      </ul>

      {/* 5. FEATURES */}
      <SectionTitle n="5">Feature comparison</SectionTitle>
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

      {/* 6. TECHNICAL */}
      <SectionTitle n="6">Technical implementation (current POC)</SectionTitle>
      <p className="rpt-prose">
        Audio is extracted once via ffmpeg (16 kHz mono WAV), then sent to the chosen provider; every response
        is normalised to a common shape so subtitle/clip logic is provider-agnostic.
        <strong> 5 providers respond synchronously, 6 use async submit-then-poll, and AssemblyAI&apos;s SDK
        handles upload + polling.</strong> 9 of 12 APIs support webhooks, but the POC polls everywhere for
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
        SP Video Editor POC · STT Provider Evaluation · Internal · Verified July 2026<br />
        Source: provider docs &amp; pricing pages verified individually; mirrors the offline summary deck.
      </footer>
    </DocShell>
  )
}
