// /docs/clips — LLM clip suggestion from a transcript + lazy ffmpeg cut.
// Mirrors docs/Clips-POC-Summary + docs/clips-architecture. Verified June 2026.
import { DocShell, SectionTitle, Flow, Mark } from './_shared'

const MODELS = [
  { stage: 'Clip suggestion', who: 'OpenAI · gpt-5.4-mini', tag: 'strict JSON', role: 'Read transcript, return 3–5 ranked clips with hook + rationale' },
  { stage: 'Clip suggestion', who: 'Google · gemini-2.5-pro', tag: 'long-context', role: 'Same; selectable per run, JSON-by-prompt + defensive parse' },
  { stage: 'Transcript (prereq)', who: 'editor STT · e.g. AssemblyAI universal-2', tag: 'upstream', role: 'Produced by the editor — the Clips module reads it, never creates it' },
  { stage: 'Clip cut', who: 'local · ffmpeg (libx264 / aac)', tag: 'on download', role: 'Frame-accurate trim; nothing AI, runs on the box' },
]

const CAPS = [
  { cap: 'Structured JSON output', o: { m: 'ok', t: 'strict json_schema' }, g: { m: 'warn', t: 'JSON by prompt + parse' } },
  { cap: 'System / user split', o: { m: 'ok', t: 'system + user' }, g: { m: 'ok', t: 'system_instruction' } },
  { cap: 'Long transcripts', o: { m: 'warn', t: '400K ctx, capped ~120K chars' }, g: { m: 'ok', t: '1M ctx' } },
  { cap: 'Cost per run', o: { m: 'ok', t: 'lower' }, g: { m: 'warn', t: 'higher' } },
]

const RATES = [
  { who: 'OpenAI · gpt-5.4-mini', stage: 'Clip suggestion', rate: '$0.75 / M in · $4.50 / M out' },
  { who: 'Google · gemini-2.5-pro', stage: 'Clip suggestion', rate: '$1.25 / M in · $10 / M out' },
  { who: 'local · ffmpeg', stage: 'Clip cut / preview', rate: '$0.00' },
  { who: 'AssemblyAI · universal-2', stage: 'Transcript (upstream, not this module)', rate: '$0.15 / hr (+$0.02 diarization)' },
]

const PERRUN = [
  { size: 'Short (~3K in · ~0.3K out)', o: '~$0.004', g: '~$0.007' },
  { size: 'Long (~10K in · ~0.3K out)', o: '~$0.009', g: '~$0.016' },
]

const FLOW = [
  { n: 1, title: 'Transcript present', tone: 'out', meta: 'input', detail: 'Produced upstream by the editor’s STT step (transcription_<provider>.json). No transcript → the page shows a guard with a link to the editor; nothing runs.' },
  { n: 2, title: 'Build prompt', tone: 'local', detail: 'SYSTEM (static rules + edge cases + output shape) + USER (count, length bucket, duration, transcript as one line per segment). Capped at ~120K chars; longer is down-sampled and flagged.' },
  { n: 3, title: 'LLM suggest (pick one)', tone: 'paid', meta: '~$0.004–0.02 / run', detail: 'OpenAI gpt-5.4-mini (strict Structured Outputs) or Gemini 2.5 Pro (JSON-by-prompt) returns 3–5 clips: start, end, title, hook, rationale, score.' },
  { n: 4, title: 'normalizeClips', tone: 'local', detail: 'The output is a draft, never trusted: clamp ranges to [0,duration], snap edges to segment cuts, drop overlaps, rank by score, truncate to N. Garbage ranges → fewer clips + a warning, never a broken card.' },
  { n: 5, title: 'Preview (no cut)', tone: 'local', meta: '$0', detail: 'Each clip mounts a window-clamped player that streams the ORIGINAL video (Range-backed) and refuses to play outside [start,end]. No transcode.' },
  { n: 6, title: 'Download → cut', tone: 'local', meta: 'ffmpeg · SSE · $0', detail: 'On demand only: GET /api/clips/:id/export/stream re-encodes a frame-accurate cut → clips/<id>.mp4 → browser download.' },
]

const DECISIONS = [
  ['Swappable clipSuggest registry', 'A/B providers per run; a future video-understanding model drops in unchanged.'],
  ['Output treated as a draft (normalizeClips)', 'LLMs return out-of-range / overlapping / wrong-count clips — clamp + de-overlap + truncate instead of trusting.'],
  ['Preview streams original + window (no cut)', 'Most suggestions are discarded; transcoding to preview would be wasted work.'],
  ['Re-encode cut, not -c copy', '-c copy snaps to keyframes (off by seconds); re-encode is frame-accurate.'],
  ['Plain JSON suggest, SSE only for export', 'A single LLM round-trip has no progress worth streaming; the ffmpeg cut does.'],
  ['Provider baked into clipId + filename', 'gemini-clip-01 vs openai-clip-01 coexist; every cut traces back to its model + index.'],
]

