# Thumbnail POC — Architecture

> Pipeline that turns a raw uploaded video into 3 thumbnail candidates, each shown alongside two AI-polished variants (Gemini · OpenAI) for side-by-side comparison.

---

## End-to-end flow

```
User uploads video
       │
       ▼
videos/<uuid>/original.<ext>   (existing upload pipeline)
       │
       ▼
User clicks "Generate Candidates"
       │
       ▼
GET /api/thumbnails/:videoId/stream   (SSE — EventSource)
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  Pipeline orchestrator (Express, SSE)                     │
│                                                            │
│  1.  ffprobe       size + duration + rotation             │
│       │                                                    │
│       ▼                                                    │
│  2.  ffmpeg        sample frames at 1 fps                 │
│       │            (fps=1, scale=640:-2, format=yuvj420p) │
│       ▼                                                    │
│  3.  sharp         per-frame stats (meanY, stdY,          │
│       │            clipFrac, 8×8 average-hash)            │
│       ▼                                                    │
│  4.  CV scorer     cvScore = 0.7·stdNorm + 0.3·midGrey    │
│       │                                                    │
│       ▼                                                    │
│  5.  Hamming dedup keep top ~12 unique frames             │
│       │                                                    │
│       ▼                                                    │
│  6.  Vision rerank (selectable per run):                  │
│       │   Gemini 2.5 Pro (default) OR OpenAI gpt-4.1-mini  │
│       │   per-image 1–10 + rationale; auto-fallback to     │
│       │   the other provider on failure                    │
│       ▼                                                    │
│  7.  Top 3 picks  ── emit 'picks' (rows render now) ──►    │
│       │                                                    │
│       ├──► Gemini 2.5 Flash Image    polish (3 calls)    │
│       │                                                    │
│       └──► OpenAI gpt-image-1.5      polish (3 calls)    │
│                  (Promise.allSettled — runs in parallel)  │
│       │                                                    │
│       ▼                                                    │
│  8.  thumbnails.json + frames/ + thumbnails/polished/     │
└──────────────────────────────────────────────────────────┘
       │
       ▼
SSE progressive stream:
  'picks'    → rows render, polish cells loading
  'polished' → each cell fills live as its job finishes
  'done'     → full saved state (enables selection)
       │
       ▼
UI grid: 3 picks × { original · Gemini polish · OpenAI polish }
       │
       ▼
PATCH /api/thumbnails/:id  with selectedKey
```

---

## Why a hybrid funnel

Each downstream stage costs more than the one before it. Cheap CV filtering up front keeps the expensive AI calls focused on the best candidates.

| Stage | Cost per video | Provider |
|---|---|---|
| 1–5. Sampling + CV scoring + dedup | $0 | Local ffmpeg + sharp |
| 6. Vision rerank | ~$0.01 | Gemini 2.5 Pro |
| 7. Polish × 3 | $0.117 | Gemini 2.5 Flash Image |
| 7. Polish × 3 | $0.600 | OpenAI gpt-image-1.5 (`high`, code default) |
| | **~$0.73** | (OpenAI `medium` → ~$0.28) |

Frame extraction + CV scoring are cached on disk; re-running on the same video only re-incurs the rerank + polish cost. OpenAI `quality` defaults to `high` in code — `medium` cuts the OpenAI leg 4×. See `thumbnail-pricing.md`.

---

## On-disk layout per video

```
videos/<uuid>/
├── original.mp4                       (source upload)
├── meta.json                          (filename, size, uploadedAt)
├── frames/
│   ├── frame_000_t0.50.jpg            (~30-60 stills, 640px JPEG)
│   ├── frame_001_t1.61.jpg
│   └── …
├── frame_stats.json                   (sharp stats + aHash + cvScore — cached)
├── thumbnails/
│   └── polished/
│       ├── 12_gemini.png              (~150 KB)
│       ├── 12_openai.png
│       └── …
└── thumbnails.json                    (final state — see below)
```

**`thumbnails.json` shape**

```json
{
  "generatedAt": "2026-06-01T11:42:00Z",
  "rerankProvider": "gemini",
  "rerankModel": "gemini-2.5-pro",
  "polishModels": ["gemini-2.5-flash-image", "gpt-image-1.5"],
  "video": { "width": 2560, "height": 1440, "aspect": "landscape", "ratio": 1.778 },
  "pipeline": { "framesExtracted": 18, "afterDedup": 12, "topPicks": 3 },
  "candidates": [
    {
      "idx": 12,
      "t": 4.8,
      "originalUrl": "/api/thumbnails/<id>/file/frames%2F...",
      "cvScore": 0.72,
      "vlmScore": 8.5,
      "rationale": "Direct eye contact, neutral background, well-lit",
      "recommended": true,
      "polished": {
        "gemini": { "url": "...", "status": "ok", "model": "gemini-2.5-flash-image" },
        "openai": { "url": "...", "status": "ok", "model": "gpt-image-1.5" }
      }
    }
  ],
  "selectedKey": "12_gemini"
}
```

