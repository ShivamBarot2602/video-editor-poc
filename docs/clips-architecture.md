# Video Clips POC — Architecture

> Pipeline that turns a video into 3–5 suggested short clips via **two methods**: an LLM reads the transcript (**subtitles method**), or Gemini watches the raw video's audio + frames (**video-understanding method**). Both propose ranked clip ranges; each is previewed in a window-clamped player and cut with ffmpeg only on download. Built on a swappable provider registry; all state is S3-backed.

---

## End-to-end flow — Method A (subtitles)

```
Video already transcribed by the editor's STT step
       │   store: transcription_<provider>.json
       ▼
User opens /clips/:videoId, picks the subtitles method + provider + bucket + count
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
│       │             (v1beta, JSON-by-prompt + defensive parse)         │
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
                       ffmpeg frame-accurate cut → cut .mp4 (store)
                       → browser download (instant on re-download)
```

---

## End-to-end flow — Method B (video understanding)

```
Raw video (no transcript required)
       │
       ▼
User opens /clips/:videoId, picks the video method + bucket + count + model
       │
       ▼
GET /api/clips/:id/suggest/stream?method=video&count=&bucket=&model=   (SSE, long-running)
       │   (a second concurrent video run for the same id is rejected — in-flight lock)
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  suggestFromVideo (services/clips.js) → providers/clipSuggest/geminiVideo│
│                                                                        │
│  1.  ffprobe        duration + width/height; feasibleCount =           │
│       │             min(requested, floor(duration / bucket.min))       │
│  2.  media res      'default' (~1h); drops to 'low' when duration >    │
│       │             DEFAULT_RES_MAX_S (3600s), with a warning          │
│  3.  Files API      reuse a still-ACTIVE cached upload (gemini_file.json│
│       │             within ~46h) else upload + poll until ACTIVE       │
│       │             → SSE: uploading(percent) → processing             │
│  4.  generateContent v1beta · temp 0.2 · responseSchema pins the count │
│       │             (minItems==maxItems) + bounds every start/end/     │
│       │             thumbnail to [0,duration]      → SSE: analyzing    │
│  5.  normalizeClips same clamp/snap/de-overlap/rank/truncate; keeps    │
│       │             caption + thumbnails; logs length violations       │
│  6.  extract        ffmpeg-seek each clip's 3 thumbnail times → 640px  │
│       │             JPEG → store  → SSE: extracting                    │
│  7.  write          clips_geminivideo.json + clip_debug_geminivideo.log│
│  └─►  SSE: done { data }                                               │
└──────────────────────────────────────────────────────────────────────┘
       │
       ▼
Same preview + Save + on-demand ffmpeg cut path as Method A.
Each clip also carries `caption` and `thumbnails[]` (served via
GET /api/clips/:id/thumb/:clipId/:n → 302 to the store).
```

---

## Why preview-first / lazy cut

