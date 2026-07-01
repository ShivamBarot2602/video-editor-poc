// /docs/thumbnails — auto thumbnail selection + AI polish A/B.
// Mirrors docs/Thumbnail-POC-Summary + docs/thumbnail-architecture. Verified June 2026.
import { DocShell, SectionTitle, Flow, Mark } from './_shared'

const MODELS = [
  { stage: 'Vision rerank', who: 'Google · gemini-2.5-pro', tag: 'default', role: 'Score 8–12 frames 1–10 + 1-line rationale; pick top 3' },
  { stage: 'Vision rerank', who: 'OpenAI · gpt-4.1-mini', tag: 'alt', role: 'Same; selectable per run, strict JSON, auto-fallback' },
  { stage: 'Image polish', who: 'Google · gemini-2.5-flash-image', tag: 'Nano Banana', role: 'Edit raw frame → polished thumbnail' },
  { stage: 'Image polish', who: 'OpenAI · gpt-image-1.5', tag: 'quality: high', role: 'Same, in parallel for A/B comparison' },
]

// capability rows for the polish A/B (gemini vs openai)
const CAPS = [
  { cap: 'Image-to-image edit', g: { m: 'ok', t: 'generateContent' }, o: { m: 'ok', t: '/v1/images/edits' } },
  { cap: 'Identity preservation', g: { m: 'ok', t: 'built-in' }, o: { m: 'ok', t: 'input_fidelity: high' } },
  { cap: 'Aspect-ratio control', g: { m: 'warn', t: 'prompt-only' }, o: { m: 'ok', t: 'size enum' } },
  { cap: 'Quality tiers', g: { m: 'bad', t: 'single tier' }, o: { m: 'ok', t: 'low / med / high' } },
  { cap: 'Output format', g: { m: 'bad', t: 'PNG only' }, o: { m: 'ok', t: 'png / jpeg / webp' } },
  { cap: 'Mask / inpaint', g: { m: 'bad' }, o: { m: 'ok' } },
  { cap: 'Watermark', g: { m: 'warn', t: 'invisible SynthID' }, o: { m: 'ok', t: 'none' } },
]

const RATES = [
  { who: 'Google · gemini-2.5-pro', stage: 'Vision rerank (default)', rate: '~$0.01 / call', note: '$1.25/M in · $10/M out' },
  { who: 'OpenAI · gpt-4.1-mini', stage: 'Vision rerank (alt)', rate: '~$0.002 / call', note: '$0.40/M in · $1.60/M out' },
  { who: 'Google · gemini-2.5-flash-image', stage: 'Image polish', rate: '$0.039 / image', note: 'flat per output' },
  { who: 'OpenAI · gpt-image-1.5', stage: 'Image polish', rate: '$0.20 high', note: '$0.05 medium · $0.013 low' },
]

const PERVIDEO = [
  { mode: 'Both providers · OpenAI high', cost: '~$0.73', note: 'Code default — max OpenAI fidelity', hl: true },
  { mode: 'Both providers · OpenAI medium', cost: '~$0.28', note: 'Same A/B, 4× cheaper OpenAI leg' },
  { mode: 'Both providers · OpenAI low', cost: '~$0.17', note: 'Cheapest A/B' },
  { mode: 'Gemini only', cost: '~$0.13', note: 'Cheapest; identity preserved by default' },
]

const FLOW = [
  { n: 1, title: 'Upload video', tone: 'user', detail: 'Existing upload pipeline → videos/<uuid>/original.<ext>.' },
  { n: 2, title: 'Sample frames + CV score', tone: 'local', meta: 'ffmpeg + sharp · $0', detail: 'ffprobe size/rotation → sample @ 1 fps (640px) → per-frame brightness/contrast/avg-hash → cvScore = 0.7·contrast + 0.3·mid-grey. Cached on disk.' },
  { n: 3, title: 'Dedup', tone: 'local', meta: '$0', detail: 'Hamming distance on the average-hash → keep ~12 unique frames.' },
  { n: 4, title: 'Vision rerank (pick one)', tone: 'paid', meta: '~$0.01 / ~$0.002', detail: 'Gemini 2.5 Pro (default) or OpenAI gpt-4.1-mini score each surviving frame 1–10 with a rationale; auto-fallback to the other on failure. Top 3 stream to the UI immediately.' },
  { n: 5, title: 'Polish top 3 — both providers in parallel', tone: 'paid', detail: 'Promise.allSettled — one provider failing never aborts the run; each cell fills live as its job returns.',
    branches: [
      { title: 'Gemini 2.5 Flash Image', meta: '$0.039 / img', detail: 'Variant A · image-to-image edit, keeps subject by default.' },
      { title: 'OpenAI gpt-image-1.5', meta: '$0.20 high', detail: 'Variant B · exact size, quality tiers, no watermark.' },
    ] },
  { n: 6, title: 'Pick the winner', tone: 'user', detail: '3 picks × { original · Gemini · OpenAI } grid → preview full-size or download any (GET /download).' },
]

