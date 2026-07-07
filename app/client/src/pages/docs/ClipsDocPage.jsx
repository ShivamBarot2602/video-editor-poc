// /docs/clips — clip suggestion via TWO methods: transcript LLM + Gemini video-understanding.
// Synced to current code (services/clips.js, providers/clipSuggest/*, controllers/clips.js) July 2026.
// Pricing rows marked "indicative" are re-verified in the Phase 2 research pass.
import { DocShell, SectionTitle, Flow, Mark } from './_shared'

const MODELS = [
  { stage: 'Subtitles method', who: 'Google · gemini-2.5-pro', tag: 'default', role: 'Read transcript → 3–5 ranked clips (JSON-by-prompt on v1beta + defensive parse; long context)' },
  { stage: 'Subtitles method', who: 'OpenAI · gpt-5.4-mini', tag: 'strict JSON', role: 'Same; Structured Outputs (`json_schema`) so the JSON never needs rescuing' },
  { stage: 'Video method', who: 'Google · gemini-2.5-flash', tag: 'default', role: 'Watch the raw video (audio + frames) → clips + caption + 3 thumbnail times; `responseSchema`-pinned' },
  { stage: 'Video method', who: 'Google · gemini-2.5-pro', tag: 'sharper', role: 'Same, better instruction-following on long video (~4× the token cost)' },
  { stage: 'Transcript (prereq)', who: 'editor STT · e.g. AssemblyAI universal-2', tag: 'subtitles only', role: 'Produced upstream — only the Subtitles method needs it; the Video method needs no transcript' },
  { stage: 'Clip cut', who: 'local · ffmpeg (libx264 / aac + faststart)', tag: 'on download', role: 'Frame-accurate re-encode; runs on the box' },
]

// Subtitles-method provider A/B (OpenAI vs Gemini)
const CAPS = [
  { cap: 'Structured JSON output', o: { m: 'ok', t: 'strict json_schema' }, g: { m: 'warn', t: 'JSON by prompt + parse (v1beta)' } },
  { cap: 'System / user split', o: { m: 'ok', t: 'system + user' }, g: { m: 'ok', t: 'system_instruction' } },
  { cap: 'Long transcripts', o: { m: 'warn', t: 'capped ~120K chars, down-sampled' }, g: { m: 'ok', t: '1M ctx' } },
  { cap: 'Cost per run', o: { m: 'ok', t: 'lower' }, g: { m: 'warn', t: 'higher' } },
]

// When to use which METHOD (subtitles vs video)
const METHOD_CMP = [
  { cap: 'Input needed', s: { m: 'warn', t: 'transcript (run STT first)' }, v: { m: 'ok', t: 'raw video only' } },
  { cap: 'Signal used', s: { m: 'ok', t: 'spoken words' }, v: { m: 'ok', t: 'visuals + audio' } },
  { cap: 'Output extras', s: { m: 'bad', t: 'no caption / thumbnails' }, v: { m: 'ok', t: 'caption + 3 thumbnails / clip' } },
  { cap: 'Count guarantee', s: { m: 'warn', t: 'prompt + normalize' }, v: { m: 'ok', t: 'responseSchema pins count' } },
  { cap: 'Cost', s: { m: 'ok', t: 'fractions of a cent' }, v: { m: 'warn', t: 'video tokens — scales w/ length' } },
  { cap: 'Progress UI', s: { m: 'warn', t: 'spinner' }, v: { m: 'ok', t: 'live SSE phases' } },
]

const RATES = [
  { who: 'OpenAI · gpt-5.4-mini', stage: 'Subtitles suggestion', rate: '$0.75 / M in · $4.50 / M out' },
  { who: 'Google · gemini-2.5-pro', stage: 'Subtitles suggestion', rate: '$1.25 / M in · $10 / M out' },
  { who: 'Google · gemini-2.5-flash', stage: 'Video understanding', rate: '~$0.03 / 5 min ($0.30/M · 258 tok/s)' },
  { who: 'Google · gemini-2.5-pro', stage: 'Video understanding', rate: '~$0.10 / 5 min (~4×)' },
  { who: 'local · ffmpeg', stage: 'Cut / preview', rate: '$0.00' },
  { who: 'AssemblyAI · universal-2', stage: 'Transcript (upstream, subtitles only)', rate: '$0.15 / hr' },
]

const PERRUN = [
  { size: 'Subtitles · short (~3K in · ~0.3K out)', o: '~$0.004', g: '~$0.007' },
  { size: 'Subtitles · long (~10K in · ~0.3K out)', o: '~$0.009', g: '~$0.016' },
]

