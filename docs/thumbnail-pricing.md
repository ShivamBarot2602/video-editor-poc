# Thumbnail POC — Pricing Comparison

> All prices verified July 2026 from official provider pricing pages.
> Prices in USD unless noted. Pay-as-you-go / Standard tier shown.
> Models reflect the current code: `gemini-2.5-pro` (rerank), `gemini-2.5-flash-image` + `gpt-image-1.5` (polish).

---

## Per-Call Pricing (the 3 models in this POC)

| Provider | Model | Stage | Unit | Rate |
|---|---|---|---|---|
| **Google** | `gemini-2.5-pro` | Vision rerank (default) | per call (~12 imgs) | **~$0.01** |
| **OpenAI** | `gpt-4.1-mini` | Vision rerank (alt) | per call (~12 imgs) | **~$0.002** |
| **Google** | `gemini-2.5-flash-image` (Nano Banana) | Image polish | per output image | **$0.039** |
| **OpenAI** | `gpt-image-1.5` (`quality: high`, code default) | Image polish | per output image | **$0.20** (portrait / landscape) — $0.133 (square) |

> **Reranker is selectable per run** (UI toggle): `gemini-2.5-pro` (default) or `gpt-4.1-mini`. Only one runs per pipeline; if it fails the other is tried automatically. Either way the rerank cost is a rounding error next to polish.

---

## Per-Video Cost (POC: 3 picks × both providers)

OpenAI `quality` is **documented at both tiers** — the code default is `high`; `medium` is the cheaper alternative.

| Stage | Provider · Model | Calls | Subtotal (`medium`) | Subtotal (`high` · code default) |
|---|---|---|---|---|
| Frame extract | ffmpeg | 1 | $0.000 | $0.000 |
| CV scoring | sharp (in-process) | ~8–60 | $0.000 | $0.000 |
| Vision rerank | Gemini 2.5 Pro | 1 | ~$0.01 | ~$0.01 |
| Polish | Gemini 2.5 Flash Image | 3 | $0.117 | $0.117 |
| Polish | OpenAI gpt-image-1.5 | 3 | $0.150 (3 × $0.05) | $0.600 (3 × $0.20) |
| | | **Total** | **~$0.28** | **~$0.73** |

| Per-video total by OpenAI quality | Gemini polish | OpenAI polish (3 picks) | Total (incl. ~$0.01 rerank) |
|---|---|---|---|
| OpenAI `low` | $0.117 | $0.039 (3 × $0.013) | **~$0.17** |
| OpenAI `medium` | $0.117 | $0.150 (3 × $0.05) | **~$0.28** |
| OpenAI `high` *(code default)* | $0.117 | $0.600 (3 × $0.20) | **~$0.73** |

> The per-image figures are the flat output price. `input_fidelity: high` (set in code) additionally bills **image-input tokens** ($8 / 1M, cached $2 / 1M) — typically ~$0.01–0.03 per high-fidelity edit, not included in the flat number above.

---

## OpenAI gpt-image-1.5 — Full Quality × Size Matrix

| Quality \ Size | 1024×1024 | 1024×1536 (portrait) | 1536×1024 (landscape) |
|---|---|---|---|
| Low | $0.009 | $0.013 | $0.013 |
| Medium | $0.034 | $0.050 | $0.050 |
| **High** *(code default)* | **$0.133** | **$0.200** | **$0.200** |

Image-input tokens: **$8 / 1M** (cached $2 / 1M); image-output tokens: **$32 / 1M**. `moderation: low` (reduces false-positive blocks) has no separate cost line.

---

## Cheaper Modes

| Mode | Cost / video | Notes |
|---|---|---|
| **Both providers, OpenAI `high`** *(code default)* | **~$0.73** | A/B comparison at max OpenAI fidelity |
| Both providers, OpenAI `medium` | ~$0.28 | Same A/B, 4× cheaper OpenAI leg |
| Both providers, OpenAI `low` | ~$0.17 | Cheapest A/B |
| Gemini only | ~$0.13 | $0.117 polish + ~$0.01 rerank; identity preserved by default |
| OpenAI only (`high`) | ~$0.61 | Stronger aspect control, mature size enum |
| Switch reranker `pro → gpt-4.1-mini` | saves ~$0.008/run | Built-in UI toggle; $0.002 vs $0.01 (marginal in absolute terms) |

