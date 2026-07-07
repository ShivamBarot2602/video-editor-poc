---
pdf_options:
  format: a4
  landscape: true
  margin: 14mm 14mm 16mm 14mm
  printBackground: true
css: |
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
         color: #1e293b !important; font-size: 12px; line-height: 1.5; }
  h1, h2, h3, h4 { font-family: inherit !important; font-weight: 700; break-after: avoid; }
  h1 { color: #0f172a !important; font-size: 26px; margin: 0 0 2px; border: none; }
  h1 + p { margin-top: 4px; }
  h2 { color: #1D4ED8 !important; font-size: 17px; margin: 4px 0 9px; padding-bottom: 5px;
       border-bottom: 2px solid #1D4ED8; }
  h3 { color: #1e3a8a !important; font-size: 13.5px; margin: 18px 0 6px; }
  p, li { margin: 6px 0; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 10.5px;
          break-inside: avoid; }
  th { background: #1D4ED8 !important; color: #fff !important; text-align: left; padding: 6px 8px;
       border: 1px solid #1D4ED8; font-weight: 600; }
  td { padding: 5px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f1f5f9 !important; }
  code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
         background: #eef2ff !important; color: #3730a3 !important; padding: 1px 4px;
         border-radius: 3px; font-size: 0.85em !important; overflow-wrap: anywhere; }
  blockquote { margin: 10px 0; padding: 8px 14px; background: #eff6ff !important;
               border-left: 4px solid #1D4ED8; color: #334155 !important; break-inside: avoid; }
  strong { color: #0f172a; }
  .subtitle { color: #475569; font-size: 13px; margin: 2px 0 0; }
  .meta { color: #64748b; font-size: 11px; margin-top: 6px; }
  .legend { font-size: 10.5px; color: #475569; }
---

# Speech-to-Text Provider Evaluation

<p class="subtitle">Which STT provider to use for the subtitle &amp; clip-extraction pipeline — what it costs, what it supports, and how each is wired into the POC.</p>
<p class="meta">Proof of concept · 12 providers benchmarked · Prices &amp; features verified July 2026 against each provider's own pricing/docs pages.</p>

## 1. Overview &amp; Objective

The goal was to find the best speech-to-text provider for subtitles and clip extraction — weighing **accuracy, speaker diarization, language coverage, and cost**. Rather than commit to one vendor, we integrated **12 providers** behind a single normalised result shape, so the subtitle and clip logic is provider-agnostic and any provider can be swapped in per video.

Audio is extracted once via ffmpeg (16 kHz mono WAV), sent to the chosen provider, and every response is normalised to a common `{ metadata, segments[], full_transcript }` shape before subtitle/clip logic runs.

## 2. Recommendation

Best pick depends on the job. Prices are per hour of audio **with speaker diarization enabled**.

| Use case | Pick | Price | Why |
|---|---|---|---|
| **★ Default — best overall value** | **AssemblyAI** | $0.17/hr · 99+ langs | Highest accuracy + best-in-class diarization at a low price; multilingual + code-mixed; generous limits, no chunking. |
| Cheapest overall | Groq | $0.04/hr · fastest | Unbeatable price/speed — but no diarization. Single-speaker only. |
| Indian / code-mixed | Sarvam AI | ~$0.54/hr · 22 Indic | Purpose-built for Hinglish / Tanglish and Indian languages. |
| Long-form (> 1 hr) | Rev AI | $0.20/hr · up to 17 hr | Most permissive limits (17 hr / 5 TB) — no chunking. |
| Best for free evaluation | pyannoteAI | €0.112/hr · free tier | Lowest per-hour rate here; diarization-first with voiceprints. |

> **Bottom line:** Ship on **AssemblyAI** as the default (best balance of accuracy, features, and cost at $0.17/hr). Use **pyannoteAI** (€0.112/hr) when cost matters most and you need diarization, **Groq** ($0.04/hr) for single-speaker content, and **Sarvam AI** for Indian-language audiences.

> **Watch out:** Sonix is $10/hr and Speechmatics' `enhanced` jumped to $1.04/hr in 2026; Deepgram caps requests at 10 min and OpenAI at 25 MB — both need chunking for full-length video.

<div class="page-break"></div>

## 3. Pricing

USD per hour, pay-as-you-go / entry tier. Sorted cheapest-first by the with-diarization rate. The **Model** column is the id the POC actually pins; newer flagships are noted below the table.

| Provider | Model | Base / hr | With diarization | Languages | File / duration limit | Free tier |
|---|---|---|---|---|---|---|
| Groq | `whisper-large-v3-turbo` | $0.04 | N/A (no diarize) | 99+ | 100 MB | Free tier |
| pyannoteAI | `precision-2` | €0.112 | €0.112 | Multi | Not stated | Free tier |
| **AssemblyAI ★** | `universal-2` | **$0.15** | **$0.17** | 99+ | ~5 GB / ~10 hr | Trial credits |
| Mistral | `voxtral-mini-latest` | $0.18 | $0.18 | 13 | 1 GB / 3 hr | Limited |
| Rev AI | `reverb-asr` | $0.20 | $0.20 | 57 | 5 TB / 17 hr | Limited |
| ElevenLabs | `scribe_v2` | $0.22 | $0.22 | 90+ | 3 GB | Limited |
| OpenAI | `gpt-4o-transcribe-diarize` | $0.36 | $0.36 | 55+ | 25 MB | New acct credits |
| Sarvam AI | `saaras:v3` | ~$0.36 | ~$0.54 | 22 Indic | 1 hr (Batch) | ₹1,000 credits |
| Deepgram | `nova-3` | $0.462 | $0.582 | 50+ | 2 GB / 10 min | $200 credits |
| Gladia | `solaria-1` | $0.61 | $0.61 | 100+ | 1 GB / 135 min | 10 hr/mo |
| Speechmatics | `enhanced` | $1.04 | $1.04 | 55+ | 2 hr | Free tier |
| Sonix | `Sonix AI` | $10.00 | $10.00 | 53+ | 100 MB | None |

- **Speechmatics** restructured in 2026: `enhanced` batch is now **$1.04/hr** (was $0.24) and Standard is $0.80/hr — but its new **Melia** multilingual model is just **$0.129/hr** (10 hr/mo free), the cheapest multilingual option here.
- **pyannoteAI** cut its rate to **€0.112/hr** (was €0.168); free hours are now tied to plan tiers rather than a flat 150-hour grant.
- **AssemblyAI** ships a newer `universal-3.5-pro` flagship ($0.21 base / $0.23 w/ diarization); the POC still pins `universal-2` ($0.15 / $0.17), which remains available and cheaper.
- **Mistral**'s `voxtral-mini-latest` alias now resolves to **Voxtral Transcribe 2** (price unchanged); **Gladia** added a `Solaria-3` flagship (same tier; Growth plan reaches $0.20/hr on volume).
- **ElevenLabs** Scribe v2 stayed at $0.22/hr; **Sonix** PAYG is still $10/hr (Pro ≈ $2/hr at full usage).

<div class="page-break"></div>

## 4. Feature Comparison

<p class="legend">✅ Supported · ⚠️ Partial / unclear · ❌ Not supported</p>

| Provider | Diarization | Word timestamps | Code-mixing | Languages | Auto detect |
|---|---|---|---|---|---|
| **AssemblyAI ★** | ✅ | ✅ | ✅ | 99+ | ✅ |
| Deepgram | ✅ | ✅ | ✅ | 50+ | ✅ |
| Gladia | ✅ | ✅ | ✅ | 100+ | ✅ |
| OpenAI | ✅ | ⚠️ segment | ⚠️ | 55+ | ✅ |
| Groq | ❌ | ✅ | ⚠️ | 99+ | ✅ |
| Mistral | ✅ | ✅ | ⚠️ | 13 | ✅ |
| ElevenLabs | ✅ | ✅ word+char | ⚠️ | 90+ | ✅ |
| Rev AI | ✅ | ✅ | ⚠️ | 57 | ⚠️ |
| Speechmatics | ✅ | ✅ | ✅ bilingual | 55+ | ✅ |
| pyannoteAI | ✅ best | ✅ | ⚠️ | Multi | ✅ |
| Sonix | ✅ 30 spk | ✅ | ❌ | 53+ | ✅ |
| Sarvam AI | ✅ | ✅ | ✅ Indic | 22 Indic | ✅ |

- Only **Groq** lacks diarization; **ElevenLabs** is the only provider with character-level timestamps.

<div class="page-break"></div>

## 5. Technical Implementation (current POC)

Audio is extracted once via ffmpeg (16 kHz mono WAV), then sent to the chosen provider; every response is normalised to a common shape so subtitle/clip logic is provider-agnostic. **5 providers respond synchronously, 6 use async submit-then-poll, and AssemblyAI's SDK handles upload + polling.** 9 of 12 APIs support webhooks, but the POC polls everywhere for uniformity (so the webhook column reads "not used in POC").

| Provider | Request style | Polling (interval / timeout) | Webhooks (API support) | Audio pre-processing |
|---|---|---|---|---|
| **AssemblyAI ★** | Async (SDK) | SDK-managed (upload + poll) | Yes — not used in POC | WAV |
| Deepgram | Sync (SDK) | — | Yes — not used in POC | WAV |
| OpenAI | Sync REST | — | No (sync, inline) | WAV → MP3 128 kbps (25 MB) |
| Groq | Sync REST | — | No (sync, inline) | WAV → MP3 128 kbps (100 MB) |
| Mistral | Sync REST | — | No (sync, inline) | WAV |
| ElevenLabs | Sync REST | — | Yes — not used (async mode) | WAV |
| Gladia | Async batch | upload → submit → poll · 3 s / 20 min | Yes — not used in POC | WAV |
| Rev AI | Async batch | submit → poll → fetch · 5 s / 1 hr | Yes — not used in POC | WAV |
| Speechmatics | Async batch | submit → poll → fetch · 3 s / 10 min | Yes — not used in POC | WAV |
| Sonix | Async batch | upload → poll → fetch · 3 s / 30 min | Yes — not used in POC | WAV |
| pyannoteAI | Async batch | presign → upload → submit → poll · 3 s / 20 min | Yes — not used in POC | WAV |
| Sarvam AI | Async batch | job → upload → start → poll → download · 5 s / 20 min | Yes — not used in POC | WAV |

- **pyannoteAI** uses `/v1/diarize` (precision-2) + faster-whisper for text — not the documented STT-orchestration bundle.
- **Mistral** returns word timestamps only in auto-detect mode (no language set); **OpenAI** diarize is segment-level only and has no chunking yet.

## 6. References

- Provider pricing/docs pages verified individually July 2026 (AssemblyAI, Deepgram, Gladia, OpenAI, Groq, Mistral, ElevenLabs, Rev AI, Speechmatics, pyannoteAI, Sonix, Sarvam AI).
- Internal deep-dives — `STT_RESEARCH.md` · `docs/pricing-comparison.md` · `docs/features-comparison.md` · `docs/providers/*.md`
- Live interactive report — the `/docs/subtitles` route in the SP Video Editor app.
