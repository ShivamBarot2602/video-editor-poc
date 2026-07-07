# Gemini 2.5 Pro — Vision Rerank

> Multi-image vision model used in **Stage 6 (Vision rerank)** to score 8–12 candidate frames 1–10 with one-line rationales. Strongest scoring quality; cost is still negligible versus the polish stage.

---

## Model

| Model ID | Use |
|---|---|
| `gemini-2.5-pro` | Vision rerank (multi-image scoring) |

**Used in this POC:** `gemini-2.5-pro` (set in `thumbnailRerank/gemini.js`). **Default reranker** — selectable per run from the UI against the OpenAI `gpt-4.1-mini` reranker (see `openai-rerank.md`); if the chosen one fails, the pipeline falls back to the other.

> The rerank file carries an endpoint-version map (`MODEL_ENDPOINT_VERSION_MAP`): every model that we send a `system_instruction` to is pinned to **`v1beta`** — `gemini-2.5-pro` (active), `gemini-2.5-flash`, and the **Gemini-3 preview** entries (`gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-3-flash`) for experimentation. Anything not in the map falls back to `v1`.

---

## Pricing

> Source: [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing) — verified July 2026

| | Standard tier |
|---|---|
| Input (text / image / video) | $1.25 / 1M tokens (≤200K ctx) · $2.50 / 1M (>200K) |
| Output | $10.00 / 1M tokens (≤200K) · $15.00 / 1M (>200K) |
| Free tier | ✅ Google AI Studio (rate-limited) |
| Batch discount | 50% (not used in POC) |
| Context caching | up to 90% savings (not used) |

**Per POC call (12 frames):** ~4K input tokens + ~500 output tokens ≈ **~$0.01 / call**.

> A `gemini-2.5-flash` rerank ($0.30 / $2.50 per 1M) would cost ~$0.001/call — ~10× cheaper. The Pro choice trades a marginal absolute cost for stronger ranking.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Multi-image input | ✅ | We send 10–12 frames per call |
| JSON output via `response_mime_type` | ❌ | Rejected by `v1` `generation_config` proto |
| Adjustable safety thresholds | ✅ | 4 HARM_* categories; set to `BLOCK_NONE` |
| Default threshold on 2.5+ | `OFF` | safetySettings explicit-set is defensive |
| Temperature control | ✅ | Set `0.2` for near-deterministic ranking |
| System instruction | ✅ | Not used (prompt does the work) |
| Function calling | ✅ | Not used |

---

## Limits

| Parameter | Value |
|---|---|
| Input context window | ~1,000,000 tokens |
| Output token limit | ~65,536 |
| Practical multi-image limit | ~16 images per call |
| Image MIME types | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |

---

## API reference

| | Value |
|---|---|
| **Auth header** | `x-goog-api-key: $GEMINI_API_KEY` |
| **Endpoint** | `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent` |
| **Content-Type** | `application/json` |
| **Request type** | Synchronous |
| **SDK used** | None — direct axios. |

### Request body

```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "<rerank prompt with labels A, B, C, ...>" },
      { "inline_data": { "mime_type": "image/jpeg", "data": "<base64 frame 1>" } },
      { "inline_data": { "mime_type": "image/jpeg", "data": "<base64 frame 2>" } }
    ]
  }],
  "generationConfig": { "temperature": 0.2 },
  "safetySettings": [
    { "category": "HARM_CATEGORY_HARASSMENT",        "threshold": "BLOCK_NONE" },
    { "category": "HARM_CATEGORY_HATE_SPEECH",       "threshold": "BLOCK_NONE" },
    { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
    { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
  ]
}
```

### Response

`candidates[0].content.parts[].text` — a JSON array. Pure JSON requested via prompt; defensively stripped of markdown fences and carved between first `[` and last `]` for prose padding.

```json
[
  {"label":"A","score":7,"rationale":"Direct eye contact, neutral background"},
  {"label":"B","score":4,"rationale":"Motion blur on subject"},
  ...
]
```

---

## Prompt strategy

- Per-image **1–10 score + 1-line rationale**. Absolute scoring is more stable than listwise "pick best".
- Images labeled A/B/C... to fight order bias.
- Instructions evaluate: face visibility, eye contact, expression, sharpness/blur, composition, exposure, transition-frame avoidance.
- "Return ONLY a JSON array … No prose outside the JSON. No markdown fences."

---

## Notes

- `response_mime_type: application/json` is rejected by the `v1` `generation_config` proto — we use prompt + manual JSON parse.
- Listwise "pick best" prompts produce weaker rankings than absolute scoring.
- Identical-looking candidates collapse to the same score — dedup at the CV stage *before* this call to avoid wasted scoring budget.
- `BLOCK_NONE` × 4 is set defensively (default is `OFF` on 2.5+).
