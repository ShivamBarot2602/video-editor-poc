# Google gemini-2.5-pro — Clip Suggestion

> One of two interchangeable providers for the clip-suggestion stage — a drop-in to the OpenAI provider. Reads a video transcript and returns 3–5 ranked clips, each with a title, hook, rationale, and 1–10 engagement score. Selectable per run; results stored per provider (`clips_gemini.json`). Same `{ suggest, MODEL }` contract as the OpenAI provider. Its 1M-token context and multimodal lineage make it the natural bridge to the planned video-understanding step.

---

## Model

| Model ID | Use |
|---|---|
| `gemini-2.5-pro` | Clip suggestion from transcript (text-only here) |

**Used in this POC:** `gemini-2.5-pro` (set in `providers/clipSuggest/gemini.js`), via the **v1** `generateContent` endpoint.

---

## Pricing

> Source: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) · [gemini-2.5-pro per-token](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-pro) — verified June 2026

| | Standard tier |
|---|---|
| Input | $1.25 / 1M tokens (≤200K prompt) |
| Output | $10.00 / 1M tokens |
| Batch API | 50% off ($0.625 / $5.00) |
| Context window | 1,000,000 tokens |
| Free tier | ✅ (rate-limited, via AI Studio) |

**Per POC call:** transcript ~3–10K input tokens + ~0.3K output ≈ **~$0.007 – $0.016 / run**. Pricier than the OpenAI provider (~$0.004 – $0.009), but the larger context handles very long transcripts without down-sampling.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| System instruction | ✅ | `system_instruction` (rules + edge cases) separate from the transcript `contents` |
| Long transcripts | ✅ | 1M context — rarely hits the ~120K-char POC cap |
| Structured JSON (schema) | ⚠️ | **No** `responseSchema` on v1 for this model — JSON requested in-prompt; parser strips fences / carves the first `{…}` span |
| Safety settings | ✅ | All categories set `BLOCK_NONE` for this POC |
| Temperature control | ✅ | `0.3` for stable, repeatable picks |
| Multimodal | ✅ (not used here) | Text-only in this stage; the lever for a future video-understanding provider |

---

## Limits

| Parameter | Value |
|---|---|
| Input context window | 1,000,000 tokens |
| Transcript cap (this POC) | ~120,000 chars (down-sampled beyond — rarely triggered) |
| Request timeout (code) | 120,000 ms |
| Endpoint version | `v1` (per `MODEL_ENDPOINT_VERSION_MAP`) |

---

## API reference

| | Value |
|---|---|
| **Auth header** | `x-goog-api-key: $GEMINI_API_KEY` |
| **Endpoint** | `POST https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent` |
| **Content-Type** | `application/json` |
| **Request type** | Synchronous |
| **SDK used** | None — direct axios |

### Request body

```json
{
  "system_instruction": {
    "parts": [{ "text": "<static rules + edge cases + output JSON shape; 'return only JSON, no fences'>" }]
  },
  "contents": [
    { "role": "user", "parts": [{ "text": "**COUNT**: 3\n**LENGTH RANGE**: 8-90 seconds\n**DURATION**: 642.3 seconds\n**TRANSCRIPT** — [index] start-end speaker: text\n[0] 0.2-13.5 SPEAKER_A: Ready? 5, 4, 3, 2, 1, go. Round one.\n…" }] }
  ],
  "generationConfig": { "temperature": 0.3 },
  "safetySettings": [
    { "category": "HARM_CATEGORY_HARASSMENT",        "threshold": "BLOCK_NONE" },
    { "category": "HARM_CATEGORY_HATE_SPEECH",       "threshold": "BLOCK_NONE" },
    { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
    { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
  ]
}
```

> **Why no `responseSchema`:** the v1 `generateContent` endpoint rejects `response_mime_type` / `responseSchema` for this model (same constraint as the thumbnail Gemini reranker). The output JSON shape is described in `system_instruction` instead, and the response is parsed defensively.

### Response

Text parts from `candidates[0].content.parts[]`, stitched and parsed:

```
1. strip a leading ```json / trailing ``` fence
2. if it still isn't a JSON object, carve from the first '{' to the last '}'
3. JSON.parse → { "clips": [ … ] }
```

```json
{ "clips": [
  { "start": 12.5, "end": 41.0, "title": "Countdown to Round One",
    "hook": "Ready? 5, 4, 3, 2, 1, go.",
    "rationale": "Energetic countdown — a natural attention grabber.",
    "transcript_excerpt": "Ready? 5, 4, 3, 2, 1, go. Round one.", "score": 9 }
] }
```

The provider returns the raw clip list; the route's `normalizeClips` clamps to `[0,duration]`, snaps to segment boundaries, de-overlaps, ranks by score, and truncates to the requested count.

---

## Notes

- The defensive parse (fence-strip + `{…}`-carve) mirrors the Gemini thumbnail reranker — needed because v1 won't enforce a response schema for this model.
- A stable `system_instruction` lets Gemini's implicit context caching kick in on repeat runs.
- Every run overwrites `clip_debug_gemini.log` with the exact prompts and the full `response.data` (incl. `usageMetadata`) for inspection.
- Stronger on very long transcripts than the OpenAI provider (1M vs 400K context); the trade-off is higher per-token cost and JSON that occasionally needs the fence-strip rescue.
- During this POC the configured `GEMINI_API_KEY` returned `HTTP 403 PERMISSION_DENIED` (account billing block, not a code issue) — the OpenAI provider was used for live verification. The Gemini request shape is confirmed against Google's REST docs.
