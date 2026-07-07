# OpenAI gpt-5.4-mini — Clip Suggestion

> One of two interchangeable providers for the clip-suggestion stage. Reads a video transcript and returns 3–5 ranked clips, each with a title, hook, rationale, and 1–10 engagement score. Selectable per run from the UI; results are stored per provider (`clips_openai.json`). Same `{ suggest, MODEL }` contract as the Gemini provider.

---

## Model

| Model ID | Use |
|---|---|
| `gpt-5.4-mini` | Clip suggestion from transcript (text-only) |

**Used in this POC:** `gpt-5.4-mini` (set in `providers/clipSuggest/openai.js`). Text-only — the transcript goes in, structured clip JSON comes out.

---

## Pricing

> Source: [OpenAI pricing](https://developers.openai.com/api/docs/pricing) · [gpt-5.4-mini per-token](https://pricepertoken.com/pricing-page/model/openai-gpt-5.4-mini) — verified July 2026

| | Standard tier |
|---|---|
| Input | $0.75 / 1M tokens |
| Output | $4.50 / 1M tokens |
| Context window | 400,000 tokens (≤128K output) |
| Prompt caching | discounted cached input (static SYSTEM prompt benefits) |
| Free tier | ❌ (credits on new accounts) |

**Per POC call:** transcript ~3–10K input tokens + ~0.3K output ≈ **~$0.004 – $0.009 / run**. Cheaper than the `gemini-2.5-pro` provider (~$0.007 – $0.016); both are fractions of a cent.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Structured JSON (strict) | ✅ | `response_format: json_schema`, `strict: true` — content is always valid JSON, no fence-stripping |
| System / user split | ✅ | `system` message (rules + edge cases) + `user` message (constraints + transcript) |
| Long transcripts | ⚠️ | 400K context; transcript capped at ~120K chars and down-sampled if longer (`transcript_truncated`) |
| Temperature control | ✅ | Left default; schema + prompt do the steering |
| Multimodal | ❌ (not used) | Text-only here; a future video-understanding provider would carry the visual signal |

---

## Limits

| Parameter | Value |
|---|---|
| Input context window | 400,000 tokens |
| Output token limit | ~128,000 |
| Transcript cap (this POC) | ~120,000 chars (down-sampled beyond) |
| Request timeout (code) | 90,000 ms |

---

## API reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Bearer $OPENAI_API_KEY` |
| **Endpoint** | `POST https://api.openai.com/v1/chat/completions` |
| **Content-Type** | `application/json` |
| **Request type** | Synchronous |
| **SDK used** | None — direct axios |

### Request body

```json
{
  "model": "gpt-5.4-mini",
  "messages": [
    { "role": "system", "content": "<static rules + edge cases + output JSON shape>" },
    { "role": "user",   "content": "**COUNT**: 3\n**LENGTH RANGE**: 8-90 seconds\n**DURATION**: 642.3 seconds\n**TRANSCRIPT** — [index] start-end speaker: text\n[0] 0.2-13.5 SPEAKER_A: Ready? 5, 4, 3, 2, 1, go. Round one.\n…" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "clip_suggestions",
      "strict": true,
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["clips"],
        "properties": {
          "clips": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["start", "end", "title", "hook", "rationale", "transcript_excerpt", "score"],
              "properties": {
                "start": { "type": "number" },
                "end": { "type": "number" },
                "title": { "type": "string" },
                "hook": { "type": "string" },
                "rationale": { "type": "string" },
                "transcript_excerpt": { "type": "string" },
                "score": { "type": "integer" }
              }
            }
          }
        }
      }
    }
  }
}
```

> **Strict-mode rules:** root must be an **object** (so the clip list is wrapped under `clips`), every property must be in `required`, and `additionalProperties: false`. Strict can't enforce numeric bounds (range within `[0,duration]`, score 1–10) — the prompt states them and `normalizeClips` enforces them in code.

### Response

`choices[0].message.content` — a JSON string parsing to `{ "clips": [ … ] }`.

```json
{ "clips": [
  { "start": 12.5, "end": 41.0, "title": "Countdown to Round One",
    "hook": "Ready? 5, 4, 3, 2, 1, go.",
    "rationale": "Energetic countdown — a natural attention grabber.",
    "transcript_excerpt": "Ready? 5, 4, 3, 2, 1, go. Round one.", "score": 9 }
] }
```

Guard `choices[0].message.refusal` before parsing. The provider returns the raw clip list untouched; the route's `normalizeClips` clamps, snaps to segment boundaries, de-overlaps, ranks, and truncates.

---

## Notes

- Strict Structured Outputs guarantee valid JSON, so the Gemini path's manual fence-stripping / `{…}`-carving is unnecessary here.
- The static SYSTEM prompt is byte-identical across runs, so OpenAI's prompt caching can discount the repeated input.
- Every run overwrites `clip_debug_openai.log` with the exact prompts and the full `response.data` (incl. token `usage`) for inspection.
- Cheaper than `gemini-2.5-pro`; the trade-off is the smaller 400K context vs Gemini's 1M for very long transcripts.
