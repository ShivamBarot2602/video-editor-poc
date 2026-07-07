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
│  Runs in an ephemeral temp dir; reads/writes S3           │
│                                                            │
│  1.  ffprobe       size + duration + rotation             │
│       │                                                    │
│       ▼                                                    │
│  2.  ffmpeg        scene-cut-aware sampling:              │
│       │            decode keyframes only (-skip_frame     │
│       │            nokey), select scene ≥0.3 w/ 1s min-   │
│       │            gap + 6s coverage floor, metadata=     │
│       │            print for exact pts, scale=640:-2,     │
│       │            format=yuvj420p; adaptive-fps fallback │
│       │            only for huge-GOP (<8 frames)          │
│       ▼                                                    │
│  3.  sharp         per-frame stats (meanY, stdY,          │
│       │            clipFrac, 8×8 average-hash)            │
│       ▼                                                    │
│  4.  CV scorer     cvScore = 0.7·stdNorm + 0.3·midGrey    │
│       │            (frames + frame_stats.json → S3)       │
│       ▼                                                    │
│  5.  Hamming dedup keep top ~12 unique frames (thr 8)     │
│       │                                                    │
│       ▼                                                    │
│  6.  Vision rerank (selectable per run):                  │
│       │   Gemini 2.5 Pro (default) OR OpenAI gpt-4.1-mini  │
│       │   per-image 1–10 + rationale; auto-fallback to     │
│       │   the other provider on failure; CV-order          │
│       │   fallback if no key / all rerankers fail          │
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
│      (all in S3)                                          │
└──────────────────────────────────────────────────────────┘
       │
       ▼
SSE progressive stream:
  'picks'    → rows render, polish cells loading
  'polished' → each cell fills live as its job finishes
  'done'     → full saved state
       │
       ▼
UI grid: 3 picks × { original · Gemini polish · OpenAI polish }
       │
       ▼
Preview any variant full-size (Lightbox) · download any variant
(GET /:id/download/:relpath) — no selection / no PATCH
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

Frame extraction + CV scoring are cached in S3 (`frames/` + `frame_stats.json`); re-running on the same video hydrates them back into the temp dir and only re-incurs the rerank + polish cost. OpenAI `quality` defaults to `high` in code — `medium` cuts the OpenAI leg 4×. See `thumbnail-pricing.md`.

---

## Storage layout per video (S3-backed)

The pipeline runs inside an ephemeral temp dir and reads/writes everything through the S3-backed store (`store.uploadFrames` / `writePolishedImage` / `writeThumbnailState`). The logical file names below all live in S3 under the video's prefix — nothing is persisted on the server's local disk.

```
<s3-prefix>/<uuid>/
├── original.mp4                       (source upload)
├── meta.json                          (filename, size, uploadedAt)
├── frames/
│   ├── frame_000_t0.50.jpg            (~8-60 stills, 640px JPEG — cached)
│   ├── frame_001_t1.61.jpg
│   └── …
├── frame_stats.json                   (sharp stats + aHash + cvScore — cached; hydrated back on re-run)
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
  "generatedAt": "2026-07-01T11:42:00Z",
  "rerankProvider": "gemini",
  "rerankModel": "gemini-2.5-pro",
  "polishModels": ["gemini-2.5-flash-image", "gpt-image-1.5"],
  "video": { "width": 2560, "height": 1440, "aspect": "landscape", "ratio": 1.778 },
  "pipeline": { "framesExtracted": 18, "afterDedup": 12, "topPicks": 3 },
  "candidates": [
    {
      "idx": 12,
      "t": 4.8,
      "originalPath": "frames/frame_012_t4.80.jpg",
      "originalUrl": "/api/thumbnails/<id>/file/frames%2F...",
      "cvScore": 0.72,
      "vlmScore": 8.5,
      "rationale": "Direct eye contact, neutral background, well-lit",
      "recommended": true,
      "polished": {
        "gemini": { "path": "...", "url": "...", "status": "ok", "model": "gemini-2.5-flash-image" },
        "openai": { "path": "...", "url": "...", "status": "ok", "model": "gpt-image-1.5" }
      }
    }
  ]
}
```

There is no `selectedKey` and no server-side notion of a selected pick — the UI lets the user preview any variant full-size and download the one they want.

---

## Server endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/thumbnails/:videoId` | GET | Fetch stored thumbnails.json |
| `/api/thumbnails/:videoId/stream?reranker=` | GET (SSE) | Trigger pipeline; stream phase/picks/polished events. `reranker=gemini\|openai` (default `gemini`) |
| `/api/thumbnails/:videoId/file/:relpath` | GET | Serve a frame or polished image — traversal-guarded, **302 redirect to the public S3 URL** |
| `/api/thumbnails/:videoId/download/:relpath` | GET | Force-download a variant — proxies the bytes same-origin with `Content-Disposition: attachment` (a redirect would open inline) |

There is **no PATCH / "select" route**. The final user action is to preview any variant full-size and download the one they want.

## SSE event types

