# Video Clips POC — Architecture

> Pipeline that turns a transcribed video into 3–5 suggested short clips. An LLM reads the transcript and proposes ranked clip ranges; each is previewed in a window-clamped player and cut with ffmpeg only on download. Built on a swappable provider registry so a video-understanding model can drop in later.

---

## End-to-end flow

```
Video already transcribed by the editor's STT step
       │   videos/<uuid>/transcription_<provider>.json
       ▼
User opens /clips/:videoId, picks suggest provider + bucket + count
       │
       │   (no transcript for this video → page shows a guard with a
       │    link to /editor/:id; suggestion is blocked)
       ▼
POST /api/clips/:id/suggest  { suggestProvider, transcriptProvider, bucket, count }
       │
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Suggestion route (Express, plain JSON)                                │
│                                                                        │
│  1.  validate provider + key; require transcription_<provider>.json    │
│  2.  ffprobe        duration + width/height (rotation-aware)           │
│  3.  build prompt   SYSTEM (static rules + edge cases + output shape)  │
│       │             USER  (count, bucket secs, duration, transcript)   │
│  4.  LLM call       gpt-5.4-mini (strict JSON) OR gemini-2.5-pro       │
│       │             (JSON-by-prompt + defensive parse)                 │
│  5.  normalizeClips clamp [0,dur] · snap to segment cuts · drop        │
│       │             overlaps · rank by score · truncate to N · id      │
│  6.  write          clips_<provider>.json  +  clip_debug_<provider>.log│
│       │             (debug = full prompts + raw response.data)         │
│  └─►  respond { metadata, clips[] }                                    │
└──────────────────────────────────────────────────────────────────────┘
       │
       ▼
Preview — each clip card mounts a ClipPlayer that streams the ORIGINAL
video (/api/video/:id, Range-backed) and is clamped to [start,end].
No cut, no transcode. Only one clip plays at a time.
       │
       ├─ Save  →  POST /api/clips/:id/saved   (bookmark; survives re-runs)
       │
       └─ Download → GET /api/clips/:id/export/stream?...   (SSE)
                       ffmpeg frame-accurate cut → clips/<clipId>.mp4
                       → browser download (instant on re-download)
```

---

## Why preview-first / lazy cut

