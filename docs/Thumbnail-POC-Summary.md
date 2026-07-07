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

# Thumbnail Selection POC

<p class="subtitle">Pick a video's best frames automatically, then polish them with Gemini and OpenAI to see which looks better.</p>
<p class="meta">Proof of concept · July 2026 · prices and capabilities checked against each provider's own docs.</p>

## 1. Overview &amp; Objective

Upload a video and the module finds the three frames that would make the best thumbnail. For each one it also produces two polished versions, one from Gemini and one from OpenAI, so you can put them next to the raw frame, preview any variant full-size, and download whatever works.

We wanted to answer three things before taking this anywhere near production:

- Can we choose good thumbnail frames on our own, without someone scrubbing the timeline by hand?
- Can an image model actually turn a raw frame into something that looks built for a feed — better lighting, a tighter crop, maybe text?
- Between Gemini and OpenAI, which one is worth using once you weigh cost, how well it keeps the subject, and how much control you get over the output shape?

The pipeline is a funnel, cheapest work first. Local computer vision drops the weak frames for free, a quick vision-model pass ranks what survives for almost nothing, and the expensive image generation only ever runs on the final three. Nothing costly touches a frame that was never going to win.

<div class="page-break"></div>

## 2. POC Workflow

The whole run streams to the UI over SSE, so each stage shows up as it finishes. You choose the reranker before a run, Gemini (default) or OpenAI, and if it errors the pipeline quietly falls back to the other. If no reranker key is set (or every reranker fails), the pipeline keeps the CV-score order instead of aborting. The moment the rerank settles on its top three, the rows appear with their polish cells still loading, and each cell fills in on its own as that image model returns. The pipeline runs in an ephemeral temp dir and reads/writes S3 — the sampled frames and their CV scores are cached in S3, so a second run jumps straight to the paid stages. A short transcript snippet (when the video was transcribed) is fed into both the rerank and polish prompts for topical context. Polish hits both image models at once. Every call is plain REST — we skipped the vendor SDKs because they trailed the API fields we needed.

```
 video upload (existing pipeline)
        │
        ▼
 ┌──────────────────────────── free / local ───────────────────────────┐
 │ 1. ffprobe   size + duration + rotation                               │
 │ 2. ffmpeg    scene-cut-aware sampling: decode keyframes only          │
 │              (-skip_frame nokey), pick scene changes ≥0.3 with a       │
 │              1s min-gap + a 6s coverage floor, 640px yuvj420p JPEG;    │
 │              adaptive-fps fallback only for huge-GOP sources           │
 │ 3. sharp     per-frame stats: brightness, contrast, avg-hash          │
 │ 4. CV score  0.7·contrast + 0.3·mid-grey                              │
 │ 5. dedup     Hamming distance on hash → keep ~12 unique frames        │
 │              (frames + frame_stats.json cached in S3)                  │
 └───────────────────────────────────────────────────────────────────────┘
        │
        ▼
 6. Vision rerank (you pick): Gemini 2.5 Pro OR OpenAI gpt-4.1-mini
        │   score each frame 1–10 + rationale; fallback on failure;
        │   CV-order fallback if no key / all rerankers fail
        │   → top 3 picks stream to UI now   (~$0.01 / ~$0.002 per run)
        ▼
 7. Polish each pick, both providers in parallel (Promise.allSettled):
        ├── Gemini 2.5 Flash Image  → fills variant A cell live
        └── OpenAI gpt-image-1.5    → fills variant B cell live
        ▼
 8. UI grid: 3 picks × { original · Gemini · OpenAI }
        → preview any variant full-size, download the one you want
```

Constants: `MAX_EXTRACT` 60 · `POST_DEDUP_KEEP` 12 · `TOP_PICK_COUNT` 3 · dedup Hamming threshold 8 · transcript hint ≤220 chars (priority `assemblyai` → `deepgram` → `openai`).

<div class="page-break"></div>

## 3. Features &amp; Model Comparison

<p class="legend">✅ Supported &nbsp;·&nbsp; ⚠️ Partial / conditional &nbsp;·&nbsp; ❌ Not supported</p>

| Stage | Vendor · Model | Role |
|---|---|---|
| Vision rerank | Google · `gemini-2.5-pro` *(default)* | Score 8–12 frames 1–10 + 1-line rationale; pick top 3 |
| Vision rerank | OpenAI · `gpt-4.1-mini` *(alt)* | Same; selectable per run, strict JSON, auto-fallback |
| Image polish | Google · `gemini-2.5-flash-image` (Nano Banana) | Edit raw frame → polished thumbnail |
| Image polish | OpenAI · `gpt-image-1.5` (`quality: high`) | Same, in parallel for A/B comparison |

