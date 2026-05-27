# Speech-to-Text (STT) Research — Video Editor POC

## Objective

Evaluate Speech-to-Text providers for integration into the video editor pipeline. The user uploads a video, audio is extracted via ffmpeg, and the audio file is sent to the STT API for batch/async transcription. **Real-time streaming is not required.**

The STT layer powers two primary use cases:

1. **Subtitle generation** — Produce word/segment-level transcripts for `.ass`/`.srt` subtitle creation; optionally burn subtitles directly into the video.
2. **Clip extraction** — Transcribe long-form videos (podcasts, interviews, lectures) and use the transcript to identify and extract short highlight clips for Reels / YouTube Shorts.

---

## Required Features

| Feature | Why It Matters |
|---|---|
| High accuracy STT | Wrong words break subtitles and clip context detection |
| Speaker diarization | Identify "who said what" for multi-speaker content (interviews, podcasts) |
| Word-level timestamps | Required for precise subtitle sync and clip boundary detection |
| Segment-level timestamps | Coarser grouping for paragraph/sentence-level clip detection |
| Multi-language support | Content spans multiple languages |
| Automatic language detection | Avoid requiring users to specify language manually |
| Code-mixing support | Handle videos where speakers switch languages mid-sentence (e.g. Hinglish, Spanglish) |

---

## Provider Comparison

### Pricing (Batch / Async)

> Last verified: April 2026

| Provider | Model | Price per min | Price per hour | Max File Size | Max Duration |
|---|---|---|---|---|---|
| **OpenAI** | `whisper-1` | $0.006 | $0.36 | 25 MB | ~25 min |
| **OpenAI** | `gpt-4o-transcribe` | $0.006 | $0.36 | 25 MB | ~25 min |
| **OpenAI** | `gpt-4o-mini-transcribe` | $0.003 | $0.18 | 25 MB | ~25 min |
| **Groq** | Whisper Large v3 | $0.00185 | $0.111 | 100 MB | — |
| **Groq** | Whisper Large v3 Turbo | $0.00067 | $0.04 | 100 MB | — |
| **xAI** | `grok-stt` | ~$0.00167 | $0.10 | 500 MB | Not documented |
| **AssemblyAI** | Universal-3 Pro | $0.0035 | $0.21 | 2.2 GB (upload) / 5 GB (URL) | 10 hr |
| **AssemblyAI** | Universal-2 | $0.0025 | $0.15 | 2.2 GB (upload) / 5 GB (URL) | 10 hr |
| **Deepgram** | Nova-3 | $0.0065 | $0.39 | 2 GB | 10–20 min |
| **Deepgram** | Nova-3 Multilingual | $0.0092 | $0.55 | 2 GB | 10–20 min |
| **Rev AI** | Reverb ASR | $0.003 | $0.18 | 2 GB (upload) / 5 TB (URL) | 17 hr |
| **Rev AI** | Reverb Turbo | $0.0017 | $0.10 | — | — |
| **Google Cloud** | Chirp 3 | $0.016 | $0.96 | 480 MB | 8 hr |
| **Google Cloud** | Chirp 3 (Dynamic Batch) | $0.004 | $0.24 | 480 MB | 8 hr |
| **AWS Transcribe** | Standard | $0.024 | $1.44 | 2 GB | 4 hr |
| **Azure Speech** | Batch | $0.003 | $0.18 | 1 GB | 4 hr |
| **Gladia** | Solaria-1 | $0.010 | $0.61 | 500 MB | 2.25 hr |
| **Speechmatics** | Standard | $0.004 | $0.24 | 1 GB | 2 hr |
| **Speechmatics** | Enhanced | $0.004+ | $0.24+ | 1 GB | 2 hr |
| **Mistral** | voxtral-mini-transcribe-v2 | $0.003 | $0.18 | — | 3 hr |
| **ElevenLabs** | Scribe v2 | ~$0.0067 | ~$0.40 | 3 GB | Not specified |
| **Sonix** | Sonix AI | $0.167 | $10.00 | 16 GB | Not specified |
| **Sarvam AI** | Saaras v3 | $0.006 | $0.36 (≈ ₹30) | Not specified | 1 hr |