| Event | Fields | Emitted when |
|---|---|---|
| `start` | — | Pipeline begins |
| `phase` | `phase`, `count?`, `cached?`, `skipped?`, `provider?`, `model?`, `fallback?`, `providers?`, `picks?` | Stage transition. Rerank carries `provider`/`model`/`fallback` (or `skipped` on CV-order fallback); the `polishing` phase carries `providers[]` + a `picks` count |
| `picks` | `picks[]` (idx, t, originalUrl, cvScore, vlmScore, rationale, recommended), `providers[]`, `rerankProvider`, `rerankModel`, `video` | Rerank done — rows can render with cells pending |
| `polished` | `idx`, `provider`, `url`, `model` | A polish job completes (cell fills live) |
| `polish_failed` | `idx`, `provider`, `message` | A polish job fails |
| `warn` | `stage`, `message` | Non-fatal warning |
| `done` | `state` (full thumbnails.json) | Pipeline finished |
| `error` | `message` | Pipeline aborted, **or** a re-entrant stream was rejected (see below) |

---

## Caching + re-run semantics

| Stage | Cached? |
|---|---|
| Frame extraction + CV scoring | ✅ Yes — `frames/` + `frame_stats.json` in S3, hydrated back into the temp dir on a re-run |
| Vision rerank | ❌ Re-runs every click |
| Image polish | ❌ Re-runs every click |

Re-runs cost the same as fresh runs because polish always re-fires. A future "freeze candidates, refresh polish only on the selected pick" mode would drop re-run cost to ~$0.10.

---

## Failure handling

- **Gemini block (`blockReason: 'OTHER'`)** — surfaced with hint: "Common cause: real-person manipulation rule." Prompt has been softened to avoid identity-preservation language.
- **OpenAI `Invalid body: failed to parse multipart/form-data`** — fixed by switching to `axios.post(form)` (node native `fetch` doesn't stream `form-data` correctly).
- **Per-provider failure** — `Promise.allSettled` means one provider failing does not abort the run. UI shows "polish failed" for that cell; the other provider's output still appears.
- **Rerank skipped** — if no rerank API key is set or every reranker fails, the pipeline emits `phase: reranking` with `skipped` and keeps the CV-score order instead of aborting the run.
- **SSE auto-reconnect** — an `inFlightRuns` Set keyed by `videoId` rejects a re-entrant stream. Because the SSE headers are already flushed, the rejection is delivered as an **SSE `error` event on an HTTP 200 response** (not a `409` status), so an EventSource reconnect can't silently re-fire the ~$0.73/run pipeline (OpenAI `high`; ~$0.28 at `medium`).

---

## Decisions made

| Decision | Why |
|---|---|
| Hybrid CV → VLM funnel | Localizes cost; only the best ~12 frames hit the expensive Gemini rerank |
| Gemini 2.5 Pro default for rerank | Strongest multi-image scoring; still cheap (~$0.01/call) vs the polish leg |
| Selectable reranker + auto-fallback | Rerank is single-output (one ranking → picks), so pick one per run via UI; `gpt-4.1-mini` (~$0.002, strict JSON) is the cheaper alt; fall back to the other if the chosen one errors |
| Rerank optional — CV-order fallback | If no rerank key is set or every reranker fails, the pipeline keeps the CV-score order instead of aborting the run |
| Transcript hint feeds rerank + polish | A short transcript snippet (≤220 chars, provider priority `assemblyai` → `deepgram` → `openai`) is passed to both the VLM rerank and the polish prompts for topical context |
| Progressive SSE (`picks` + per-cell `polished`) | Show picks the moment rerank finishes and fill each polish cell as its job returns, instead of waiting for `done` |
| Run both image-gen providers in parallel | POC outcome is an A/B comparison |
| Scene-cut-aware keyframe sampling | Decode I-frames only (`-skip_frame nokey`) and select scene changes ≥0.3 with a 1s min-gap + a 6s coverage floor — shot-aware and ~50× fewer decodes than blind `fps=1`; falls back to adaptive fps only for huge-GOP sources that yield <8 frames |
| EventSource over fetch+ReadableStream | fetch was buffered end-to-end by Vite dev proxy |
| Direct axios over vendor SDKs | SDKs predate the fields we need (`input_fidelity`, image-out modality) |
| Soften polish prompt | "preserve identity / facial features" trips Gemini's real-person rule |

---

## Limitations / future work

| Area | Current | Future |
|---|---|---|
| Blur detection | Luma std-dev proxy via sharp | Real Laplacian-variance via Python+OpenCV sidecar |
| Frame sampling | Scene-cut-aware over keyframes (`-skip_frame nokey`, scene ≥0.3 + 6s coverage floor); adaptive-fps fallback for huge-GOP sources | Full-decode `scdet` pass for finer cut detection on low-keyframe sources |
| Person manipulation block | Prompt-softening workaround | Pre-classify frames; route face-heavy ones to OpenAI only |
| Text overlay quality | Image-gen mangles letters sometimes | Composite text via Canvas/SVG on textless polished frame |
| Aspect exactness | 9:16 source → 1024×1536 = 2:3 from OpenAI; Gemini has no aspect param | Client-side crop/letterbox to exact source dims |
| Watermark | Gemini outputs include invisible SynthID | Flag for legal review before production |
| Clip-level thumbnails | Whole-video only | Integrate with clip-detection POC |
| Authentication | Open endpoints | Per-IP rate-limit + auth gate before prod |
