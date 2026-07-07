# Thumbnail POC — Feature Comparison

> Feature matrix for the three model integrations used in this demo.
> Data verified July 2026 from official documentation.
> Models reflect the current code: `gemini-2.5-pro` (rerank), `gemini-2.5-flash-image` + `gpt-image-1.5` (polish).

Legend: ✅ Supported · ⚠️ Partial / Conditional · ❌ Not supported

---

## Stage Roles

| Stage | Vendor | Model | Purpose |
|---|---|---|---|
| Vision rerank | Google | `gemini-2.5-pro` *(default)* | Score 8–12 candidate frames 1–10 + 1-line rationale, pick top 3 |
| Vision rerank | OpenAI | `gpt-4.1-mini` *(alt)* | Same; selectable per run, strict JSON output |
| Image polish | Google | `gemini-2.5-flash-image` (Nano Banana) | Edit a raw frame → polished thumbnail with text overlay |
| Image polish | OpenAI | `gpt-image-1.5` | Same; runs in parallel for side-by-side A/B comparison |

> **Reranker is selectable per run** (UI toggle, Gemini default). Only one drives the top-3 selection; on failure the pipeline auto-falls-back to the other. **Polish runs both providers in parallel** for A/B.

---

## Core Capabilities

| Capability | Gemini 2.5 Pro (rerank) | Gemini 2.5 Flash Image (polish) | OpenAI gpt-image-1.5 (polish) |
|---|---|---|---|
| Multi-image input | ✅ up to ~16 practical | ✅ | ✅ up to 16 |
| Image-to-image edit | n/a (scoring only) | ✅ Built-in | ✅ `/v1/images/edits` |
| Identity preservation | n/a | ✅ Strong ("character consistency") | ✅ via `input_fidelity: high` |
| Aspect-ratio control | n/a | ❌ No REST param (prompt only) | ✅ `1024x1024`, `1024x1536`, `1536x1024`, `auto` |
| Quality / fidelity tiers | n/a | ❌ Single tier | ✅ `low / medium / high / auto` |
| Output format control | n/a | ❌ Defaults to PNG | ✅ `png / jpeg / webp` |
| Mask / inpaint | n/a | ❌ | ✅ Optional PNG mask |
| JSON-mode response | ❌ (`response_mime_type` rejected on the rerank endpoint) | n/a | n/a |
| Watermark | n/a | ⚠️ Invisible SynthID on every output | ❌ No watermark |

---

## API Integration Pattern

| | Gemini 2.5 Pro | Gemini 2.5 Flash Image | OpenAI gpt-image-1.5 |
|---|---|---|---|
| Endpoint | `…/v1beta/models/gemini-2.5-pro:generateContent` | `…/v1/models/gemini-2.5-flash-image:generateContent` | `https://api.openai.com/v1/images/edits` |
| Auth header | `x-goog-api-key` | `x-goog-api-key` | `Authorization: Bearer` |
| Body type | `application/json` | `application/json` | `multipart/form-data` |
| Image payload | base64 in `parts[].inline_data.data` | base64 in `parts[].inline_data.data` | binary stream `image` field |
| Output location | `candidates[0].content.parts[].text` (JSON string) | `candidates[0].content.parts[].inline_data.data` base64 | `data[0].b64_json` base64 |
| SDK used in POC | ❌ Direct axios | ❌ Direct axios | ❌ Direct axios |
| Request style | Synchronous | Synchronous | Synchronous |

---

## Configuration Used in POC

| Knob | Gemini Rerank | Gemini Polish | OpenAI Polish |
|---|---|---|---|
| `temperature` | 0.2 | n/a | n/a |
| `system_instruction` | static scoring rules (v1beta endpoint) | n/a | n/a |
| `safetySettings` | `BLOCK_NONE` × 4 | `BLOCK_NONE` × 4 | n/a |
| `quality` | n/a | n/a | `high` (code default; `medium` is the cheaper alt) |
| `size` | n/a | n/a | from source aspect (`auto` fallback) |
| `input_fidelity` | n/a | n/a | `high` |
| `output_format` | n/a | n/a | `png` |
| `moderation` | n/a | n/a | `low` |
| `imageSize` | n/a | `2K` arg — **not sent** (omitted from request body) | n/a |
| `n` | n/a | n/a | 1 |
| `timeoutMs` | 60,000 | 60,000 | 120,000 |

> The alt OpenAI reranker (`gpt-4.1-mini`) calls Chat Completions with `response_format: json_schema` (`strict: true`) and `image_url.detail: 'low'`. The Gemini rerank column above reflects `gemini-2.5-pro`.

---

## Safety / Content-Policy Behavior

| Concern | Gemini 2.5 Pro | Gemini 2.5 Flash Image | gpt-image-1.5 |
|---|---|---|---|
| Adjustable HARM_* thresholds | ✅ 4 categories | ✅ same | ✅ `moderation: low \| auto` |
| Hardcoded image-gen rules | n/a | ⚠️ Real-person manipulation rule (`blockReason: 'OTHER'`) — not overridable | ⚠️ Standard filters; `moderation:'low'` reduces false positives |
| CSAM / child safety | ✅ Built-in non-adjustable | ✅ Built-in non-adjustable | ✅ Built-in non-adjustable |
| Default threshold (2.5+) | `OFF` | `OFF` | `auto` |