> **xAI** — Grok STT launched April 2026. REST batch at $0.10/hr; streaming at $0.20/hr. Diarization included at no extra charge. 500 MB file cap. Response field for word text is `text` (not `word`). `file` must be the last multipart field. No WER benchmarks published.  
> **Groq** — max duration not explicitly documented; bounded by the 100 MB file size cap.
> **Deepgram** — 10–20 min cap per request makes it impractical for long-form video without chunking.
> **OpenAI** — 25 MB cap requires audio compression or chunking for most video files.
> **Sarvam AI** — pricing is ₹30/hr; converted at ≈ ₹84/USD.
> **Google Cloud** — Dynamic Batch tier has ~24 hr turnaround; 75% cheaper than standard.
> **AssemblyAI** — Diarization is a +$0.02/hr add-on for Universal-3 Pro; Universal-2 also +$0.02/hr.
> **Mistral** — voxtral-mini-transcribe-v2 (Feb 2026); prior model was voxtral-mini-latest at $0.001/min with a 30 min cap.
> **ElevenLabs** — Scribe v2 pricing is ~$0.40/hr; surcharges apply for entity detection (+30%), speaker role detection (+10%), and keyterms biasing (+20%). Minimum billable duration is 20 s when using >100 keyterms.

---

### Feature Support

| Provider | Model | Accuracy | Speaker Diarization | Word Timestamps | Languages | Auto Language Detect | Code-Mixing |
|---|---|---|---|---|---|---|---|
| **OpenAI** | `whisper-1` | ~2.7% WER | ❌ | ✅ | 99 | ✅ | ⚠️ Limited |
| **OpenAI** | `gpt-4o-transcribe` | Top-tier | ✅ | ✅ | 99 | ✅ | ⚠️ Limited |
| **Groq** | Whisper Large v3 | ~8.4% WER | ❌ | ✅ | 99 | ✅ | ✅ |
| **Groq** | Distil-Whisper | ~2.4% WER | ❌ | ✅ | 99 | ✅ | ✅ |
| **xAI** | grok-stt | Not published | ✅ Included | ✅ | 25 | ✅ | ⚠️ Unclear |
| **AssemblyAI** | Universal-3 Pro | Best-in-class | ✅ +add-on | ✅ | 6 | ✅ | ✅ |
| **AssemblyAI** | Universal-2 | ~2.9% diar. error | ✅ +add-on | ✅ | 99 | ✅ | ✅ |
| **Deepgram** | Nova-3 | ~7.6% WER | ✅ | ✅ | 57 | ✅ | ⚠️ Unclear |
| **Deepgram** | Nova-3 Multilingual | High | ✅ | ✅ | 57 | ✅ | ⚠️ Unclear |
| **Rev AI** | Reverb ASR | ~14% WER | ✅ | ✅ | 57 | ⚠️ Unclear | ⚠️ Unclear |
| **Rev AI** | Reverb Turbo | Competitive | ✅ | ✅ | 57 | ⚠️ Unclear | ⚠️ Unclear |
| **Google Cloud** | Chirp 3 | Top-tier | ✅ | ✅ | 125+ | ✅ | ✅ |
| **AWS Transcribe** | Standard | 94–96% | ✅ | ✅ | 100+ | ✅ | ⚠️ Unclear |
| **Azure Speech** | Batch | High | ⚠️ Limited | ✅ | 85+ | ⚠️ Unclear | ⚠️ Unclear |
| **Gladia** | Solaria-1 | ~94% word acc | ✅ Excellent | ✅ | 100+ | ✅ | ✅ |
| **Speechmatics** | Standard | Competitive | ✅ | ✅ | 55+ | ✅ (`language_identification`) | ✅ |
| **Speechmatics** | Enhanced | Best-in-class (claimed) | ✅ | ✅ | 55+ | ✅ (`language_identification`) | ✅ |
| **Mistral** | voxtral-mini-transcribe-v2 | Very High | ✅ | ✅ | 13 | ✅ | ⚠️ Unclear |
| **ElevenLabs** | Scribe v2 | High | ✅ | ✅ word | 32+ | ✅ | ⚠️ Unclear |
| **Sonix** | Sonix AI | 85–95% | ✅ (up to 30 speakers) | ✅ | 53 | ✅ (single-language) | ⚠️ Between speakers only |
| **Sarvam AI** | Saaras v3 | ~19.3% WER (Indic) | ✅ | ✅ | 23 (22 Indic + EN) | ✅ | ✅ Optimized for Indic |

