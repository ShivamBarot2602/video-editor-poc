# OpenAI gpt-image-1.5 — Image Edit

> Image-edit model used in **Stage 7 (Polish)** as the second image-gen provider, running in parallel with Gemini Flash Image. Stronger aspect-ratio control and explicit identity-preservation knob.

---

## Model

| Model ID | Use |
|---|---|
| `gpt-image-1.5` | Image-to-image edit (polish stage) |

**Used in this POC:** `gpt-image-1.5` (set in `thumbnailPolish/openai.js`), `quality: 'high'` (code default; route passes no override).

> `gpt-image-1.5` (launched Dec 16 2025) is current and **not** deprecated. OpenAI's default flagship is now **`gpt-image-2`** (Apr 21 2026). The legacy `gpt-image-1` deprecates **Oct 23 2026**.

---

## Pricing

> Source: [developers.openai.com/api/docs/models/gpt-image-1.5](https://developers.openai.com/api/docs/models/gpt-image-1.5) — verified July 2026

Per-image price is flat by (quality, size); image-input/output **tokens** are billed on top.

| Quality \ Size | 1024×1024 | 1024×1536 (portrait) | 1536×1024 (landscape) |
|---|---|---|---|
| Low | $0.009 | $0.013 | $0.013 |
| Medium | $0.034 | $0.050 | $0.050 |
| **High** *(code default)* | **$0.133** | **$0.200** | **$0.200** |

Token rates: image-input **$8 / 1M** (cached $2 / 1M), image-output **$32 / 1M**. `moderation: 'low'` adds no cost. **`input_fidelity: 'high'` raises image-input token count** (unlike legacy `gpt-image-1`, where it was free) — typically +$0.01–0.03 per high-fidelity edit, on top of the flat figure.

**Per POC video (3 picks, `high` landscape):** $0.20 × 3 = **$0.60** (+ input-fidelity token cost).

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Image-to-image edit | ✅ | `/v1/images/edits` |
| Identity preservation knob | ✅ | `input_fidelity: 'low' \| 'high'`. Set `high` to preserve faces. |
| Multiple input images | ✅ | Up to 16 (we send 1) |
| Mask (inpaint) | ✅ Optional | Omitted in POC (we polish whole frame) |
| Quality tiers | ✅ | `low / medium / high / auto` |
| Size enum | ✅ | `1024x1024 / 1024x1536 / 1536x1024 / auto` |
| Output format | ✅ | `png / jpeg / webp` |
| Background transparency | ✅ | `transparent / opaque / auto` |
| Moderation level | ✅ | `low / auto`. Set `low` for real video frames. |
| Watermark | ❌ | No SynthID / no metadata flag |

---

## Limits

| Parameter | Value |
|---|---|
| Max input image size | 50 MB |
| Input MIME types | `image/jpeg`, `image/png`, `image/webp` |
| Max input images | 16 |
| Max `n` (outputs per call) | 10 |

---

## API reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Bearer $OPENAI_API_KEY` |
| **Endpoint** | `POST https://api.openai.com/v1/images/edits` |
| **Content-Type** | `multipart/form-data` |
| **Request type** | Synchronous |
| **SDK used** | None — direct `axios.post(form)`. |

### Request fields (multipart form)

```
model            = gpt-image-1.5
prompt           = <polish prompt + aspect hint + transcript context>
image            = <binary JPEG stream of source frame>
size             = 1536x1024 | 1024x1024 | 1024x1536 | auto
quality          = high          (code default)
input_fidelity   = high
output_format    = png
moderation       = low
n                = 1
```

### Aspect → size mapping

| Source aspect | `size` param |
|---|---|
| Landscape | `1536x1024` |
| Portrait | `1024x1536` |
| Square | `1024x1024` |
| Unknown | `auto` |

### Response

```json
{
  "data": [{ "b64_json": "<base64 PNG>" }],
  "usage": { "input_tokens": ..., "output_tokens": ... }
}
```

`data[0].b64_json` is the polished image. `response_format` is **not** supported on the GPT-image family; `b64_json` is the default and only format.

---

## Notes

- Node native `fetch()` does **not** stream the `form-data` npm package correctly → `Invalid body: failed to parse multipart/form-data`. Use `axios.post(form, …)`.
- `input_fidelity: 'high'` roughly doubles latency vs `low` **and** adds image-input token cost on `gpt-image-1.5`.
- `quality: 'high'` is the code default (~4× `medium`: $0.20 vs $0.05/img landscape). Drop to `medium` to cut the OpenAI leg.
- Output dims match `size` exactly. For 16:9 source (≈1.778) sent at `1536x1024` (1.5), result letterboxes or crops — client-side resize needed for pixel-exact dims.
- **Alternatives / migration (prices verified July 2026):**
  - **`gpt-image-2`** — current default flagship (Apr 21 2026); $0.005–$0.211/img. Treats every input at high fidelity automatically, so `input_fidelity` is dropped/ignored.
  - `gpt-image-1-mini` ≈ $0.005–$0.052/image (cheapest).
  - `gpt-image-1` (legacy) deprecates **Oct 23 2026** — avoid for new work.