const DECISIONS = [
  ['Hybrid CV → VLM funnel', 'Localizes cost; only the best ~12 frames hit the expensive Gemini rerank.'],
  ['Gemini 2.5 Pro default for rerank', 'Strongest multi-image scoring; still cheap (~$0.01/call) vs the polish leg.'],
  ['Run both image-gen providers in parallel', 'The POC outcome is an A/B comparison — show them side by side.'],
  ['Progressive SSE (picks + per-cell polished)', 'Show picks the moment rerank finishes, fill each polish cell as its job returns.'],
  ['fps=1 sampling, not scene-cut', 'Deterministic across all codecs; CV + VLM rerank pick the best frames anyway.'],
  ['Direct axios over vendor SDKs', 'SDKs trailed the fields we needed (input_fidelity, image-out modality).'],
]

const LIMITS = [
  ['Text overlay quality', 'Image-gen mangles long letters', 'Composite text via Canvas/SVG on a textless polished frame.'],
  ['Aspect exactness', 'Gemini has no aspect param; OpenAI sizes are fixed enums', 'Client-side crop / letterbox to exact source dims.'],
  ['Watermark', 'Gemini outputs carry an invisible SynthID', 'Flag for legal review before production.'],
  ['Re-run cost', 'Polish always re-fires (not cached)', '"Freeze candidates, refresh only the selected pick" → ~$0.10 re-runs.'],
  ['Person-manipulation block', 'Gemini real-person rule trips on identity language', 'Pre-classify face-heavy frames; route them to OpenAI only.'],
]