The only expensive video op is the ffmpeg cut, and most suggestions never get downloaded. So nothing is transcoded to show a suggestion — the preview player streams the original file (the server's `/api/video/:id` honours HTTP Range, so seeking to a clip only fetches the bytes it needs) and simply refuses to leave the `[start,end]` window. The cut runs once, on demand, when the user clicks Download.

| Stage | Cost per action | Where |
|---|---|---|
| Suggestion (LLM) | ~$0.004 – $0.02 / run | OpenAI or Gemini REST |
| Preview (stream + window) | $0 | Browser, Range requests |
| Cut (ffmpeg `libx264`/`aac`) | $0 (local CPU) | On download only |

The transcript itself is a prerequisite produced upstream by the editor's transcription step; the Clips module reads it and never creates it.

---

## On-disk layout per video

```
videos/<uuid>/
├── original.mp4                     (source upload)
├── meta.json                        (filename, size, uploadedAt)
├── transcription_<provider>.json    (from the editor's STT step — INPUT)
├── clips_openai.json                (suggestions for the OpenAI run)
├── clips_gemini.json                (suggestions for the Gemini run)
├── saved_clips.json                 (bookmarked library — survives re-runs)
├── clip_debug_openai.log            (last OpenAI run: prompts + raw response)
├── clip_debug_gemini.log            (last Gemini run: prompts + raw response)
└── clips/
    ├── openai-clip-01.mp4           (cut on download; volatile per run)
    ├── gemini-clip-02.mp4
    └── saved-openai-12500-41000.mp4 (cut of a saved clip; stable id)
```

**`clips_<provider>.json` shape**

```json
{
  "metadata": {
    "suggestProvider": "openai",
    "model": "gpt-5.4-mini",
    "transcriptProvider": "assemblyai",
    "bucket": "auto",
    "bucketSeconds": { "min": 8, "max": 90 },
    "requestedCount": 3,
    "video_duration_s": 642.30,
    "video_width": 1080,
    "video_height": 1920,
    "language": "en",
    "transcript_truncated": false,
    "timestamp": "2026-06-09T09:17:32.029Z",
    "warnings": ["Model returned 1 usable clips (requested 3)."]
  },
  "clips": [
    {
      "id": "openai-clip-01",
      "suggestProvider": "openai",
      "start": 12.5,
      "end": 41.0,
      "duration": 28.5,
      "title": "Countdown to Round One",
      "hook": "Ready? 5, 4, 3, 2, 1, go.",
      "rationale": "Energetic countdown — a natural attention grabber.",
      "transcript_excerpt": "Ready? 5, 4, 3, 2, 1, go. Round one.",
      "score": 9,
      "exported": false,
      "clipUrl": null
    }
  ]
}
```

`exported`/`clipUrl` flip to `true` / `/api/video/<id>/clip/<clipId>` after the clip is cut.

**`saved_clips.json` shape** — same per-clip fields plus `sourceClipId`, `transcriptProvider`, `bucket`, `savedAt`, and a stable id `saved-<provider>-<startMs>-<endMs>` (so saving the same range twice dedupes, and a saved cut never collides with a volatile suggestion cut).

---

## Server endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/clips/:id/suggest` | POST | Run the LLM over the transcript; write `clips_<provider>.json`; return it. Body `{ suggestProvider, transcriptProvider, bucket, count }` |
| `/api/clips/:id/:suggestProvider` | GET | Fetch saved suggestions for a provider (404 if none yet) |
| `/api/clips/:id/saved` | GET | The persistent saved-clips library |
| `/api/clips/:id/saved` | POST | Bookmark a clip definition (no cut). Body `{ clip, transcriptProvider, bucket }` |
| `/api/clips/:id/saved/:savedId` | DELETE | Remove from library + delete any cut file |
| `/api/clips/:id/export/stream?suggestProvider=&clipId=&source=` | GET (SSE) | ffmpeg-cut a clip; stream progress. `source=saved` reads the library instead of `clips_<provider>.json` |
| `/api/video/:id/clip/:clipId` | GET | Stream a cut clip file (`clips/<clipId>.mp4`) |

> The `/saved` route is declared **before** `/:id/:suggestProvider` so the literal `saved` isn't matched as a provider name.

## Export SSE event types

| Event | Fields | Emitted when |
|---|---|---|
| `start` | — | Cut begins (skipped if the file already exists) |
| `progress` | `percent` | ffmpeg progress tick (`null` on the first tick under ffmpeg 8.x; client treats as 0) |
| `done` | `clipUrl` | Cut finished, or file already existed (idempotent) |
| `error` | `message` | Cut failed / invalid params |

---

## Prompt design — system / user split

The prompt is split so the static half can be cached by the providers and the model weights the rules more strongly:

- **SYSTEM** (byte-identical every call): role, hard rules, **edge-case guidance** (too few strong moments → return fewer; whole video short → one tight clip; sparse transcript → `{"clips":[]}`; unsure on a boundary → prefer the wider segment-aligned cut), and the exact output JSON shape.
- **USER** (per request): `COUNT`, `LENGTH RANGE` (bucket seconds), `DURATION`, language/filename, then the transcript as one line per segment — `[index] start-end speaker: text`. Capped at ~120K chars; longer transcripts are evenly down-sampled and flagged `transcript_truncated`.

| Provider | JSON strategy |
|---|---|
| OpenAI `gpt-5.4-mini` | Strict Structured Outputs (`response_format.json_schema`); content is always valid JSON |
| Gemini `gemini-2.5-pro` | `system_instruction` + `contents`; **no** `responseSchema` on v1 for this model, so JSON is requested in-prompt and the parser strips markdown fences / carves the first `{…}` span |

## normalizeClips — the LLM output is a draft, never trusted

```
for each raw clip:
  coerce start/end to numbers; drop if non-finite or end <= start
  snap start/end to nearest transcript segment boundary (≤0.5s)
  clamp start ≥ 0, end ≤ duration; drop if end-start < 1s
  clamp score to 1–10
rank by score desc; greedily drop any clip overlapping an accepted one
truncate to requested count   (fewer than N → attach a warning, never 500)
assign id `<provider>-clip-NN` (1-based, chronological); set exported=false
```

A re-suggest for the same provider first deletes that provider's stale `*-clip-NN.mp4` cut files (ids are reused for different ranges across runs), so a stale cut can never be served.

---

## ClipPlayer — window-clamped preview

The card's `<video>` streams the whole original with **native controls hidden** (a native scrub bar would let the user seek outside the clip). A custom control row drives it:

- On `loadedmetadata` (never before), clamp `end` to the real duration and seek to `start`.
- `timeupdate`: at `≥ end-ε` loop back to `start` (default) or stop; below `start`, pull forward.
- `seeking`/`seeked`: clamp any stray seek back into `[start,end]` (safety net).
- Custom scrubber maps `0..clipDuration` onto `[start,end]` — the user physically can't drag past the window.
- A module-level registry pauses every other player when one starts, so only one clip plays at a time.

---

## Debug logging

Every suggestion run overwrites `clip_debug_<provider>.log` with the exact **SYSTEM** prompt, **USER** prompt, and the **full `response.data`** from the provider (pretty-printed) — on success, HTTP error, refusal, and parse failure alike. Only the latest run is kept (no history). The file lives in the gitignored `videos/` tree, so it never ships.

---

## Decisions made

| Decision | Why |
|---|---|
| Swappable `clipSuggest` registry (openai · gemini) | Lets the user A/B providers per run and lets a future video-understanding model drop in unchanged |
| Plain JSON suggest (no SSE) | A single LLM round-trip has no intermediate progress worth streaming; a client spinner covers the 5–30s wait |
| SSE only for export | The ffmpeg cut has real, streamable progress — reuses the burn route's SSE pattern |
| Preview streams original + window (no cut) | Most suggestions are discarded; transcoding to preview would be wasted work |
| Re-encode cut, not `-c copy` | `-c copy` snaps to keyframes (off by seconds); re-encode is frame-accurate to the chosen range |
| System / user prompt split | Stronger rule-following + cacheable static system prefix |
| Output treated as a draft (`normalizeClips`) | LLMs return out-of-range / overlapping / wrong-count clips; clamp + de-overlap + truncate instead of trusting |
| Provider baked into `clipId` + filename | `gemini-clip-01` vs `openai-clip-01` coexist; every cut traces back to the model + index that produced it |
| Saved library separate from suggestions | Suggestions are volatile (re-run overwrites); saved clips are stable bookmarks with their own ids |
| Direct axios over vendor SDKs | Matches the rest of the repo; full control of the request/response shape and raw-response logging |

---

## Limitations / future work

| Area | Current | Future |
|---|---|---|
| Signal | Transcript only (words) | Video-understanding model (Gemini) that scores visuals + audio, added as another `clipSuggest` provider |
| Missing transcript | Page blocks with a guard linking to the editor | Auto-transcribe with a default provider (e.g. AssemblyAI) inline, with step progress |
| Aspect / format | Cut keeps the source aspect | Optional 9:16 reframe / crop for vertical feeds |
| Subtitles on clips | None | Burn the matching transcript window into the cut |
| Suggestion caching | Re-run overwrites `clips_<provider>.json` | Keep a short history / let the user pin a run |
| Progress for suggest | Client spinner (no %) | Token-stream the model for a live partial-clips view |
| Auth | Open endpoints | Per-IP rate-limit + auth gate before prod |