> **OpenAI lineup — current state (verified July 2026).** The POC runs **`gpt-image-1.5`** (launched Dec 16 2025). OpenAI's *default* flagship is now **GPT Image 2** (launched Apr 21 2026, $0.005–$0.211/img, auto high-fidelity inputs — no `input_fidelity` param). The legacy `gpt-image-1` **deprecates Oct 23 2026**; `gpt-image-1.5` is current and not deprecated. `gpt-image-1-mini` (~$0.005–$0.052/img) is the cheapest option.

---

## Gemini Token Rates

> The rerank stage is token-billed; image polish is per-image flat.

| | `gemini-2.5-pro` (rerank) | `gemini-2.5-flash-image` (polish) |
|---|---|---|
| Input (text / image / video) | $1.25 / 1M (≤200K ctx) · $2.50 / 1M (>200K) | per-image flat |
| Output | $10.00 / 1M (≤200K) · $15.00 / 1M (>200K) | $30.00 / 1M output (= $0.039 / image @ 1,290 tokens, ≤1024px) |
| Batch discount | 50% (not used) | — |
| Context caching | up to 90% savings (not used) | — |

**Per rerank call (~12 frames):** ~4K input tokens + ~500 output ≈ **~$0.01**.

The alternative OpenAI reranker is also token-billed:

| | `gpt-4.1-mini` (rerank) |
|---|---|
| Input (text + image tokens) | $0.40 / 1M |
| Output | $1.60 / 1M |
| Batch / caching | 50% / up to 90% (not used) |

**Per rerank call (~12 frames @ `detail:low`):** ~1–2K input + ~500 output ≈ **~$0.002** (~5× cheaper than `gemini-2.5-pro`). See `thumbnail-providers/openai-rerank.md`.

> **`imageSize: '2K'` is a dead param.** `thumbnailPolish/gemini.js` defaults `imageSize='2K'` but never adds it (nor `generationConfig`) to the request body — the model returns its default (~1024px), so the $0.039 figure holds. Sending a true 2K output would raise the per-image token count and cost.

---

## Free Tier Availability

| Provider | Free tier |
|---|---|
| **Google AI Studio** (Gemini 2.5 Pro + Flash Image) | ✅ Rate-limited free access |
| **OpenAI** | ✅ Credits on new accounts |

---

## Re-run Cost

The pipeline caches frame extraction + CV scoring in S3 (`frames/` + `frame_stats.json`), hydrating them back into a temp dir on a re-run. Re-running on the **same** video only re-incurs:

| Stage | Re-run cost (`high`) |
|---|---|
| Frame extract / CV score | $0 (cached) |
| Gemini rerank (2.5 Pro) | ~$0.01 |
| Polish × 6 (3 Gemini + 3 OpenAI `high`) | ~$0.717 |
| **Total re-run** | **~$0.73** (same as fresh) |

Future "freeze candidates, only refresh selected pick" mode would drop re-run cost substantially.

---

## Cost Guardrails in Current Code

| Risk | Mitigation |
|---|---|
| EventSource auto-reconnect re-fires pipeline | ✅ in-flight-run `Set` → re-entry gets an **SSE `error` event** (HTTP 200, headers already flushed — not a 409 status) so the reconnect can't re-fire the paid pipeline |
| Client closes tab mid-polish | ⚠️ Heartbeat stops, but in-flight HTTPS calls still bill. Future: `AbortController` from `req.on('close')`. |
| Unbounded polish fan-out | ✅ 3 × 2 = 6 jobs OK; future `pLimit(N)` if pick count grows |
| Anyone hits the public stream endpoint | ❌ No auth / rate-limit. **Required before production.** |
| OpenAI `quality: high` default | ⚠️ `openai.js` `polish()` defaults `quality='high'` (~4× `medium`: $0.20 vs $0.05/img landscape). Route passes no override — verify before runs. |
| Reranker choice | ℹ️ Default `gemini-2.5-pro` (~$0.01); switch to `gpt-4.1-mini` (~$0.002) via the UI toggle. Marginal vs the polish leg either way. |