| Capability | Gemini Flash Image (polish) | OpenAI gpt-image-1.5 (polish) |
|---|---|---|
| Image-to-image edit | ✅ `generateContent` | ✅ `/v1/images/edits` |
| Identity preservation | ✅ Built-in ("character consistency") | ✅ via `input_fidelity: high` (explicit knob) |
| Aspect-ratio control | ⚠️ Prompt-only (no REST param) | ✅ Size enum `1024×1024 / 1024×1536 / 1536×1024` |
| Quality tiers | ❌ Single tier | ✅ `low / medium / high` |
| Output format | ❌ PNG only | ✅ `png / jpeg / webp` |
| Mask / inpaint | ❌ | ✅ Optional |
| Watermark | ⚠️ Invisible SynthID on every output | ✅ None |
| Integration | Sync REST (JSON, base64) | Sync REST (multipart form) |

What it comes down to: Gemini is the cheap option and keeps the subject consistent without being told to. OpenAI gives you the real knobs — exact output size, quality tiers, no watermark — but at the `high` quality the code currently runs, it's by far the most expensive part of a job. Neither model is dependable with long text overlays yet, so the plan is to stop asking them to draw text and lay it on ourselves with Canvas or SVG.

> A quick note on OpenAI's lineup, since it moved recently. We're on `gpt-image-1.5`, which is still current. The newer GPT Image 2 (April 2026) is now their default and handles input fidelity on its own, so it's a clean upgrade whenever we want it. The only model actually going away is the original `gpt-image-1`, retiring October 23, 2026.

<div class="page-break"></div>

## 4. Pricing

> Per-call rates checked July 2026 against each provider's pricing page. USD, pay-as-you-go tier.

| Provider · Model | Stage | Rate |
|---|---|---|
| Google · `gemini-2.5-pro` | Vision rerank (default) | **~$0.01** / call ($1.25/M in · $10/M out) |
| OpenAI · `gpt-4.1-mini` | Vision rerank (alt) | **~$0.002** / call ($0.40/M in · $1.60/M out) |
| Google · `gemini-2.5-flash-image` | Image polish | **$0.039** / output image |
| OpenAI · `gpt-image-1.5` | Image polish | **$0.20** `high` · $0.05 `medium` · $0.013 `low` (landscape/portrait) |

**Per video (3 picks, both providers), shown at both OpenAI quality tiers:**

| Stage | Calls | `medium` | `high` *(code default)* |
|---|---|---|---|
| Frame extract + CV scoring (ffmpeg + sharp) | local | $0.00 | $0.00 |
| Vision rerank · Gemini 2.5 Pro | 1 | ~$0.01 | ~$0.01 |
| Polish · Gemini 2.5 Flash Image | 3 | $0.117 | $0.117 |
| Polish · OpenAI gpt-image-1.5 | 3 | $0.150 | $0.600 |
| **Total** | | **~$0.28** | **~$0.73** |

**Cheaper / alternative modes**

| Mode | Cost / video | Note |
|---|---|---|
| Both, OpenAI `high` *(code default)* | ~$0.73 | Max OpenAI fidelity |
| Both, OpenAI `medium` | ~$0.28 | Same A/B, 4× cheaper OpenAI leg |
| Both, OpenAI `low` | ~$0.17 | Cheapest A/B |
| Gemini only | ~$0.13 | Cheapest; identity preserved by default |
| Switch reranker `pro → gpt-4.1-mini` | −~$0.008/run | UI toggle; $0.002 vs $0.01 (marginal) |

> Worth knowing before you run it: OpenAI `quality` is hardcoded to `high` in `openai.js` and the route never overrides it, so a real run lands around $0.73 a video. Switch it to `medium` and the OpenAI side drops by roughly four times. `input_fidelity: high` is on as well, which adds a bit of image-input token cost on `gpt-image-1.5` that the flat per-image prices above leave out.

<div class="page-break"></div>

## 5. References

- Gemini API pricing — <https://ai.google.dev/gemini-api/docs/pricing>
- Gemini 2.5 Flash Image (Nano Banana) announcement — <https://developers.googleblog.com/en/introducing-gemini-2-5-flash-image/>
- OpenAI API pricing — <https://developers.openai.com/api/docs/pricing>
- OpenAI image-generation guide (`input_fidelity`, sizes, cost calc) — <https://developers.openai.com/api/docs/guides/image-generation>
- OpenAI gpt-image-1.5 model card (POC polish model) — <https://developers.openai.com/api/docs/models/gpt-image-1.5>
- OpenAI GPT Image 2 model card (current default flagship) — <https://developers.openai.com/api/docs/models/gpt-image-2>
- OpenAI gpt-4.1-mini model card (alt reranker) — <https://developers.openai.com/api/docs/models/gpt-4.1-mini>
- OpenAI Structured Outputs (`json_schema`) — <https://developers.openai.com/api/docs/guides/structured-outputs>
- Internal deep-dives — `docs/thumbnail-architecture.md` · `docs/thumbnail-features-comparison.md` · `docs/thumbnail-pricing.md` · `docs/thumbnail-providers/*.md`