// Subtitles method (transcript) flow
const FLOW_SUB = [
  { n: 1, title: 'Transcript present', tone: 'out', meta: 'input', detail: 'Produced upstream by the editor’s STT step (transcription_<provider>.json). No transcript → the page guards with a link to the editor; suggestion is blocked.' },
  { n: 2, title: 'Build prompt', tone: 'local', detail: 'Static SYSTEM (rules + edge cases + output shape) + USER (count, bucket MIN/MAX, duration, transcript as one line per segment). Capped at ~120K chars; longer is evenly down-sampled + flagged.' },
  { n: 3, title: 'LLM suggest (pick one)', tone: 'paid', meta: 'plain JSON POST', detail: 'OpenAI gpt-5.4-mini (strict Structured Outputs) or Gemini 2.5 Pro (v1beta, JSON-by-prompt) returns 3–5 clips: start/end/title/hook/rationale/score.' },
  { n: 4, title: 'normalizeClips', tone: 'local', detail: 'Draft, never trusted: coerce ranges, snap edges to segment boundaries (≤0.5s), clamp to [0,dur], drop <1s + overlaps, rank by score, truncate to N.' },
  { n: 5, title: 'Preview (no cut)', tone: 'local', meta: '$0', detail: 'Window-clamped player streams the ORIGINAL (Range-backed); refuses to play outside [start,end]. No transcode.' },
  { n: 6, title: 'Download → cut', tone: 'local', meta: 'ffmpeg · SSE', detail: 'On demand: GET /export/stream re-encodes a frame-accurate cut → S3 → browser download.' },
]

// Video-understanding method flow
const FLOW_VID = [
  { n: 1, title: 'Upload to Gemini Files API', tone: 'paid', meta: 'cached ~46h', detail: 'Reuse a still-ACTIVE cached upload (gemini_file.json) inside a 46h window; else upload + poll until ACTIVE. SSE phases: uploading (percent) → processing.' },
  { n: 2, title: 'Analyze video', tone: 'paid', meta: 'gemini video', detail: 'One generateContent (v1beta) with temp 0.2 + responseSchema that pins exact count and bounds every start/end/thumbnail to [0,duration]. Media resolution drops to LOW for video over 1h. SSE phase: analyzing.' },
  { n: 3, title: 'normalizeClips + feasibleCount', tone: 'local', detail: 'Same clamp/overlap/rank/truncate. Target count = min(requested, floor(duration / bucket-min)) so an over-asked count degrades gracefully with a warning.' },
  { n: 4, title: 'Extract thumbnail frames', tone: 'local', meta: 'ffmpeg · SSE', detail: 'For each clip, ffmpeg-seek its 3 thumbnail timestamps → 640px JPEG → S3; served via GET /thumb/:clipId/:n (302). SSE phase: extracting. A failed extract just drops that one thumb.' },
  { n: 5, title: 'Preview + download', tone: 'local', meta: '$0', detail: 'Same window-clamped preview + on-demand ffmpeg cut as the subtitles method.' },
]

const DECISIONS = [
  ['Two swappable methods behind one UI', 'Subtitles (cheap, transcript) + Video-understanding (Gemini watches). Provider baked into clipId so runs coexist and A/B on the same video.'],
  ['Video method uses responseSchema', 'Pins exact clip count and bounds timestamps to [0,duration] — Flash otherwise hallucinated out-of-range clips that got dropped, leaving fewer than asked.'],
  ['Files-API upload cached ~46h', 'A re-run within the window skips the (slow) re-upload; the cache is re-verified ACTIVE before trust.'],
  ['Output treated as a draft (normalizeClips)', 'LLMs return out-of-range / overlapping / wrong-count clips — clamp + de-overlap + truncate instead of trusting; length violations are logged as warnings, not patched.'],
  ['SSE for the video suggest + every cut', 'The video run (upload→analyze→extract) and the ffmpeg cut both have real streamable progress; the transcript suggest is a single plain-JSON round-trip.'],
  ['Preview streams original + window (no cut)', 'Most suggestions are discarded; transcoding to preview would be wasted work. Only Download cuts.'],
  ['In-flight video lock per videoId', 'The expensive video run is single-flight — a concurrent request for the same video is rejected with a clear message.'],
]

const LIMITS = [
  ['Aspect / format', 'Cut keeps the source aspect', 'Optional 9:16 reframe / crop for vertical feeds.'],
  ['Subtitles on clips', 'None', 'Burn the matching transcript window into the cut.'],
  ['Suggestion caching', 'Re-run overwrites clips_<provider>.json (stale cuts cleaned)', 'Keep a short history / let the user pin a run.'],
  ['Video cost visibility', 'Static cost hint in the UI (Flash ~$0.03/5min)', 'Show the real billed token cost per run after the call.'],
  ['Auth', 'Open endpoints', 'Per-IP rate-limit + auth gate before prod.'],
]