Legend: ✅ Supported &nbsp;|&nbsp; ⚠️ Partial / Unclear &nbsp;|&nbsp; ❌ Not supported

---

## Notes per Provider

**OpenAI Whisper / GPT-4o Transcribe** — Three tiers: `whisper-1` (legacy, no diarization), `gpt-4o-transcribe` (top accuracy, diarization included, $0.006/min), and `gpt-4o-mini-transcribe` (half price, no diarization). All three have a 25 MB file size cap — files need to be chunked or heavily compressed. Best choice when accuracy is paramount and files are short.

**xAI (Grok STT)** — Launched April 2026. Single synchronous REST call (`POST https://api.x.ai/v1/stt`) — no polling. Diarization and word-level timestamps included at the base $0.10/hr price, making it the cheapest diarization-capable option with a synchronous API. 25 languages supported (narrower than AssemblyAI or Gladia). No published WER benchmarks. 500 MB file limit comfortably handles long-form video audio. The word-level response field is named `text` (not `word`) — integration maps this internally. Multipart form requires `file` to be the last field.

**Groq** — Runs Whisper models on their ultra-fast LPU inference hardware. No speaker diarization (same Whisper limitation). The 100 MB cap is still limiting for raw video audio — chunking needed for longer content. Whisper Large v3 Turbo at $0.04/hr is the cheapest option across all providers. Code-mixing works since it inherits Whisper's multilingual capabilities.

**AssemblyAI** — Two models: Universal-3 Pro (highest accuracy, 6 languages, $0.21/hr) and Universal-2 (99 languages, $0.15/hr). Diarization is now a +$0.02/hr add-on on both. Best-in-class diarization quality. Code-mixing supported. Generous 10 hr / 5 GB limit makes it suitable for long-form content with no pre-processing needed. For multilingual content, Universal-2 is the better pick.

**Deepgram** — Strong accuracy and competitive pricing, but the 10–20 min max duration per request is a hard constraint for long videos — a chunking layer is required. Nova-3 Monolingual is $0.0065/min for pre-recorded; Nova-3 Multilingual is $0.0092/min. Supports 57 languages.

**Rev AI** — Most permissive limits (17 hr, 5 TB via URL). Added Reverb Turbo at $0.10/hr for faster, cost-efficient jobs. Good for high-volume English-heavy batch jobs. Weakest on multilingual and code-mixing requirements.

**Google Cloud (Chirp 3)** — Widest language coverage (125+). Strong code-switching support. The Dynamic Batch tier now costs only $0.004/min (75% off standard) with ~24 hr turnaround — competitive for non-time-sensitive workloads. Most expensive at standard rate; best suited for content with rare/low-resource languages or existing GCP infrastructure.

**AWS Transcribe** — Enterprise tooling (PII redaction, HIPAA, medical). Aggressive volume tiering at scale — drops to $0.0102/min above 1 M minutes/month. Highest base price; weaker on accuracy vs. specialized providers.

