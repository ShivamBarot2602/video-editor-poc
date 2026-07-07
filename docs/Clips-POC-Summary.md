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

<p class="subtitle">Turn a long video into a handful of short, scroll-stopping clips — either an LLM reads the transcript, or Gemini watches the raw video; both pick the best moments, and ffmpeg cuts them on demand.</p>
<p class="meta">Proof of concept · July 2026 · prices and capabilities checked against each provider's own docs.</p>

## 1. Overview &amp; Objective

Point the module at a video and it hands back three to five clip suggestions — each with a start/end, a one-line hook, and a short reason it would do well in a feed. You preview every suggestion in its own player, then download just the ones you want; only at that point does ffmpeg actually cut a file.

The module now ships **two methods**:

- **Subtitles method** — an LLM (OpenAI or Gemini) reads the transcript and picks clips.
- **Video-understanding method** — Gemini **watches** the raw video (audio + frames), needs no transcript, and additionally returns a ready-to-post caption and three thumbnail frames per clip.

We wanted to settle a few things before pushing this further:

- Can a model reliably point at the moments worth clipping — a real hook, a self-contained idea — without anyone scrubbing the timeline?
- Does watching the video beat reading its transcript for picking those moments, and is the extra video-token cost worth it?
- Between OpenAI and Gemini for the subtitles method, which gives better picks once you weigh cost and how well it obeys the duration and range rules?
- Can we keep the expensive work off the critical path — preview for free, cut only on demand — so a run is cheap even when the model suggests five clips and the user keeps none?

Both methods are built on a swappable provider registry and feed the same lazy preview/cut path. The flow is lazy on purpose. Nothing is transcoded to show a suggestion: the preview player streams the original video and simply refuses to play outside the clip window. The only paid video work — the ffmpeg cut — runs the moment you click Download and never before.

<div class="page-break"></div>

## 2. POC Workflow

You pick a method, a duration bucket, and how many clips (3–5), then run it. Each suggestion renders as a card with its own windowed player; Save bookmarks a clip into a library that survives re-runs, and Download triggers the cut.

**Method A — Subtitles.** A transcript is the input, produced upstream by the editor's transcription step (any STT provider); the Clips page reads `transcription_<provider>.json` from the store. If the video has no transcript yet, the page doesn't run anything — it shows a guard and a link back to the editor. One cheap LLM call suggests clips (plain JSON POST, no streaming).

```
 video with transcript  (transcription_<provider>.json from the editor's STT step)
        │
        │  (no transcript → page shows a guard + "Go to editor"; nothing runs)
        ▼
 ┌────────────────────── subtitles method ──────────────────────────────┐
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
        │   ffmpeg frame-accurate cut → cut .mp4 → browser download
        ▼
 8. Save (optional): bookmark the clip into saved_clips.json — survives re-runs
```

**Method B — Video understanding.** No transcript needed. Gemini watches the raw video over a **long-running SSE stream** (`GET /api/clips/:id/suggest/stream?method=video`) and additionally returns a caption + thumbnail frames per clip. An in-flight lock rejects a second concurrent video run for the same video.

```
 raw video  (no transcript required)
        │
        ▼  GET /api/clips/:id/suggest/stream?method=video&count=&bucket=&model=  (SSE)
 ┌────────────────────── video-understanding method ────────────────────┐
 │ 1. upload to Gemini Files API (cached ~46h in gemini_file.json,       │
 │       reused if still ACTIVE)    → SSE: uploading(%) → processing     │
 │ 2. one generateContent (v1beta) with temp 0.2 + responseSchema that   │
 │       PINS the clip count and bounds every start/end/thumbnail to     │
 │       [0,duration]; media resolution drops to LOW for video over 1h   │
 │       → SSE: analyzing                                                 │
 │ 3. normalize (same clamp/snap/de-overlap/rank/truncate) + feasibleCount│
 │ 4. ffmpeg-extract each clip's 3 thumbnail frames → store  → SSE: extracting│
 │ 5. save clips_geminivideo.json  +  debug log                          │
 └───────────────────────────────────────────────────────────────────────┘
        │   → SSE: done { data }  (same preview + on-demand cut as above)
        ▼
 Video clips carry extra fields per clip: caption + thumbnails[] (3 times)
```

<div class="page-break"></div>

## 3. Features &amp; Model Comparison

<p class="legend">✅ Supported &nbsp;·&nbsp; ⚠️ Partial / conditional &nbsp;·&nbsp; ❌ Not supported</p>

| Stage | Vendor · Model | Role |
|---|---|---|
| Subtitles method | OpenAI · `gpt-5.4-mini` | Read transcript, return 3–5 ranked clips with hook + rationale (strict JSON) |
| Subtitles method | Google · `gemini-2.5-pro` | Same; selectable per run, long-context, JSON-by-prompt (v1beta) + defensive parse |
| Video method | Google · `gemini-2.5-flash` | Watch the raw video (audio + frames) → clips + caption + 3 thumbnail times; `responseSchema`-pinned (default) |
| Video method | Google · `gemini-2.5-pro` | Same, sharper instruction-following on long video (~4× the token cost) |
| Transcript (prerequisite, subtitles only) | editor STT step (e.g. AssemblyAI `universal-2`) | Produced upstream by the editor; only the subtitles method needs it — the video method needs no transcript |
| Clip cut | local · ffmpeg (`libx264`/`aac`) | Frame-accurate trim on download; nothing AI, runs on the box |

**Which method to use.** Subtitles is cheapest and great when the value is in what's said. Video understanding wins when the hook is visual, when there's no transcript, and it's the only method that returns captions + thumbnail frames.

