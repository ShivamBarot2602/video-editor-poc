# STT Provider Pricing Comparison

> All prices verified May 2026 from official provider pricing pages.  
> Prices in USD unless noted. Pay-as-you-go / entry tier shown.

---

## Per-Hour Cost (Base Transcription, No Add-ons)

| Provider | Model Used in Demo | Per Minute | Per Hour | Tier / Notes |
|---|---|---|---|---|
| **Groq** | `whisper-large-v3-turbo` | $0.00067 | **$0.04** | Pay-as-you-go |
| **xAI Grok** | `grok-stt` | ~$0.00167 | **$0.10** | Pay-as-you-go (REST batch) |
| **Mistral** | `voxtral-mini-latest` | $0.003 | **$0.18** | Pay-as-you-go |
| **Rev AI** | `reverb-asr` | $0.003 | **$0.18** | Pay-as-you-go |
| **OpenAI** | `gpt-4o-transcribe-diarize` | $0.006 | **$0.36** | Pay-as-you-go |
| **Sarvam AI** | `saaras:v3` | ~$0.006 | **~$0.36** | ₹30/hr (no diarize) |
| **AssemblyAI** | `universal-2` | $0.0025 | **$0.15** | Pay-as-you-go |
| **ElevenLabs** | `scribe_v2` | ~$0.0067 | **~$0.40** | Usage-based (estimated) |
| **Speechmatics** | `enhanced` | $0.004 | **$0.24** | Pro tier (480 min/mo included) |
| **Deepgram** | `nova-3` | $0.0077 | **$0.462** | Pay-as-you-go |
| **Gladia** | `solaria-1` | $0.0102 | **$0.61** | Starter tier |
| **pyannoteAI** | `precision-2` | ~$0.003 | **€0.168** (~$0.183) | Diarize + STT orchestration |
| **Sonix** | `Sonix AI` | $0.167 | **$10.00** | Standard (PAYG) |

---

## With Diarization Enabled

| Provider | Diarization Cost | Total Per Hour |
|---|---|---|
| **Groq** | ❌ Not available | N/A |
| **xAI Grok** | Included | **$0.10** |
| **Mistral** | Included | **$0.18** |
| **Rev AI** | Included | **$0.18** |
| **OpenAI** | Included (use diarize model) | **$0.36** |
| **Sarvam AI** | +₹15/hr | **~$0.54** (₹45/hr) |
| **AssemblyAI** | +$0.02/hr | **$0.17** |
| **ElevenLabs** | Included | **~$0.40** |
| **Speechmatics** | Included | **$0.24** |
| **Deepgram** | +$0.0020/min (+$0.12/hr) | **$0.582** |
| **Gladia** | Included | **$0.61** |
| **pyannoteAI** | Included (core service) | **€0.168** (~$0.183) |
| **Sonix** | Included | **$10.00** |

---

## Sorted by Cost (Cheapest First, with Diarization)

| Rank | Provider | Per Hour (diarization) | Notes |
|---|---|---|---|
| 1 | **Groq** | $0.04 | No diarization — single speaker only |
| 2 | **xAI Grok** | $0.10 | Diarization included; synchronous |
| 3 | **AssemblyAI** | $0.17 | +$0.02/hr add-on |
| 4 | **Mistral** | $0.18 | Diarization included |
| 5 | **Rev AI** | $0.18 | Diarization included |
| 6 | **pyannoteAI** | ~$0.183 (€0.168) | Diarize-first approach |
| 7 | **Speechmatics** | $0.24 | Diarization included |
| 8 | **OpenAI** | $0.36 | Diarization included (same price) |
| 9 | **ElevenLabs** | ~$0.40 | Pricing not public; estimated |
| 10 | **Sarvam AI** | ~$0.54 (₹45) | Indian languages only |
| 11 | **Deepgram** | $0.582 | +$0.12/hr add-on |
| 12 | **Gladia** | $0.61 | Starter tier; Growth: $0.20/hr |
| 13 | **Sonix** | $10.00 | Premium: $5.00/hr |

> **xAI Grok** at **$0.10/hr** is now the cheapest diarization-capable provider with a synchronous API.  
> **AssemblyAI** at **$0.17/hr** (universal-2 + diarization) offers the best balance of features, accuracy, and cost.  
> **Gladia Growth plan** (with volume commitment) drops to **$0.20/hr** — competitive with AssemblyAI.

---

## File & Duration Limits Comparison

| Provider | Max File Size | Max Duration | Notes |
|---|---|---|---|
| **Rev AI** | 5 TB (URL) / 2 GB | **17 hours** | Most permissive |
| **ElevenLabs** | 3 GB | Not specified | |
| **Sarvam AI** | Not specified | **1 hour** (Batch) | REST API: 30s only |
| **Mistral** | 1 GB | **3 hours** | |
| **Speechmatics** | Not specified | **2 hours** | |
| **AssemblyAI** | ~5 GB (URL) | ~10 hours | |
| **Gladia** | 1,000 MB | **135 min** | Enterprise: 255 min |
| **Deepgram** | 2 GB | **10 min** ⚠️ | Requires chunking! |
| **OpenAI** | **25 MB** ⚠️ | ~25 min | Most restrictive |
| **Groq** | 100 MB | ~100 min | Rate-limited to 2 hrs audio/hr |
| **xAI Grok** | **500 MB** | Not documented | WAV, MP3, MP4, M4A, WebM, OGG |
| **pyannoteAI** | Not specified | Not specified | |
| **Sonix** | 100 MB (direct) | Not specified | Use URL for larger files |

---

## Free Tier Availability

| Provider | Free Credits / Trial |
|---|---|
| **pyannoteAI** | 150 hours free (no card required) |
| **Gladia** | 10 hours/month free |
| **Speechmatics** | 480 min/month free |
| **Sarvam AI** | ₹1,000 (~$12) credits |
| **Groq** | Free tier available (25 MB limit) |
| **OpenAI** | Credits on new accounts |
| **AssemblyAI** | Trial credits on signup |
| **Deepgram** | $200 credits on signup |
| **ElevenLabs** | Free tier (limited) |
| **Mistral** | Free tier (limited) |
| **Rev AI** | Free tier (limited minutes) |
| **xAI Grok** | No free tier documented (check x.ai/api) |
| **Sonix** | No free tier |

---

## Volume / Committed Use Discounts

| Provider | Discount |
|---|---|
| **Gladia** | Growth plan: 67% off ($0.61 → $0.20/hr) |
| **Speechmatics** | 20% off above 500 hrs/month |
| **Deepgram** | Growth plan: ~15% off |
| **Sonix** | Premium plan: 50% off ($10 → $5/hr) |
| **Rev AI** | Enterprise negotiation |
| **AssemblyAI** | Volume pricing (contact sales) |
| **Sarvam AI** | Pro/Business plans (rate limit tiers) |