---

## Output Guarantees

| | Gemini Rerank | Gemini Polish | OpenAI Polish |
|---|---|---|---|
| Deterministic output | ⚠️ (`temperature: 0.2`) | ❌ Stochastic | ❌ Stochastic |
| Exact aspect match to param | n/a | ⚠️ Best-effort via prompt | ✅ Honors `size` enum exactly |
| Preserves input subject identity | n/a | ✅ Default behavior | ✅ with `input_fidelity: high` |
| Text-overlay legibility (5+ words) | n/a | ⚠️ Mixed | ✅ Good at `high` (code default); ⚠️ mixed at `medium` |
| Output size | n/a | Implicit (model decides) | `1024×1024 / 1024×1536 / 1536×1024` |
| Output format | n/a | `image/png` default | `png / jpeg / webp` |

---

## Per-Video Cost (3 picks, both providers in POC)

| Stage · Provider | Subtotal (`medium`) | Subtotal (`high` · code default) |
|---|---|---|
| Vision rerank · Gemini 2.5 Pro | ~$0.01 | ~$0.01 |
| Polish × 3 · Gemini 2.5 Flash Image | $0.117 | $0.117 |
| Polish × 3 · OpenAI gpt-image-1.5 | $0.150 | $0.600 |
| **Total** | **~$0.28** | **~$0.73** |

> Code default is OpenAI `quality: high` (~$0.73/video). `medium` ≈ ~$0.28, `low` ≈ ~$0.17. The `quality` default lives in `openai.js`; the route passes no override.

See `thumbnail-pricing.md` for the full pricing matrix and cheaper modes.

---

## Use-Case Recommendations

| Use Case | Best Choice | Why |
|---|---|---|
| **Cheapest pipeline (production)** | Gemini only | ~$0.13 / video; identity preservation built-in |
| **Best aspect-ratio fidelity** | OpenAI only | Explicit size enum; exact output dims |
| **Best subject identity preservation** | OpenAI w/ `input_fidelity: high` | Hard knob; Gemini's is implicit and varies |
| **No-watermark output** | OpenAI | Gemini bakes invisible SynthID into every output |
| **Faces-heavy thumbnails** | OpenAI | Gemini real-person rule can fire `blockReason: 'OTHER'` |
| **Text-overlay quality** | OpenAI `high` | Best legibility of the set; both still imperfect — plan Canvas/SVG compositing |
| **A/B evaluation in POC** | Both in parallel | What we do today |
| **Lowest re-run cost** | Single provider, lower quality | Drop OpenAI to `medium`/`low` or run Gemini-only |

---

## Known Issues Encountered During POC

| Issue | Affected model | Root cause | Resolution |
|---|---|---|---|
| HTTP 400 `Unknown name 'response_mime_type'` | Gemini (rerank) | `generation_config` rejects this field on the rerank call | Drop the field; carve JSON manually |
| HTTP 400 `Unknown name system_instruction` | Gemini (rerank) | stable `v1` has no `systemInstruction` field | Call the rerank on the `v1beta` endpoint |
| HTTP 400 `Unknown name 'response_modalities'` | Gemini Flash Image | Same | Drop entire `generationConfig` |
| `blockReason: 'OTHER'` no candidates | Gemini Flash Image | Prompt mentioned "preserve identity of real people" | Softened prompt to scene-level language |
| `Invalid body: failed to parse multipart/form-data` | gpt-image (OpenAI) | Node native `fetch` mishandles `form-data` package | Use `axios.post(form, …)` |
| `Non full-range YUV is non-standard` | ffmpeg 8.x mjpeg encoder | Source video `color_range=tv` | Add `format=yuvj420p` to filter chain |
| 0 frames extracted | ffmpeg `select` expr | `eq(mod(t,1),0)` float equality on PTS | Replace with a scene-cut-aware `select` over keyframes (adaptive-fps fallback for huge-GOP sources) |
| Events delayed until pipeline end | fetch + ReadableStream | Vite proxy / fetch buffered the stream | Switch to native EventSource |

---

## Summary Scorecard

| Provider · Model | Cost | Identity | Aspect Control | Watermark | Integration |
|---|---|---|---|---|---|
| **Gemini 2.5 Pro** (rerank) | 🟡 ~$0.01/run | n/a | n/a | n/a | 🟢 Sync REST |
| **Gemini 2.5 Flash Image** (polish) | 🟢 $0.039/img | 🟢 Built-in | 🟡 Prompt-only | 🔴 SynthID | 🟢 Sync REST |
| **OpenAI gpt-image-1.5** (polish, `high`) | 🔴 $0.20/img | 🟢 `input_fidelity:high` | 🟢 Size enum | 🟢 None | 🟢 Sync multipart |

🟢 Strong · 🟡 Adequate · 🔴 Limitation