export default function ThumbnailsDocPage() {
  return (
    <DocShell
      active="thumbnails"
      eyebrow="POC Documentation · Thumbnails"
      title="Automatic Thumbnail Selection + AI Polish"
      lede="Upload a video and the module finds the three frames that would make the best thumbnail, then produces two polished versions of each — one from Gemini, one from OpenAI — to compare side by side. The pipeline is a cost funnel: cheap local work first, expensive image generation only on the final three."
      meta={<>4 models · A/B polish (Gemini · OpenAI) · Prices verified <strong>June 2026</strong> · Pipeline: sample → CV score → rerank → polish</>}
    >
      {/* 1. OVERVIEW */}
      <SectionTitle n="1">Overview &amp; objective</SectionTitle>
      <p className="rpt-prose">
        Three questions to answer before this goes anywhere near production:
        can we <strong>choose good thumbnail frames automatically</strong> without scrubbing the timeline;
        can an image model <strong>turn a raw frame into something built for a feed</strong> (lighting, crop, text);
        and <strong>between Gemini and OpenAI, which is worth using</strong> once you weigh cost, subject fidelity,
        and control over the output. The funnel does cheap work first — local CV drops weak frames for free, a quick
        vision pass ranks what survives for almost nothing, and the expensive image generation only ever runs on the final three.
      </p>

      {/* 2. WORKFLOW */}
      <SectionTitle n="2">Workflow</SectionTitle>
      <p className="rpt-sub">The whole run streams to the UI over SSE — picks render the moment rerank finishes; each polish cell fills in on its own. Frame sampling + CV scores are cached, so a second run jumps straight to the paid stages.</p>
      <Flow steps={FLOW} />

      {/* 3. MODELS */}
      <SectionTitle n="3">Models</SectionTitle>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr><th scope="col">Stage</th><th scope="col">Vendor · Model</th><th scope="col">Role</th></tr>
          </thead>
          <tbody>
            {MODELS.map((r) => (
              <tr key={r.who}>
                <td className="rpt-prov">{r.stage}</td>
                <td className="rpt-model">{r.who} <span className="doc-pill">{r.tag}</span></td>
                <td>{r.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. CAPABILITY A/B */}
      <SectionTitle n="4">Polish capability comparison</SectionTitle>
      <p className="rpt-sub">Gemini is the cheap option and keeps the subject consistent without being told. OpenAI gives the real knobs — exact size, quality tiers, no watermark — but at the <code>high</code> quality the code runs, it is by far the most expensive part of a job.</p>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col" className="c">Gemini 2.5 Flash Image</th>
              <th scope="col" className="c">OpenAI gpt-image-1.5</th>
            </tr>
          </thead>
          <tbody>
            {CAPS.map((r) => (
              <tr key={r.cap}>
                <td className="rpt-prov">{r.cap}</td>
                <td className="rpt-c"><Mark {...r.g} /></td>
                <td className="rpt-c"><Mark {...r.o} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rpt-legend">
        <span><Mark m="ok" /> Supported</span>
        <span><Mark m="warn" /> Partial / conditional</span>
        <span><Mark m="bad" /> Not supported</span>
      </p>
      <p className="rpt-callout">
        <strong>On OpenAI&apos;s lineup:</strong> we run <code>gpt-image-1.5</code>, still current. The newer <strong>GPT Image 2</strong> (April 2026)
        is now their default and handles input fidelity on its own — a clean upgrade whenever we want it. Only the original
        <code> gpt-image-1</code> is retiring (Oct 23, 2026). Neither model is dependable with long text overlays yet, so the plan
        is to stop asking them to draw text and composite it ourselves.
      </p>

      {/* 5. PRICING */}
      <SectionTitle n="5">Pricing</SectionTitle>
      <p className="rpt-sub">USD, pay-as-you-go. Per-call rates checked June 2026 against each provider&apos;s pricing page.</p>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr><th scope="col">Vendor · Model</th><th scope="col">Stage</th><th scope="col" className="c">Rate</th><th scope="col">Note</th></tr>
          </thead>
          <tbody>
            {RATES.map((r) => (
              <tr key={r.who}>
                <td className="rpt-model">{r.who}</td>
                <td>{r.stage}</td>
                <td className="rpt-c rpt-num-cell">{r.rate}</td>
                <td className="rpt-model">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rpt-sub" style={{ marginTop: 18 }}>Cost per video (3 picks), by mode:</p>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr><th scope="col">Mode</th><th scope="col" className="c">Cost / video</th><th scope="col">Note</th></tr>
          </thead>
          <tbody>
            {PERVIDEO.map((r) => (
              <tr key={r.mode} className={r.hl ? 'is-hl' : ''}>
                <td className="rpt-prov">{r.mode}</td>
                <td className="rpt-c rpt-num-cell">{r.cost}</td>
                <td className="rpt-model">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rpt-callout is-avoid">
        <strong>Worth knowing:</strong> OpenAI <code>quality</code> is hardcoded to <code>high</code> in <code>openai.js</code>,
        so a real run lands ~$0.73/video. Switch it to <code>medium</code> and the OpenAI leg drops ~4×.
        <code> input_fidelity: high</code> is also on, adding a little image-input token cost the flat per-image prices omit.
      </p>

      {/* 6. TECHNICAL */}
      <SectionTitle n="6">Technical implementation</SectionTitle>
      <p className="rpt-prose">
        One SSE endpoint (<code>GET /api/thumbnails/:id/stream?reranker=</code>) drives the whole pipeline, emitting
        <code> phase</code> → <code>picks</code> → per-cell <code>polished</code> → <code>done</code>. Frame stats are cached
        in <code>frame_stats.json</code>; rerank and polish re-run on every click. An <code>inFlightRuns</code> guard returns 409
        on re-entry so an EventSource reconnect can&apos;t re-fire the paid pipeline. All calls are plain REST (axios), not vendor SDKs.
      </p>
      <div className="doc-decisions">
        {DECISIONS.map(([d, why]) => (
          <div key={d} className="doc-decision">
            <p className="doc-decision-d">{d}</p>
            <p className="doc-decision-w">{why}</p>
          </div>
        ))}
      </div>

      {/* 7. LIMITS */}
      <SectionTitle n="7">Limitations &amp; future work</SectionTitle>
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
        SP Video Editor POC · Thumbnail Selection · Internal · Verified June 2026<br />
        Source: Gemini &amp; OpenAI pricing / model docs verified individually; mirrors the offline summary deck.
      </footer>
    </DocShell>
  )
}