**Azure Speech** — Batch price halved to $0.003/min ($0.18/hr). Diarization included at no extra charge for batch jobs. Best for Microsoft-stack deployments and now one of the cheaper diarization-capable options.

**Gladia (Solaria-1)** — Explicit code-switching support. Up to 3× lower diarization error rate than competitors per their benchmarks. File size limit tightened to 500 MB (was 1 GB). The 2.25 hr duration cap may require chunking for long-form content. Growth plan drops to $0.20/hr for volume users.

**Mistral (Voxtral Mini Transcribe V2)** — Major update in Feb 2026: new model `voxtral-mini-transcribe-v2` triples the price to $0.003/min but extends the max duration from 30 min to **3 hours**. Speaker diarization and word-level timestamps are both supported without the constraint that existed in the prior model (V1 required omitting `language` to enable word timestamps). 13 supported languages with auto-detection. REST API is OpenAI-compatible (`POST /v1/audio/transcriptions`). Open-source weights also available. **Note:** The codebase currently targets `voxtral-mini-latest` — update the model ID to `voxtral-mini-transcribe-v2` and remove the timestamp/language workaround if updating.

**Speechmatics** — Two operating points: **Enhanced** (highest accuracy, best for domain-specific terminology) and **Standard** (faster, cost-effective). Code-mixing is now explicitly confirmed ✅ — Speechmatics launched bilingual packs in 2026 (Tagalog-English, Malay-English, Tamil-English, Mandarin-English, Arabic-English) with 35% fewer errors than the closest competitor. 55+ languages with automatic language identification. Speaker diarization and word-level timestamps both supported. 1 GB upload limit, 2 hr max per job. REST API — submit multipart job, poll for status, fetch `json-v2` transcript.

**ElevenLabs (Scribe v2)** — Single synchronous REST call (no polling). Returns word-level timestamps with per-word logprob confidence scores and speaker labels when `diarize: true`. Segments are constructed client-side by grouping consecutive same-speaker words. `timestamps_granularity: "word"` enables character-level timestamps too. Optional add-ons: entity detection/redaction (+30%), speaker role detection (agent vs customer, +10%), keyterms biasing (+20%). Max 3 GB file upload or 2 GB via cloud URL. No max duration documented. Auto language detection when `language_code` is omitted; otherwise accepts ISO-639-1/3 codes.

**Sonix** — Consumer-oriented product; $10/hr is the most expensive in this list. Supports up to 30 speaker labels. Code-mixing works best at speaker boundaries, not mid-sentence. No API for programmatic access — primarily a web UI tool.

**Sarvam AI** — Purpose-built for Indian languages (22 Indic + English). Strong code-mixing support for Indic language pairs (Hinglish, Tanglish, etc.). Diarization is ₹45/hr (~$0.54) vs ₹30/hr without. 1 hr per job limit and higher WER (~19%) on Indic benchmarks limits it for general-purpose use, but it's the best option if the primary audience speaks Indian languages. Our integration uses the **Batch API** (REST API is limited to 30s audio); the 7-step flow creates a job, uploads audio to Azure Blob via presigned URL, starts processing, polls for completion, then downloads the result JSON. Result includes word-level timestamps (`timestamps.words[]` parallel arrays) and segment-level diarization (`diarized_transcript[].{speaker_id, transcript, start_time_seconds, end_time_seconds}`).

---

## Shortlist for POC

| Rank | Provider | Reasoning |
|---|---|---|
| 🥇 **AssemblyAI** (Universal-2) | Covers all required features; best diarization; code-mixing supported; highest file/duration limits; 99 languages; most affordable when balancing features vs cost ($0.17/hr with diarization) |
| 🥈 **Gladia** | Excellent diarization accuracy; explicit code-switching; built-in enrichment add-ons (translation, summarization); competitive pricing; Growth plan at $0.20/hr |
| 🥉 **Google Cloud Chirp 3** | Best language coverage (125+); strong code-mixing; Dynamic Batch tier at $0.004/min makes it cost-competitive for non-urgent jobs |
| 🏅 **Sarvam AI** | Best choice if targeting Indian language content; optimized Indic code-mixing; very affordable at ₹30/hr |

