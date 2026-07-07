# STT Provider Features Comparison

> Feature matrix for all 13 providers integrated in this demo.  
> Data verified July 2026 from official documentation.

Legend: ✅ Supported · ⚠️ Partial/Unclear · ❌ Not supported

---

## Core Transcription Features

| Provider | Model | Speaker Diarization | Word Timestamps | Segment Timestamps | Confidence Scores | Auto Language Detect |
|---|---|---|---|---|---|---|
| **AssemblyAI** | `universal-2` | ✅ +$0.02/hr | ✅ | ✅ | ✅ 0–1 per word | ✅ |
| **Deepgram** | `nova-3` | ✅ +$0.12/hr | ✅ | ✅ | ✅ 0–1 per word | ✅ |
| **Gladia** | `solaria-1` | ✅ Included | ✅ (opt-in) | ✅ | ❌ | ✅ |
| **OpenAI** | `gpt-4o-transcribe-diarize` | ✅ Included | ✅ (`whisper-1` only) | ✅ | ⚠️ Segment-level | ✅ |
| **Groq** | `whisper-large-v3-turbo` | ❌ | ✅ | ✅ | ✅ logprob | ✅ |
| **xAI Grok** | `grok-stt` | ✅ Included | ✅ | ✅ | ❌ | ✅ |
| **Mistral** | `voxtral-mini-latest` | ✅ Included | ✅ | ✅ | ⚠️ Segment-level | ✅ |
| **ElevenLabs** | `scribe_v2` | ✅ Included | ✅ word + char | ✅ | ✅ logprob per word | ✅ |
| **Rev AI** | `reverb-asr` | ✅ Included | ✅ | ✅ | ✅ per word | ⚠️ |
| **Speechmatics** | `enhanced` | ✅ Included | ✅ | ✅ | ✅ per word | ✅ (batch) |
| **pyannoteAI** | `precision-2` | ✅ Core service | ✅ | ✅ | ⚠️ | ✅ |
| **Sonix** | `Sonix AI` | ✅ (30 speakers) | ✅ | ✅ | ✅ | ✅ |
| **Sarvam AI** | `saaras:v3` | ✅ Batch only | ✅ Batch only | ✅ | ❌ | ✅ |

---

## Language & Code-Mixing

| Provider | Language Count | Code-Mixing | Indic Languages | Special Language Features |
|---|---|---|---|---|
| **AssemblyAI** | 99+ (U-2) / 6 (U-3 Pro) | ✅ | ✅ (U-2) | Multilingual code-switching |
| **Deepgram** | 50+ | ✅ Nova-3 | ✅ Hindi, Bengali, Tamil… | 10-lang code-switching (Nova-3) |
| **Gladia** | 100+ | ✅ per-utterance | ✅ Bengali, Punjabi, Tamil, Urdu | code_switching param |
| **OpenAI** | 55 reliable / 98 attempted | ⚠️ Limited | ✅ Hindi, Urdu, Tamil, Telugu… | — |
| **Groq** | 99+ | ⚠️ Whisper capability | ✅ | ISO-639-1 hint improves accuracy |
| **xAI Grok** | 25 | ⚠️ Not specified | ⚠️ | BCP-47 language hint supported |
| **Mistral** | 13 | ⚠️ Not specified | ✅ Hindi only | Context biasing (100 terms) |
| **ElevenLabs** | 90+ | ⚠️ Not specified | ⚠️ | Regional endpoints (US/EU/IN) |
| **Rev AI** | 57 | ⚠️ Not specified | ⚠️ | — |
| **Speechmatics** | 55+ | ✅ Bilingual packs | ✅ Tamil-EN, Malay-EN pack | 2026 bilingual packs; 35% fewer errors |
| **pyannoteAI** | Multilingual | ⚠️ Not documented | ⚠️ | No config needed |
| **Sonix** | 50+ | ❌ Speaker-boundary only | ⚠️ | Single-language detection |
| **Sarvam AI** | 22 Indic | ✅ Optimized | ✅ All 22 Indian langs | Best for Hinglish, Tanglish, etc. |

---

## API Integration Pattern

| Provider | Request Style | Response Style | Polling Required | Avg Latency |
|---|---|---|---|---|
| **AssemblyAI** | Async submit | Polling | ✅ Yes | ~30–60s for short files |
| **Deepgram** | Synchronous | Immediate | ❌ No | Very fast |
| **Gladia** | Upload → Submit | Polling (result_url) | ✅ Yes | Variable |
| **OpenAI** | Synchronous | Immediate | ❌ No | Moderate |
| **Groq** | Synchronous | Immediate | ❌ No | Very fast (LPU) |
| **xAI Grok** | Synchronous | Immediate | ❌ No | Moderate |
| **Mistral** | Synchronous | Immediate | ❌ No | Moderate |
| **ElevenLabs** | Synchronous | Immediate | ❌ No | Moderate |
| **Rev AI** | Async submit | Polling | ✅ Yes | ~2–15 min |
| **Speechmatics** | Async submit | Polling | ✅ Yes | Variable |
| **pyannoteAI** | Async submit | Polling | ✅ Yes | Variable |
| **Sonix** | Async submit | Polling | ✅ Yes | < 15 min |
| **Sarvam AI** | 7-step Batch API | Polling + Download | ✅ Yes | Variable |

---

## Advanced Features