const LIMITS = [
  ['Signal', 'Transcript only (words)', 'Video-understanding model that scores visuals + audio, added as another provider.'],
  ['Missing transcript', 'Page blocks with a guard linking to the editor', 'Auto-transcribe inline with a default provider.'],
  ['Aspect / format', 'Cut keeps the source aspect', 'Optional 9:16 reframe / crop for vertical feeds.'],
  ['Subtitles on clips', 'None', 'Burn the matching transcript window into the cut.'],
  ['Suggestion caching', 'Re-run overwrites clips_<provider>.json', 'Keep a short history / let the user pin a run.'],
]

export default function ClipsDocPage() {
  return (
    <DocShell
      active="clips"
      eyebrow="POC Documentation · Clips"
      title="LLM Clip Suggestion from Transcript"
      lede="Point the module at a transcribed video and it hands back three to five clip suggestions — each with a start/end, a one-line hook, and a reason it would do well in a feed. You preview every suggestion in its own player, then download only the ones you want; only then does ffmpeg actually cut a file."
      meta={<>2 suggestion models · Transcript-only stage · Prices verified <strong>June 2026</strong> · Pipeline: transcript → suggest → preview → cut on demand</>}
    >
      {/* 1. OVERVIEW */}
      <SectionTitle n="1">Overview &amp; objective</SectionTitle>
      <p className="rpt-prose">
        Questions to settle before pushing this further: can an LLM <strong>read a plain transcript and reliably point at the
        moments worth clipping</strong> — a real hook, a self-contained idea — without anyone scrubbing the timeline; and
        <strong> between OpenAI and Gemini, which gives better picks</strong> once you weigh cost and how well it obeys the duration
        and range rules. This is the <strong>transcript-only</strong> stage, built on a swappable provider registry so the next
        iteration — a video-understanding model that watches visuals and audio, not just words — drops in as one more provider.
        The flow is lazy on purpose: nothing is transcoded to show a suggestion, and the only paid video work (the ffmpeg cut) runs the moment you click Download.
      </p>

      {/* 2. WORKFLOW */}
      <SectionTitle n="2">Workflow</SectionTitle>
      <p className="rpt-sub">A transcript is the input, produced upstream by the editor&apos;s STT step. Suggestion is one cheap LLM call; preview is free; the cut is local and on-demand.</p>
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

      {/* 4. PROVIDER A/B */}
      <SectionTitle n="4">Provider comparison</SectionTitle>
      <p className="rpt-sub">Both obey the duration bucket and count well once the rules live in the system prompt. OpenAI is cheaper with a strict schema (JSON never needs rescuing); Gemini&apos;s million-token window fits very long transcripts and is the natural bridge to the planned video-understanding step.</p>
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
      <p className="rpt-legend">
        <span><Mark m="ok" /> Supported</span>
        <span><Mark m="warn" /> Partial / conditional</span>
        <span><Mark m="bad" /> Not supported</span>
      </p>

      {/* 5. PRICING */}
      <SectionTitle n="5">Pricing</SectionTitle>
      <p className="rpt-sub">USD, pay-as-you-go. Per-token rates checked June 2026; cost scales with transcript length.</p>
      <div className="rpt-scroll">
        <table className="rpt-table">
          <thead>
            <tr><th scope="col">Vendor · Model</th><th scope="col">Stage</th><th scope="col" className="c">Rate</th></tr>
          </thead>
          <tbody>
            {RATES.map((r) => (
              <tr key={r.who}>
                <td className="rpt-model">{r.who}</td>
                <td>{r.stage}</td>
                <td className="rpt-c rpt-num-cell">{r.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rpt-sub" style={{ marginTop: 18 }}>Per suggestion run (one LLM call):</p>
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
        <strong>The clips module itself is almost free:</strong> suggestion is a single small LLM call (re-running to compare
        providers costs fractions of a cent), and the cut is local — keeping ten clips costs the same as keeping none. The one
        real upstream cost is the transcript, produced once by the editor&apos;s STT step.
      </p>

      {/* 6. TECHNICAL */}
      <SectionTitle n="6">Technical implementation</SectionTitle>
      <p className="rpt-prose">
        <code>POST /api/clips/:id/suggest</code> runs the LLM and writes <code>clips_&lt;provider&gt;.json</code> (plus a debug log of
        the exact prompts + raw response). The cut is a separate SSE endpoint, <code>/export/stream</code>, reusing the burn route&apos;s
        progress pattern. Suggestions are volatile (a re-run overwrites them and deletes stale cuts); a separate
        <code> saved_clips.json</code> library holds stable bookmarks with their own ids. The preview <code>ClipPlayer</code> hides native
        controls and clamps every seek back into <code>[start,end]</code> so the user physically can&apos;t scrub past the window.
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
        SP Video Editor POC · Video Clips · Internal · Verified June 2026<br />
        Source: OpenAI &amp; Gemini pricing / model docs verified individually; mirrors the offline summary deck.
      </footer>
    </DocShell>
  )
}