**Self-hosted fallback — Whisper + pyannote.audio:** Running Whisper locally eliminates API cost entirely. Diarization is handled by pyannote.audio. Requires GPU infrastructure. Groq's hosted Whisper Large v3 Turbo at $0.04/hr is a middle ground with fast inference and no GPU ops overhead.

---

## Pipeline Architecture

```
User uploads video
       │
       ▼
Audio extraction (ffmpeg → .wav / .mp3)
       │
       ▼
STT API — Batch/Async (AssemblyAI / Gladia)
       │
       ├── Word-level timestamps  ──► .ass / .srt subtitle generation
       ├── Speaker labels         ──► Speaker-aware subtitle styling
       └── Segment transcript     ──► LLM prompt for clip extraction
                                              │
                                              ▼
                                   ffmpeg clip cuts → Reels / Shorts
                                              │
                                              ▼
                                   Optional: burn-in subtitles (libass)
```

---

## References

- [AssemblyAI Pricing](https://www.assemblyai.com/pricing) · [Universal-3 Pro](https://www.assemblyai.com/universal-3-pro) · [File Size Limits](https://support.assemblyai.com/articles/9208125065-are-there-any-limits-on-file-size-or-file-duration-for-files-submitted-to-the-api)
- [Deepgram Pricing](https://deepgram.com/pricing) · [Nova-3 Intro](https://deepgram.com/learn/introducing-nova-3-speech-to-text-api) · [Models & Languages](https://developers.deepgram.com/docs/models-languages-overview)
- [Rev AI Pricing](https://www.rev.ai/pricing) · [Async API Docs](https://docs.rev.ai/api/asynchronous/)
- [Google Cloud STT Pricing](https://cloud.google.com/speech-to-text/pricing) · [Batch Recognize](https://docs.cloud.google.com/speech-to-text/docs/batch-recognize)
- [AWS Transcribe Pricing](https://aws.amazon.com/transcribe/pricing/) · [Limits & Guidelines](https://docs.aws.amazon.com/transcribe/latest/dg/limits-med-guidelines.html)
- [Azure Speech Pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/) · [Quotas & Limits](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits)
- [Gladia Pricing](https://www.gladia.io/pricing) · [Supported Formats & Limits](https://docs.gladia.io/chapters/limits-and-specifications/supported-formats)
- [Mistral Voxtral Transcribe 2 Announcement](https://mistral.ai/news/voxtral-transcribe-2) · [Audio Transcriptions API](https://docs.mistral.ai/api/endpoint/audio/transcriptions)
- [Speechmatics Pricing](https://www.speechmatics.com/pricing#stt_features) · [Batch Quickstart](https://docs.speechmatics.com/speech-to-text/batch/quickstart) · [Languages](https://www.speechmatics.com/languages)
- [OpenAI Audio API FAQ](https://help.openai.com/en/articles/7031512-audio-api-faq)
- [Groq Pricing](https://groq.com/pricing) · [Speech-to-Text Docs](https://console.groq.com/docs/speech-to-text)
- [xAI API Pricing](https://x.ai/api) · [Speech-to-Text Docs](https://docs.x.ai/developers/models/speech-to-text) · [Grok STT Announcement](https://x.ai/news/grok-stt-and-tts-apis)
- [Sonix Pricing](https://sonix.ai/pricing) · [Languages & File Types](https://sonix.ai/list-of-languages-and-filetypes)
- [Sarvam AI Pricing](https://www.sarvam.ai/api-pricing) · [Saaras v3 Docs](https://www.sarvam.ai/apis/speech-to-text)