| Provider | Known Speaker ID | PII Redaction | Medical Model | Custom Vocab | Subtitles / Export |
|---|---|---|---|---|---|
| **AssemblyAI** | ❌ | ✅ | ✅ +$0.15/hr | ✅ Keyterms | ✅ SRT/VTT |
| **Deepgram** | ❌ | ✅ | ✅ `nova-3-medical` | ✅ Keywords | ✅ |
| **Gladia** | ❌ | ✅ | ❌ | ✅ Beta | ✅ Beta |
| **OpenAI** | ✅ (up to 4) | ❌ | ❌ | ✅ Prompt | ❌ |
| **Groq** | ❌ | ❌ | ❌ | ✅ Prompt | ❌ |
| **xAI Grok** | ❌ | ❌ | ❌ | ✅ Keyterms | ❌ |
| **Mistral** | ❌ | ❌ | ❌ | ✅ Context bias | ❌ |
| **ElevenLabs** | ❌ | ✅ +30% | ❌ | ✅ 1,000 terms | ❌ |
| **Rev AI** | ❌ | ⚠️ | ❌ | ✅ | ❌ |
| **Speechmatics** | ✅ Enrolled speakers | ✅ | ✅ Enhanced only | ✅ | ✅ |
| **pyannoteAI** | ✅ Voiceprints | ❌ | ❌ | ❌ | ❌ |
| **Sonix** | ❌ | ❌ | ❌ | ❌ | ✅ SRT/VTT/Word/PDF |
| **Sarvam AI** | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Use Case Recommendations

| Use Case | Best Choice | Why |
|---|---|---|
| **General English, best accuracy** | AssemblyAI (U-3 Pro) or Mistral | Highest accuracy on English |
| **Multilingual content** | AssemblyAI (U-2) or Gladia | 99–100+ languages |
| **Indian language content** | Sarvam AI | Purpose-built, code-mixing optimized |
| **Fastest response time** | Groq | LPU hardware, cheapest, synchronous |
| **Cheapest with diarization (sync)** | xAI Grok | $0.10/hr, diarization included, no polling |
| **Lowest cost with diarization** | AssemblyAI U-2 ($0.17/hr) | Best balance of cost + features |
| **Long-form video (>1 hr)** | Rev AI | 17-hour limit, 5 TB via URL |
| **Multi-speaker precision** | pyannoteAI | Diarization-first, voiceprints |
| **Code-mixed Indian content** | Sarvam AI | Hinglish/Tanglish optimized |
| **Tagalog/Tamil-English mixing** | Speechmatics | 2026 bilingual packs |
| **Word-level confidence scores** | ElevenLabs or Groq | logprob per word |
| **Character-level timestamps** | ElevenLabs | Only provider offering char-level |
| **HIPAA compliant** | Rev AI or Mistral | Available |
| **EU data residency** | AssemblyAI or ElevenLabs | Explicit EU endpoints |

---

## Summary Scorecard

| Provider | Cost | Languages | Diarization | Accuracy | File Limits | Integration |
|---|---|---|---|---|---|---|
| **AssemblyAI** | 🟢 $0.17/hr | 🟢 99+ | 🟢 ✅ | 🟢 High | 🟢 Generous | 🟡 Async |
| **Deepgram** | 🟡 $0.58/hr | 🟢 50+ | 🟢 ✅ | 🟢 High | 🔴 10 min cap | 🟢 Sync |
| **Gladia** | 🟡 $0.61/hr ($0.20 Growth) | 🟢 100+ | 🟢 ✅ | 🟢 High | 🟢 135 min | 🟡 Async |
| **OpenAI** | 🟡 $0.36/hr | 🟢 55 | 🟢 ✅ | 🟢 High | 🔴 25 MB | 🟢 Sync |
| **Groq** | 🟢 $0.04/hr | 🟢 99+ | 🔴 ❌ | 🟡 Good | 🟡 100 MB | 🟢 Sync |
| **xAI Grok** | 🟢 $0.10/hr | 🟡 25 | 🟢 ✅ | 🟡 Good | 🟢 500 MB | 🟢 Sync |
| **Mistral** | 🟢 $0.18/hr | 🟡 13 | 🟢 ✅ | 🟢 High | 🟢 1 GB / 3hr | 🟢 Sync |
| **ElevenLabs** | 🟢 $0.22/hr | 🟢 90+ | 🟢 ✅ | 🟢 High | 🟢 3 GB | 🟢 Sync |
| **Rev AI** | 🟢 $0.20/hr | 🟡 57 | 🟢 ✅ | 🟢 High | 🟢 17 hr / 5 TB | 🟡 Async |
| **Speechmatics** | 🔴 $1.04/hr `enhanced` | 🟢 55+ | 🟢 ✅ | 🟢 High | 🟡 2 hr | 🟡 Async |
| **pyannoteAI** | 🟢 €0.112/hr | 🟡 Multi | 🟢 ✅ Best | 🟢 High | 🟡 Unknown | 🟡 Async |
| **Sonix** | 🔴 $10/hr | 🟡 50+ | 🟢 ✅ 30 speakers | 🟡 Good | 🟡 100 MB | 🟡 Async |
| **Sarvam AI** | 🟡 ~$0.54/hr | 🔴 22 (Indic) | 🟢 ✅ Batch | 🟡 ~19% WER | 🟡 1 hr Batch | 🔴 Complex |

🟢 Strong · 🟡 Adequate · 🔴 Limitation