export default function ClipsDocPage() {
  return (
    <DocShell
      active="clips"
      eyebrow="POC Documentation · Clips"
      title="Clip Suggestion — Transcript & Video Understanding"
      lede="Point the module at a video and it hands back three to five short, feed-ready clip suggestions — each with a start/end, a hook, and a reason it works. Two methods: an LLM reads the transcript, or Gemini watches the raw video (audio + frames). You preview every suggestion in its own player, then download only the ones you want; only then does ffmpeg cut a file."
      meta={<>2 methods · 4 models · Code-synced &amp; priced <strong>July 2026</strong> · Pipeline: suggest → preview → cut on demand</>}
    >
      {/* 1. OVERVIEW */}
      <SectionTitle n="1">Overview &amp; objective</SectionTitle>
      <p className="rpt-prose">
        Questions to settle: can a model <strong>reliably point at the moments worth clipping</strong> — a real hook,
        a self-contained idea — without anyone scrubbing the timeline; and does <strong>watching the video beat reading
        its transcript</strong> for picking those moments. The module now ships <strong>two methods</strong>:
        the <strong>Subtitles method</strong> (an LLM reads the transcript — OpenAI or Gemini) and the
        <strong> Video-understanding method</strong> (Gemini watches the raw video and also returns a social caption and
        three thumbnail frames per clip). Both feed the same lazy preview/cut path: nothing is transcoded to show a
        suggestion, and the only paid video work (the ffmpeg cut) runs the moment you click Download.
      </p>

      {/* 2. WORKFLOW */}
      <SectionTitle n="2">Workflow</SectionTitle>
      <p className="rpt-sub"><strong>Method A — Subtitles:</strong> a transcript (from the editor’s STT step) is the input; one cheap LLM call suggests clips.</p>
      <Flow steps={FLOW_SUB} />
      <p className="rpt-sub" style={{ marginTop: 22 }}><strong>Method B — Video understanding:</strong> no transcript; Gemini watches the raw video over a live SSE stream and also returns caption + thumbnail frames.</p>
      <Flow steps={FLOW_VID} />

      {/* 3. MODELS */}
      <SectionTitle n="3">Methods &amp; models</SectionTitle>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr><th scope="col">Stage</th><th scope="col">Vendor · Model</th><th scope="col">Role</th></tr>
          </thead>
          <tbody>
            {MODELS.map((r, i) => (
              <tr key={i}>
                <td className="rpt-prov">{r.stage}</td>
                <td className="rpt-model">{r.who} <span className="doc-pill">{r.tag}</span></td>
                <td>{r.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. WHICH METHOD */}
      <SectionTitle n="4">Which method to use</SectionTitle>
      <p className="rpt-sub">Subtitles is cheapest and great when the value is in what’s said. Video understanding wins when the hook is visual, when there’s no transcript, and it’s the only method that returns captions + thumbnail frames.</p>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col" className="c">Subtitles method</th>
              <th scope="col" className="c">Video-understanding method</th>
            </tr>
          </thead>
          <tbody>
            {METHOD_CMP.map((r) => (
              <tr key={r.cap}>
                <td className="rpt-prov">{r.cap}</td>
                <td className="rpt-c"><Mark {...r.s} /></td>
                <td className="rpt-c"><Mark {...r.v} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rpt-legend">
        <span><Mark m="ok" /> Strong / native</span>
        <span><Mark m="warn" /> Conditional</span>
        <span><Mark m="bad" /> Not available</span>
      </p>

      {/* 5. SUBTITLES A/B */}
      <SectionTitle n="5">Subtitles method — OpenAI vs Gemini</SectionTitle>
      <p className="rpt-sub">Both obey the duration bucket and count once the rules live in the system prompt. OpenAI is cheaper with a strict schema (JSON never needs rescuing); Gemini’s million-token window fits very long transcripts.</p>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col" className="c">OpenAI gpt-5.4-mini</th>
              <th scope="col" className="c">Gemini 2.5 Pro</th>
            </tr>
          </thead>
          <tbody>
            {CAPS.map((r) => (
              <tr key={r.cap}>
                <td className="rpt-prov">{r.cap}</td>
                <td className="rpt-c"><Mark {...r.o} /></td>
                <td className="rpt-c"><Mark {...r.g} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 6. PRICING */}
      <SectionTitle n="6">Pricing</SectionTitle>
      <p className="rpt-sub">USD, pay-as-you-go. Subtitles cost scales with transcript length; video cost scales with length + media resolution (video ≈ 258 tokens/sec at default resolution, ~4× fewer at LOW). Gemini 2.5 Pro input rises to $2.50/M above a 200K-token context.</p>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr><th scope="col">Vendor · Model</th><th scope="col">Stage</th><th scope="col" className="c">Rate</th></tr>
          </thead>
          <tbody>
            {RATES.map((r, i) => (
              <tr key={i}>
                <td className="rpt-model">{r.who}</td>
                <td>{r.stage}</td>
                <td className="rpt-c rpt-num-cell">{r.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rpt-sub" style={{ marginTop: 18 }}>Per subtitles-method run (one LLM call):</p>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr><th scope="col">Transcript size</th><th scope="col" className="c">OpenAI gpt-5.4-mini</th><th scope="col" className="c">Gemini 2.5 Pro</th></tr>
          </thead>
          <tbody>
            {PERRUN.map((r) => (
              <tr key={r.size}>
                <td className="rpt-prov">{r.size}</td>
                <td className="rpt-c rpt-num-cell">{r.o}</td>
                <td className="rpt-c rpt-num-cell">{r.g}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rpt-callout">
        <strong>The subtitles method is almost free:</strong> a single small LLM call, so re-running to compare providers
        costs fractions of a cent. The <strong>video method costs real video tokens</strong> (Flash ~$0.03 / 5 min at default
        resolution, Pro ~4×) but the Files-API upload cache means a re-run within ~46h re-pays only the analysis, not the
        upload. Cutting is local and free — keeping ten clips costs the same as keeping none.
      </p>

      {/* 7. TECHNICAL */}
      <SectionTitle n="7">Technical implementation</SectionTitle>
      <p className="rpt-prose">
        <strong>Endpoints:</strong> <code>POST /api/clips/:id/suggest</code> (subtitles, plain JSON) ·
        <code> GET /suggest/stream?method=video&amp;count=&amp;bucket=&amp;model=</code> (video, SSE) ·
        <code> GET /:id/:suggestProvider</code> (fetch a saved run) · <code>GET|POST /:id/saved</code> +
        <code> DELETE /:id/saved/:savedId</code> (bookmark library) · <code>GET /export/stream</code> (ffmpeg cut, SSE) ·
        <code> GET /thumb/:clipId/:n</code> (clip thumbnail, 302 → S3).
      </p>
      <p className="rpt-prose">
        <strong>SSE events.</strong> Video suggest: <code>start</code> → <code>phase</code> (<code>uploading</code>{' '}
        w/ percent → <code>processing</code> → <code>analyzing</code> → <code>extracting</code>) → <code>done</code>{' '}
        (full saved object) → <code>error</code>. Export cut: <code>start</code> → <code>progress</code> (percent) →{' '}
        <code>done</code> (clipUrl) → <code>error</code>.
      </p>
      <p className="rpt-prose">
        <strong>Storage is S3-backed</strong> (not the local <code>videos/&lt;uuid&gt;/</code> tree): per video the store holds
        <code> clips_openai.json</code> / <code>clips_gemini.json</code> / <code>clips_geminivideo.json</code>,
        <code> saved_clips.json</code>, <code>clip_debug_&lt;provider&gt;.log</code>, the <code>gemini_file.json</code> upload cache,
        clip thumbnail JPEGs, and cut <code>.mp4</code>s. Video-method suggestions carry extra metadata: <code>method</code>,
        <code> feasibleCount</code>, <code>mediaResolution</code>, and per-clip <code>caption</code> + <code>thumbnails[]</code>.
      </p>
      <div className="doc-decisions">
        {DECISIONS.map(([d, why]) => (
          <div key={d} className="doc-decision">
            <p className="doc-decision-d">{d}</p>
            <p className="doc-decision-w">{why}</p>
          </div>
        ))}
      </div>

      {/* 8. LIMITS */}
      <SectionTitle n="8">Limitations &amp; future work</SectionTitle>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr><th scope="col">Area</th><th scope="col">Current</th><th scope="col">Future</th></tr>
          </thead>
          <tbody>
            {LIMITS.map((r) => (
              <tr key={r[0]}>
                <td className="rpt-prov">{r[0]}</td>
                <td>{r[1]}</td>
                <td className="rpt-model">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="rpt-footer">
        SP Video Editor POC · Video Clips · Internal · Code-synced &amp; priced July 2026<br />
        Architecture verified against current code; pricing verified against OpenAI &amp; Gemini docs July 2026.
      </footer>
    </DocShell>
  )
}