---

## Server endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/thumbnails/:videoId` | GET | Fetch stored thumbnails.json |
| `/api/thumbnails/:videoId` | PATCH | Set `selectedKey` |
| `/api/thumbnails/:videoId/stream?reranker=` | GET (SSE) | Trigger pipeline; stream phase/picks/polished events. `reranker=gemini\|openai` (default `gemini`) |
| `/api/thumbnails/:videoId/file/:relpath` | GET | Serve a frame or polished image |

## SSE event types

| Event | Fields | Emitted when |
|---|---|---|
| `start` | — | Pipeline begins |
| `phase` | `phase`, `count?`, `cached?`, `skipped?`, `provider?`, `model?`, `fallback?` | Stage transition (rerank carries provider/model/fallback) |
| `picks` | `picks[]` (idx, t, originalUrl, cvScore, vlmScore, rationale), `providers[]`, `rerankProvider`, `rerankModel`, `video` | Rerank done — rows can render with cells pending |
| `polished` | `idx`, `provider`, `url`, `model` | A polish job completes (cell fills live) |
| `polish_failed` | `idx`, `provider`, `message` | A polish job fails |
| `warn` | `stage`, `message` | Non-fatal warning |
| `done` | `state` (full thumbnails.json) | Pipeline finished |
| `error` | `message` | Pipeline aborted |

---

## Caching + re-run semantics

| Stage | Cached? |
|---|---|
| Frame extraction + CV scoring | ✅ Yes (`frame_stats.json`) |
| Vision rerank | ❌ Re-runs every click |
| Image polish | ❌ Re-runs every click |

Re-runs cost the same as fresh runs because polish always re-fires. A future "freeze candidates, refresh polish only on the selected pick" mode would drop re-run cost to ~$0.10.

---

## Failure handling

- **Gemini block (`blockReason: 'OTHER'`)** — surfaced with hint: "Common cause: real-person manipulation rule." Prompt has been softened to avoid identity-preservation language.
- **OpenAI `Invalid body: failed to parse multipart/form-data`** — fixed by switching to `axios.post(form)` (node native `fetch` doesn't stream `form-data` correctly).
- **Per-provider failure** — `Promise.allSettled` means one provider failing does not abort the run. UI shows "polish failed" for that cell; the other provider's output still appears.
- **SSE auto-reconnect** — `inFlightRuns` Set keyed by `videoId` returns 409 on re-entry, prevents EventSource reconnect storms re-firing the ~$0.73/run pipeline (OpenAI `high`; ~$0.28 at `medium`).

---

## Decisions made

| Decision | Why |
|---|---|
| Hybrid CV → VLM funnel | Localizes cost; only the best ~12 frames hit the expensive Gemini rerank |
| Gemini 2.5 Pro default for rerank | Strongest multi-image scoring; still cheap (~$0.01/call) vs the polish leg |
| Selectable reranker + auto-fallback | Rerank is single-output (one ranking → picks), so pick one per run via UI; `gpt-4.1-mini` (~$0.002, strict JSON) is the cheaper alt; fall back to the other if the chosen one errors |
| Progressive SSE (`picks` + per-cell `polished`) | Show picks the moment rerank finishes and fill each polish cell as its job returns, instead of waiting for `done` |
| Run both image-gen providers in parallel | POC outcome is an A/B comparison |
| `fps=1` sampling, not scene-cut | Deterministic across all codecs; CV + VLM rerank pick the best frames anyway |
| EventSource over fetch+ReadableStream | fetch was buffered end-to-end by Vite dev proxy |
| Direct axios over vendor SDKs | SDKs predate the fields we need (`input_fidelity`, image-out modality) |
| Soften polish prompt | "preserve identity / facial features" trips Gemini's real-person rule |

---

## Limitations / future work

| Area | Current | Future |
|---|---|---|
| Blur detection | Luma std-dev proxy via sharp | Real Laplacian-variance via Python+OpenCV sidecar |
| Scene-cut sampling | Disabled (deterministic 1 fps only) | Add `scdet` pass for cut-aware sampling |
| Person manipulation block | Prompt-softening workaround | Pre-classify frames; route face-heavy ones to OpenAI only |
| Text overlay quality | Image-gen mangles letters sometimes | Composite text via Canvas/SVG on textless polished frame |
| Aspect exactness | 9:16 source → 1024×1536 = 2:3 from OpenAI; Gemini has no aspect param | Client-side crop/letterbox to exact source dims |
| Watermark | Gemini outputs include invisible SynthID | Flag for legal review before production |
| Clip-level thumbnails | Whole-video only | Integrate with clip-detection POC |
| Authentication | Open endpoints | Per-IP rate-limit + auth gate before prod |
