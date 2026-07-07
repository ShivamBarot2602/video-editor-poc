# Google gemini-2.5-flash / pro — Video-Understanding Clip Suggestion

> The second clip-suggestion **method**: instead of reading a transcript, Gemini **watches the raw video** (audio + frames) and returns 3–5 ranked clips — each with a title, hook, a ready-to-post `caption`, a `reason`, a 1–10 score, and **3 thumbnail timestamps**. Gemini-only (Files API + video tokens). Runs over a long-running SSE stream and stores results in `clips_geminivideo.json`. Set in `providers/clipSuggest/geminiVideo.js`.

---

## Model

| Model ID | Use |
|---|---|
| `gemini-2.5-flash` | Video understanding — **default** (cheap, fast) |
| `gemini-2.5-pro` | Video understanding — sharper instruction-following (~4× cost) |

**Used in this POC:** `VIDEO_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']`, default `gemini-2.5-flash` (`config/constants.js`), selectable per run from the UI. Both via the **v1beta** `generateContent` endpoint.

---

## How it works

```
1. Upload the video to the Gemini Files API (uploadVideo → waitForActive).
   A recent, still-ACTIVE upload is reused from gemini_file.json (cache ~46h).
2. One generateContent call with:
   - system_instruction : static rules + self-check + output shape
   - contents           : user turn (count, MIN/MAX length, duration) + the file_data part
   - generationConfig   : temperature 0.2, responseMimeType application/json,
                          responseSchema (pins count + bounds positions to [0,duration]),
                          mediaResolution = MEDIA_RESOLUTION_LOW for video over 1h
3. Parse the JSON, then normalizeClips (clamp / de-overlap / rank / truncate).
4. ffmpeg-extract each clip's 3 thumbnail frames → upload to S3.
```

The whole run streams to the client over SSE: `uploading` (with percent) → `processing` → `analyzing` → `extracting` → `done`.

---

## responseSchema

Unlike the transcript Gemini method (JSON-by-prompt), the video method **does** send a `responseSchema` — it pins what a schema can express and leaves the rest to the prompt:

| Pinned by schema | How |
|---|---|
| Exact clip count | `clips` array `minItems == maxItems == count` |
| Timestamps in range | `start` / `end` / each `thumbnails[]` bounded `minimum: 0, maximum: duration` |
| Exactly 3 thumbnails | `thumbnails` array `minItems == maxItems == 3` |
| Field presence + order | `required` + `propertyOrdering` on every field |

Clip **length** (`end - start`) is a derived delta a schema can't express, so it stays a hardened prompt rule + a logged warning (over-long / under-short clips are surfaced, not patched → "try Pro").

---

## Pricing

> Source: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) — verified July 2026. Video input is billed as tokens: **≈ 258 tokens per second** at default media resolution (1 fps + audio); `MEDIA_RESOLUTION_LOW` uses ~4× fewer tokens per frame.

| Model | Input | Output | ~Cost / 5 min video |
|---|---|---|---|
| `gemini-2.5-flash` | $0.30 / 1M | $2.50 / 1M | **~$0.03** |
| `gemini-2.5-pro` | $1.25 / 1M (≤200K) | $10.00 / 1M | **~$0.10 (~4×)** |

The Files-API upload is cached ~46h, so a re-run within that window re-pays only the analysis, not the upload. Thumbnail extraction + the eventual clip cut are local ffmpeg — $0.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Watches video (no transcript) | ✅ | Audio + frames; the only method that needs no upstream STT |
| Caption + reason | ✅ | Returns a ready-to-post `caption` and a `reason` (visual + audio cues) |
| Thumbnail frames | ✅ | 3 timestamps/clip → ffmpeg-extracted 640px JPEGs → S3, served `GET /thumb/:clipId/:n` |
| Structured JSON (schema) | ✅ | `responseSchema` pins count + timestamp bounds (see above) |
| Long video | ✅ | Default media resolution up to ~1h; drops to `MEDIA_RESOLUTION_LOW` beyond (`DEFAULT_RES_MAX_S = 3600`) |
| Feasible-count clamp | ✅ | Requests `min(count, floor(duration / bucket.min))`; warns when fewer fit |
| Single-flight | ✅ | An in-flight lock (`runningVideo`) rejects a concurrent video run per video |
| Safety settings | ✅ | All categories set `BLOCK_NONE` for this POC |

---

## API reference

| | Value |
|---|---|
| **Auth header** | `x-goog-api-key: $GEMINI_API_KEY` |
| **Upload** | Gemini Files API (`uploadVideo` → poll `waitForActive`), cached in `gemini_file.json` (~46h reuse) |
| **Endpoint** | `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` |
| **Content-Type** | `application/json` |
| **Request type** | Long-running; surfaced to the client as SSE (`/api/clips/:id/suggest/stream?method=video`) |
| **Timeout** | 500 s |
| **SDK used** | None — direct axios |

---

## Debug logging

Every run overwrites `clip_debug_geminivideo.log` with the exact SYSTEM prompt, USER prompt, and the full raw `response.data` (on success, HTTP error, or parse failure alike). The file lives in the gitignored working tree and never ships.