| Dimension | Subtitles method | Video-understanding method |
|---|---|---|
| Input needed | ⚠️ transcript (run STT first) | ✅ raw video only |
| Signal used | ✅ spoken words | ✅ visuals + audio |
| Output extras | ❌ no caption / thumbnails | ✅ caption + 3 thumbnails / clip |
| Count guarantee | ⚠️ prompt + normalize | ✅ `responseSchema` pins the count |
| Cost | ✅ fractions of a cent | ⚠️ video tokens — scales with length |
| Progress UI | ⚠️ spinner (plain JSON) | ✅ live SSE phases |

**Subtitles method — OpenAI vs Gemini:**

| Capability | OpenAI gpt-5.4-mini | Gemini 2.5 Pro |
|---|---|---|
| Structured JSON output | ✅ Strict `json_schema` (Structured Outputs) | ⚠️ JSON by prompt + defensive parse (v1beta) |
| System / user split | ✅ `system` + `user` messages | ✅ `systemInstruction` + `contents` |
| Long transcripts | ⚠️ 400K context (transcript capped at ~120K chars, down-sampled if longer) | ✅ 1M context |
| Cost per run | Lower | Higher (but stronger reasoning on long input) |
| Integration | Sync REST (`/v1/chat/completions`) | Sync REST (`:generateContent`) |

What it comes down to: for the subtitles method both obey the duration bucket and count well once the rules live in the system prompt. OpenAI is cheaper and its strict schema means the JSON never needs rescuing; Gemini's million-token window is the better fit when a transcript is very long. The pick is per run, stored per provider (`clips_openai.json` / `clips_gemini.json` / `clips_geminivideo.json`), so you can A/B them on the same video.

> A note on the suggestion JSON. Whatever the model returns is treated as a draft, never trusted as-is: the server clamps every range into the video, snaps edges to transcript segment boundaries (subtitles method), drops overlaps, ranks by score, and truncates to the requested count. It also handles the video method's `caption` + `thumbnails` and logs (not patches) any length-rule violation as a warning. A model that returns garbage ranges yields fewer clips and a warning — never a broken card.

<div class="page-break"></div>

## 4. Pricing

> Per-call rates checked July 2026 against each provider's pricing page. USD, pay-as-you-go tier.

| Provider · Model | Stage | Rate |
|---|---|---|
| OpenAI · `gpt-5.4-mini` | Subtitles suggestion | $0.75 / M input · $4.50 / M output |
| Google · `gemini-2.5-pro` | Subtitles suggestion | $1.25 / M input · $10 / M output (rises to $2.50 / $15 above 200K ctx) |
| Google · `gemini-2.5-flash` | Video understanding | video ≈ 258 tokens/sec ($0.30 / M input) → **~$0.03 / 5 min** at default resolution |
| Google · `gemini-2.5-pro` | Video understanding | ~4× Flash → **~$0.10 / 5 min** |
| local · ffmpeg | Clip cut / preview | $0.00 |
| AssemblyAI · `universal-2` | Transcript (upstream, subtitles only) | $0.15 / hr (+$0.02 / hr diarization) |

**Per subtitles-method run** (one LLM call; cost scales with transcript length):

| Transcript size | OpenAI gpt-5.4-mini | Gemini 2.5 Pro |
|---|---|---|
| Short (~3K tokens in, ~0.3K out) | ~$0.004 | ~$0.007 |
| Long (~10K tokens in, ~0.3K out) | ~$0.009 | ~$0.016 |

**Per video, end to end (clips module only):**

| Step | When | Cost |
|---|---|---|
| Subtitles suggestion (LLM) | every "Suggest clips" | ~$0.004 – $0.02 |
| Video suggestion (Gemini video) | every video run | ~$0.03 / 5 min (Flash) · ~$0.10 / 5 min (Pro) |
| Preview (stream + window) | always | $0.00 |
| Download / cut (ffmpeg) | per clip kept | $0.00 (local CPU) |

> The subtitles method is almost free: a single small LLM call, so re-running to compare providers or re-roll picks costs fractions of a cent. The **video method costs real video tokens** (video ≈ 258 tokens/sec at default resolution, ~4× fewer at LOW), but the Files-API upload cache means a re-run within ~46h re-pays only the analysis, not the upload. Cutting is local and free — keeping ten clips costs the same as keeping none. The one real upstream cost for the subtitles method is the transcript, produced once by the editor's STT step (e.g. AssemblyAI ~$0.15/hr); the video method needs no transcript.

<div class="page-break"></div>

## 5. References

- OpenAI API pricing — <https://developers.openai.com/api/docs/pricing>
- OpenAI gpt-5.4-mini pricing (per-token) — <https://pricepertoken.com/pricing-page/model/openai-gpt-5.4-mini>
- OpenAI GPT-5 mini model card — <https://developers.openai.com/api/docs/models/gpt-5-mini>
- OpenAI Structured Outputs (`json_schema`) — <https://developers.openai.com/api/docs/guides/structured-outputs>
- Gemini API pricing — <https://ai.google.dev/gemini-api/docs/pricing>
- Gemini 2.5 Pro pricing (per-token) — <https://pricepertoken.com/pricing-page/model/google-gemini-2.5-pro>
- Gemini text generation &amp; `system_instruction` (REST) — <https://ai.google.dev/gemini-api/docs/text-generation>
- Gemini video understanding &amp; Files API — <https://ai.google.dev/gemini-api/docs/video-understanding> · <https://ai.google.dev/gemini-api/docs/files>
- AssemblyAI pricing — <https://www.assemblyai.com/pricing>
- Internal deep-dives — `docs/clips-architecture.md` · `docs/clips-providers/openai-clip-suggest.md` · `docs/clips-providers/gemini-clip-suggest.md` · `docs/clips-providers/geminivideo-clip-suggest.md`
