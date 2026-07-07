# STT Provider Pricing Comparison

> All prices verified July 2026 from official provider pricing pages.  
> Prices in USD unless noted. Pay-as-you-go / entry tier shown.

---

## Per-Hour Cost (Base Transcription, No Add-ons)

| Provider | Model Used in Demo | Per Minute | Per Hour | Tier / Notes |
|---|---|---|---|---|
| **Groq** | `whisper-large-v3-turbo` | $0.00067 | **$0.04** | Pay-as-you-go |
| **Mistral** | `voxtral-mini-latest` | $0.003 | **$0.18** | Pay-as-you-go |
| **Rev AI** | `reverb-asr` | ~$0.0033 | **$0.20** | Pay-as-you-go |
| **OpenAI** | `gpt-4o-transcribe-diarize` | $0.006 | **$0.36** | Pay-as-you-go |
| **Sarvam AI** | `saaras:v3` | ~$0.006 | **~$0.36** | ₹30/hr (no diarize) |
| **AssemblyAI** | `universal-2` | $0.0025 | **$0.15** | Pay-as-you-go |
| **ElevenLabs** | `scribe_v2` | ~$0.00367 | **$0.22** | Pay-as-you-go (published; −40% Mar 2026) |
| **Speechmatics** | `enhanced` | $0.0173 | **$1.04** | Was $0.24 before 2026 restructure; Standard $0.80; Melia $0.129 |
| **Deepgram** | `nova-3` | $0.0077 | **$0.462** | Pay-as-you-go |
| **Gladia** | `solaria-1` | $0.0102 | **$0.61** | Starter tier; Solaria-3 flagship also available |
| **pyannoteAI** | `precision-2` | ~$0.0019 | **€0.112** (~$0.122) | Diarization; cut from €0.168 |
| **Sonix** | `Sonix AI` | $0.167 | **$10.00** | Standard (PAYG) |

---

## With Diarization Enabled

| Provider | Diarization Cost | Total Per Hour |
|---|---|---|
| **Groq** | ❌ Not available | N/A |
| **Mistral** | Included | **$0.18** |
| **Rev AI** | Included | **$0.20** |
| **OpenAI** | Included (use diarize model) | **$0.36** |
| **Sarvam AI** | +₹15/hr | **~$0.54** (₹45/hr) |
| **AssemblyAI** | +$0.02/hr | **$0.17** |
| **ElevenLabs** | Included | **$0.22** |
| **Speechmatics** | Included | **$1.04** |
| **Deepgram** | +$0.0020/min (+$0.12/hr) | **$0.582** |
| **Gladia** | Included | **$0.61** |
| **pyannoteAI** | Included (core service) | **€0.112** (~$0.122) |
| **Sonix** | Included | **$10.00** |

---

## Sorted by Cost (Cheapest First, with Diarization)

| Rank | Provider | Per Hour (diarization) | Notes |
|---|---|---|---|
| 1 | **Groq** | $0.04 | No diarization — single speaker only |
| 2 | **pyannoteAI** | ~$0.122 (€0.112) | Diarize-first; rate cut from €0.168 in 2026 |
| 3 | **AssemblyAI** | $0.17 | universal-2 + $0.02/hr add-on (u3.5-pro is $0.23) |
| 4 | **Mistral** | $0.18 | Diarization included |
| 5 | **Rev AI** | $0.20 | Diarization included |
| 6 | **ElevenLabs** | $0.22 | Diarization included; published rate (−40% Mar 2026) |
| 7 | **OpenAI** | $0.36 | Diarization included (same price) |
| 8 | **Sarvam AI** | ~$0.54 (₹45) | Indian languages only |
| 9 | **Deepgram** | $0.582 | +$0.12/hr add-on |
| 10 | **Gladia** | $0.61 | Starter tier; Growth: $0.20/hr |
| 11 | **Speechmatics** | $1.04 | `enhanced` (was $0.24); Standard $0.80; Melia $0.129 |
| 12 | **Sonix** | $10.00 | PAYG; Pro plan ≈ $2/hr at full usage |

> **pyannoteAI** — cut to **€0.112/hr (~$0.122)** — is now the cheapest diarization-capable option; **Groq** ($0.04/hr) is cheaper still but has no diarization.  
> **AssemblyAI** at **$0.17/hr** (universal-2 + diarization) still offers the best balance of features, accuracy, and cost; its newer `universal-3.5-pro` flagship is $0.21/$0.23.  
> **Speechmatics** restructured in 2026: `enhanced` jumped to **$1.04/hr** (was $0.24) and Standard is $0.80/hr, but its new **Melia** multilingual model is **$0.129/hr** — the cheapest multilingual option.  
> **Gladia Growth plan** (with volume commitment) drops to **$0.20/hr**; a newer **Solaria-3** flagship sits in the same tier as solaria-1 ($0.61).

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
| **pyannoteAI** | Not specified | Not specified | |
| **Sonix** | 100 MB (direct) | Not specified | Use URL for larger files |

---

## Free Tier Availability

| Provider | Free Credits / Trial |
|---|---|
| **pyannoteAI** | Plan-tiered free hours (Developer / Starter) |
| **Gladia** | 10 hours/month free |
| **Speechmatics** | Free tier (Melia: 10 hours/month) |
| **Sarvam AI** | ₹1,000 (~$12) credits |
| **Groq** | Free tier available (25 MB limit) |
| **OpenAI** | Credits on new accounts |
| **AssemblyAI** | Trial credits on signup |
| **Deepgram** | $200 credits on signup |
| **ElevenLabs** | Free tier (limited) |
| **Mistral** | Free tier (limited) |
| **Rev AI** | Free tier (limited minutes) |
| **Sonix** | No free tier |

---

## Volume / Committed Use Discounts

| Provider | Discount |
|---|---|
| **Gladia** | Growth plan: 67% off ($0.61 → $0.20/hr) |
| **Speechmatics** | 20% off above 500 hrs/month |
| **Deepgram** | Growth plan: ~15% off |
| **Sonix** | Subscription plans: Core $25/mo (5h), Advanced $50/mo (20h), Pro $80/mo (40h) — Pro ≈ $2/hr at full usage; overage $10/hr |
| **Rev AI** | Enterprise negotiation |
| **AssemblyAI** | Volume pricing (contact sales) |
| **Sarvam AI** | Pro/Business plans (rate limit tiers) |