The only local video op is the ffmpeg cut, and most suggestions never get downloaded. So nothing is transcoded to show a suggestion — the preview player streams the original file (the server's `/api/video/:id` honours HTTP Range, so seeking to a clip only fetches the bytes it needs) and simply refuses to leave the `[start,end]` window. The cut runs once, on demand, when the user clicks Download.

| Stage | Cost per action | Where |
|---|---|---|
| Subtitles suggestion (LLM) | ~$0.004 – $0.02 / run | OpenAI or Gemini REST |
| Video suggestion (Gemini video) | ~$0.03 – $0.10 / 5 min | Gemini Files API + generateContent |
| Preview (stream + window) | $0 | Browser, Range requests |
| Cut (ffmpeg `libx264`/`aac`) | $0 (local CPU) | On download only |
| Thumbnail extract (ffmpeg, video method) | $0 (local CPU) | After a video run |

For the subtitles method the transcript is a prerequisite produced upstream by the editor's transcription step; the Clips module reads it and never creates it. The video method needs no transcript.

---

## Storage layout per video (S3-backed)

All state lives in the **S3-backed store** (`storage/videoStore`), not a local `videos/<uuid>/` tree. The logical filenames per video are:

```
<video store scope>
├── original.mp4                     (source upload)
├── meta.json                        (filename, size, uploadedAt)
├── transcription_<provider>.json    (from the editor's STT step — subtitles INPUT)
├── clips_openai.json                (subtitles run — OpenAI)
├── clips_gemini.json                (subtitles run — Gemini)
├── clips_geminivideo.json           (video-understanding run — Gemini watches the video)
├── saved_clips.json                 (bookmarked library — survives re-runs)
├── clip_debug_openai.log            (last OpenAI run: prompts + raw response)
├── clip_debug_gemini.log            (last Gemini run: prompts + raw response)
├── clip_debug_geminivideo.log       (last video run: prompts + raw response)
├── gemini_file.json                 (Files-API upload cache — name/uri/uploadedAt, ~46h reuse)
├── <clip thumbnail JPEGs>           (video method: 3 per clip, served via /thumb/:clipId/:n)
├── openai-clip-01.mp4               (cut on download; volatile per run)
├── geminivideo-clip-02.mp4
└── saved-openai-12500-41000.mp4     (cut of a saved clip; stable id)
```

**`clips_<provider>.json` shape** (subtitles method — OpenAI shown)

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
    "timestamp": "2026-07-06T09:17:32.029Z",
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

**`clips_geminivideo.json` shape** (video-understanding method) — same as above but with extra metadata `method: "video"`, `feasibleCount`, `mediaResolution` (`"default"` | `"low"`), and no `transcriptProvider`/`transcript_truncated`. Each clip additionally carries a `caption` (ready-to-post social caption) and `thumbnails` (up to 3 entries, each `{ t, url }` pointing at `/api/clips/<id>/thumb/<clipId>/<n>`):

```json
{
  "metadata": {
    "method": "video",
    "suggestProvider": "geminivideo",
    "model": "gemini-2.5-flash",
    "bucket": "auto",
    "bucketSeconds": { "min": 8, "max": 90 },
    "requestedCount": 5,
    "feasibleCount": 4,
    "video_duration_s": 642.30,
    "video_width": 1080,
    "video_height": 1920,
    "mediaResolution": "default",
    "language": null,
    "timestamp": "2026-07-06T09:17:32.029Z",
    "warnings": ["Video is ~10 min — at 8s+ per clip with no overlaps, at most 4 clip(s) fit (you asked for 5)."]
  },
  "clips": [
    {
      "id": "geminivideo-clip-01",
      "suggestProvider": "geminivideo",
      "start": 12, "end": 54, "duration": 42.0,
      "title": "The $500 hammer twist",
      "hook": "Get it right, swing the hammer",
      "rationale": "Rules land in the first line and the first swing pays off fast.",
      "caption": "Trivia, but every wrong answer costs you 🔨 #gameshow",
      "score": 9,
      "thumbnails": [
        { "t": 16, "url": "/api/clips/<id>/thumb/geminivideo-clip-01/0" },
        { "t": 33, "url": "/api/clips/<id>/thumb/geminivideo-clip-01/1" },
        { "t": 50, "url": "/api/clips/<id>/thumb/geminivideo-clip-01/2" }
      ],
      "exported": false,
      "clipUrl": null
    }
  ]
}
```

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
| Swappable `clipSuggest` registry (openai · gemini · geminivideo) | Lets the user A/B providers per run; the video-understanding method (`geminivideo`) dropped in as one more provider without reshaping the API or UI |
| Plain JSON for transcript suggest; SSE for video suggest | The transcript round-trip has no intermediate progress worth streaming (a spinner covers the 5–30s wait); the video run (upload → analyze → extract) has real streamable phases, so it uses SSE |
| SSE for the video suggest + every cut | Both the video run and the ffmpeg cut have real, streamable progress — reuses the burn route's SSE pattern |
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
| Signal | Two methods: transcript (words) **and** video understanding (Gemini watches visuals + audio) | Combine both signals in one pass; scene-level shot detection to sharpen boundaries |
| Missing transcript | Transcript method blocks with a guard linking to the editor (the video method needs no transcript) | Auto-transcribe with a default provider (e.g. AssemblyAI) inline for the transcript method |
| Aspect / format | Cut keeps the source aspect | Optional 9:16 reframe / crop for vertical feeds |
| Subtitles on clips | None | Burn the matching transcript window into the cut |
| Suggestion caching | Re-run overwrites `clips_<provider>.json` | Keep a short history / let the user pin a run |
| Progress for suggest | Transcript = client spinner; video = live SSE phase progress | Token-stream the model for a live partial-clips view |
| Auth | Open endpoints | Per-IP rate-limit + auth gate before prod |
