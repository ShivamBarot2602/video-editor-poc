# OpenAI gpt-4.1-mini — Vision Rerank

> Alternative reranker for **Stage 6 (Vision rerank)** — a drop-in to the Gemini reranker. Scores 8–12 candidate frames 1–10 with one-line rationales. Selectable per run from the UI; Gemini is the default, this is the fallback (and vice-versa).

---

## Model

| Model ID | Use |
|---|---|
| `gpt-4.1-mini` | Vision rerank (multi-image scoring) |

**Used in this POC:** `gpt-4.1-mini` (set in `thumbnailRerank/openai.js`). Same `{ rerank, MODEL }` contract as the Gemini reranker.

---

## Pricing

> Source: [OpenAI pricing](https://developers.openai.com/api/docs/pricing) · [gpt-4.1-mini model card](https://developers.openai.com/api/docs/models/gpt-4.1-mini) — verified July 2026

| | Standard tier |
|---|---|
| Input (text + image tokens) | $0.40 / 1M tokens |
| Output | $1.60 / 1M tokens |
| Batch API | 50% off ($0.20 / $0.80) |
| Prompt caching | up to 90% off cached input |
| Free tier | ❌ (credits on new accounts) |

**Per POC call (~12 frames @ `detail:low`):** ~1–2K input tokens + ~500 output ≈ **~$0.002 / call**.

> ~5× cheaper than the `gemini-2.5-pro` reranker (~$0.01); both are a rounding error next to the polish leg.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Multi-image input | ✅ | All frames in one `messages[].content` array |
| Image detail control | ✅ | `image_url.detail: 'low'` — 512px downscale, minimal tokens |
| JSON output (strict) | ✅ | `response_format: json_schema`, `strict: true` — guaranteed valid JSON, no fence-stripping |
| Temperature control | ✅ | Left default; schema + prompt do the work |
| Context window | ✅ | 1,000,000 tokens · up to ~33K output |
| Vision + function calling | ✅ | Vision used; function calling not needed |

---

## Limits

| Parameter | Value |
|---|---|
| Input context window | ~1,000,000 tokens |
| Output token limit | ~33,000 |
| Image MIME types | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| Practical multi-image limit | comfortably 10–16 frames per call |

---

## API reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Bearer $OPENAI_API_KEY` |
| **Endpoint** | `POST https://api.openai.com/v1/chat/completions` |
| **Content-Type** | `application/json` |
| **Request type** | Synchronous |
| **SDK used** | None — direct axios (same pattern as the polish provider) |

### Request body

```json
{
  "model": "gpt-4.1-mini",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "<rerank prompt with labels A, B, C, ... + 'wrap as {\"scores\":[…]}'>" },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<frame 1>", "detail": "low" } },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<frame 2>", "detail": "low" } }
    ]
  }],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "frame_scores",
      "strict": true,
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["scores"],
        "properties": {
          "scores": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["label", "score", "rationale"],
              "properties": {
                "label": { "type": "string" },
                "score": { "type": "integer" },
                "rationale": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
```

> **Strict-mode rules:** root must be an **object** (so the score array is wrapped under `scores`), every property must be in `required`, and `additionalProperties: false`. Strict can't enforce numeric 1–10 bounds — the prompt asks for it and the code clamps.

### Response

`choices[0].message.content` — a JSON string parsing to `{ "scores": [ … ] }`.

```json
{ "scores": [
  {"label":"A","score":7,"rationale":"Direct eye contact, neutral background"},
  {"label":"B","score":4,"rationale":"Motion blur on subject"}
] }
```

Guard `choices[0].message.refusal` before parsing. Map `label` A/B/C… → frame index (positional fallback), same as the Gemini reranker.

---

## Notes

- `detail: 'low'` ships a 512px downscale — keeps image tokens tiny but weakens fine sharpness signal. Blur/sharpness is still covered by the CV stage (`sharp` luma std-dev), so this is fine for rerank.
- Strict Structured Outputs guarantee valid JSON — the Gemini path's manual fence-stripping / `[…]`-carving is unnecessary here.
- Cheaper but a slightly weaker judge than `gemini-2.5-pro`. For best ranking quality prefer Gemini; for near-free runs prefer this.
