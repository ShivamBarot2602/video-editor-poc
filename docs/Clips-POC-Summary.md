---
pdf_options:
  format: a4
  margin: 18mm 15mm 20mm 15mm
  printBackground: true
css: |
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
         color: #1e293b !important; font-size: 12px; line-height: 1.5; }
  h1, h2, h3, h4 { font-family: inherit !important; font-weight: 700; break-after: avoid; }
  h1 { color: #0f172a !important; font-size: 26px; margin: 0 0 2px; border: none; }
  h1 + p { margin-top: 4px; }
  h2 { color: #1D4ED8 !important; font-size: 17px; margin: 4px 0 9px; padding-bottom: 5px;
       border-bottom: 2px solid #1D4ED8; }
  h3 { color: #1e3a8a !important; font-size: 13.5px; margin: 18px 0 6px; }
  p, li { margin: 6px 0; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 10.5px;
          break-inside: avoid; }
  th { background: #1D4ED8 !important; color: #fff !important; text-align: left; padding: 6px 8px;
       border: 1px solid #1D4ED8; font-weight: 600; }
  td { padding: 5px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f1f5f9 !important; }
  code, pre, pre code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace !important; }
  code { background: #eef2ff !important; color: #3730a3 !important; padding: 1px 4px;
         border-radius: 3px; font-size: 0.85em !important; overflow-wrap: anywhere; }
  pre { background: #f8fafc !important; border: 1px solid #cbd5e1; border-radius: 8px;
        padding: 12px 14px; font-size: 9px !important; line-height: 1.25; overflow-x: auto;
        break-inside: avoid; }
  pre code { background: none !important; color: #0f172a !important; padding: 0;
             font-size: 9px !important; }
  blockquote { margin: 10px 0; padding: 8px 14px; background: #eff6ff !important;
               border-left: 4px solid #1D4ED8; color: #334155 !important; break-inside: avoid; }
  blockquote p { margin: 3px 0; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 18px 0; }
  a { color: #1D4ED8 !important; text-decoration: none; word-break: break-all; }
  strong { color: #0f172a; }
  .subtitle { color: #475569; font-size: 13px; margin: 2px 0 0; }
  .meta { color: #64748b; font-size: 11px; margin-top: 6px; }
  .legend { font-size: 10.5px; color: #475569; }
---

# Video Clips POC

<p class="subtitle">Turn a long video into a handful of short, scroll-stopping clips — an LLM reads the transcript, picks the best moments, and ffmpeg cuts them on demand.</p>
<p class="meta">Proof of concept · June 2026 · prices and capabilities checked against each provider's own docs.</p>

## 1. Overview &amp; Objective

Point the module at a video that already has a transcript and it hands back three to five clip suggestions — each with a start/end, a one-line hook, and a short reason it would do well in a feed. You preview every suggestion in its own player, then download just the ones you want; only at that point does ffmpeg actually cut a file.

We wanted to settle a few things before pushing this further:

- Can an LLM read a plain transcript and reliably point at the moments worth clipping — a real hook, a self-contained idea — without anyone scrubbing the timeline?
- Between OpenAI and Gemini, which gives better picks once you weigh cost and how well it obeys the duration and range rules?
- Can we keep the expensive work off the critical path — preview for free, cut only on demand — so a run is cheap even when the model suggests five clips and the user keeps none?

This is the **transcript-only** stage. It is built on a swappable provider registry so the next iteration — a video-understanding model that watches the visuals and audio, not just the words — drops in as one more provider without reshaping the API or the UI.

The flow is lazy on purpose. Nothing is transcoded to show a suggestion: the preview player streams the original video and simply refuses to play outside the clip window. The only paid video work, the ffmpeg cut, runs the moment you click Download and never before.

<div class="page-break"></div>

## 2. POC Workflow

A transcript is the input. It's produced upstream by the editor's transcription step (any of the STT providers); the Clips page reads `transcription_<provider>.json` off disk. If the video has no transcript yet, the page doesn't run anything — it shows a short notice and a link back to the editor to transcribe first.

With a transcript present you pick which model should suggest (OpenAI or Gemini), a duration bucket, and how many clips, then hit "Suggest clips." Each suggestion renders as a card with its own windowed player; Save bookmarks a clip into a library that survives re-runs, and Download triggers the cut.

```
 video with transcript  (transcription_<provider>.json from the editor's STT step)
        │
        │  (no transcript → page shows a guard + "Go to editor"; nothing runs)
        ▼
 ┌────────────────────── clip suggestion ───────────────────────────────┐
 │ 1. read transcript_<provider>.json  (segments: start/end/text)        │
 │ 2. build SYSTEM prompt (rules + edge cases) + USER prompt (transcript)│
 │ 3. LLM (you pick): OpenAI gpt-5.4-mini  OR  Gemini 2.5 Pro            │
 │       → 3-5 clips: start, end, title, hook, rationale, score          │
 │ 4. normalize: clamp to [0,duration], snap to segment cuts,            │
 │       drop overlaps, rank by score, truncate to N                     │
 │ 5. save clips_<provider>.json  +  debug log (prompts + raw response)  │
 └───────────────────────────────────────────────────────────────────────┘
        │
        ▼
 6. Preview — each clip in its own player, streaming the ORIGINAL video
        │   clamped to [start,end]; no cut, no transcode  ($0)
        ▼
 7. Download (on demand): GET /api/clips/:id/export/stream  (SSE)
        │   ffmpeg frame-accurate cut → clips/<id>.mp4 → browser download
        ▼
 8. Save (optional): bookmark the clip into saved_clips.json — survives re-runs
```

<div class="page-break"></div>

## 3. Features &amp; Model Comparison

<p class="legend">✅ Supported &nbsp;·&nbsp; ⚠️ Partial / conditional &nbsp;·&nbsp; ❌ Not supported</p>

| Stage | Vendor · Model | Role |
|---|---|---|
| Clip suggestion | OpenAI · `gpt-5.4-mini` | Read transcript, return 3–5 ranked clips with hook + rationale (strict JSON) |
| Clip suggestion | Google · `gemini-2.5-pro` | Same; selectable per run, long-context, JSON-by-prompt + defensive parse |
| Transcript (prerequisite) | editor STT step (e.g. AssemblyAI `universal-2`) | Produced upstream by the editor; the Clips module reads it, does not create it |
| Clip cut | local · ffmpeg (`libx264`/`aac`) | Frame-accurate trim on download; nothing AI, runs on the box |

| Capability | OpenAI gpt-5.4-mini | Gemini 2.5 Pro |
|---|---|---|
| Structured JSON output | ✅ Strict `json_schema` (Structured Outputs) | ⚠️ No `responseSchema` on v1 for this model — JSON by prompt + fence-strip parse |
| System / user split | ✅ `system` + `user` messages | ✅ `system_instruction` + `contents` |
| Long transcripts | ⚠️ 400K context (transcript capped at ~120K chars, down-sampled if longer) | ✅ 1M context |
| Cost per run | Lower | Higher (but stronger reasoning on long input) |
| Integration | Sync REST (`/v1/chat/completions`) | Sync REST (`:generateContent`) |

What it comes down to: both obey the duration bucket and count well once the rules live in the system prompt. OpenAI is cheaper and its strict schema means the JSON never needs rescuing; Gemini's million-token window is the better fit when a transcript is very long, and it's the natural bridge to the planned video-understanding step. The pick is per run, stored per provider (`clips_openai.json` / `clips_gemini.json`), so you can A/B them on the same video.

> A note on the suggestion JSON. Whatever the model returns is treated as a draft, never trusted as-is: the server clamps every range into the video, snaps edges to transcript segment boundaries, drops overlaps, ranks by score, and truncates to the requested count. A model that returns garbage ranges yields fewer clips and a warning — never a broken card.

<div class="page-break"></div>

## 4. Pricing

> Per-call rates checked June 2026 against each provider's pricing page. USD, pay-as-you-go tier.

| Provider · Model | Stage | Rate |
|---|---|---|
| OpenAI · `gpt-5.4-mini` | Clip suggestion | $0.75 / M input · $4.50 / M output |
| Google · `gemini-2.5-pro` | Clip suggestion | $1.25 / M input · $10 / M output |
| local · ffmpeg | Clip cut / preview | $0.00 |
| AssemblyAI · `universal-2` | Transcript (upstream, not this module) | $0.15 / hr (+$0.02 / hr diarization) |

**Per suggestion run** (one LLM call; cost scales with transcript length):

| Transcript size | OpenAI gpt-5.4-mini | Gemini 2.5 Pro |
|---|---|---|
| Short (~3K tokens in, ~0.3K out) | ~$0.004 | ~$0.007 |
| Long (~10K tokens in, ~0.3K out) | ~$0.009 | ~$0.016 |

**Per video, end to end (clips module only):**

| Step | When | Cost |
|---|---|---|
| Suggestion run (LLM) | every "Suggest clips" | ~$0.004 – $0.02 |
| Preview (stream + window) | always | $0.00 |
| Download / cut (ffmpeg) | per clip kept | $0.00 (local CPU) |

> The clips module itself is almost free: suggestion is a single small LLM call, so re-running to compare providers or re-roll picks costs fractions of a cent, and the cut is local — keeping ten clips costs the same as keeping none. The one real upstream cost is the transcript, produced once by the editor's STT step (e.g. AssemblyAI ~$0.15/hr); the Clips page requires it but never creates it.

<div class="page-break"></div>

## 5. References

- OpenAI API pricing — <https://developers.openai.com/api/docs/pricing>
- OpenAI gpt-5.4-mini pricing (per-token) — <https://pricepertoken.com/pricing-page/model/openai-gpt-5.4-mini>
- OpenAI GPT-5 mini model card — <https://developers.openai.com/api/docs/models/gpt-5-mini>
- OpenAI Structured Outputs (`json_schema`) — <https://developers.openai.com/api/docs/guides/structured-outputs>
- Gemini API pricing — <https://ai.google.dev/gemini-api/docs/pricing>
- Gemini 2.5 Pro pricing (per-token) — <https://pricepertoken.com/pricing-page/model/google-gemini-2.5-pro>
- Gemini text generation &amp; `system_instruction` (REST) — <https://ai.google.dev/gemini-api/docs/text-generation>
- AssemblyAI pricing — <https://www.assemblyai.com/pricing>
- Internal deep-dives — `docs/clips-architecture.md` · `docs/clips-providers/openai-clip-suggest.md` · `docs/clips-providers/gemini-clip-suggest.md`
