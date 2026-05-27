# Deepgram

> Fast, scalable speech-to-text with Nova-3 — one of the most accurate models for pre-recorded audio.

---

## Models

| Model ID | Variant | Use Case |
|---|---|---|
| `nova-3` | Monolingual (50+ langs) | Fast, accurate general-purpose |
| `nova-3-medical` | Medical (English) | Healthcare domain |
| `nova-2-general` | Multilingual | Legacy, 20+ languages |
| `nova-2-<domain>` | Domain-specific | meeting, phonecall, finance, video, voicemail… |
| `flux-general-en` | English only | Latest model (Flux family) |
| `flux-general-multi` | 10 languages | Latest multilingual |
| `enhanced` | 15+ languages | Older high-accuracy tier |
| `base` | 17+ languages | Older cost-efficient tier |
| `whisper-<size>` | Cloud Whisper | 5 sizes: tiny → large |

**Used in this demo:** `nova-3`

---

## Pricing

> Source: [deepgram.com/pricing](https://deepgram.com/pricing) — verified May 2026

### Pre-Recorded (Batch)

| Model | Pay-As-You-Go / min | Pay-As-You-Go / hr | Growth / min | Growth / hr |
|---|---|---|---|---|
| Flux | $0.0077 | $0.462 | $0.0065 | $0.39 |
| Nova-3 Monolingual | $0.0077 | $0.462 | $0.0065 | $0.39 |
| Nova-3 Multilingual | $0.0092 | $0.552 | $0.0078 | $0.468 |
| Nova-1 & Nova-2 | $0.0058 | $0.348 | $0.0047 | $0.282 |
| Enhanced | $0.0165 | $0.990 | $0.0136 | $0.816 |
| Base | $0.0145 | $0.870 | $0.0105 | $0.630 |

### Add-ons

| Feature | Pay-As-You-Go / min | Growth / min |
|---|---|---|
| Speaker Diarization | +$0.0020 | +$0.0017 |

---

## Supported Languages

| Model | Count |
|---|---|
| Nova-3 | 50+ languages |
| Flux (Multi) | 10 languages |
| Nova-2 | 20+ languages |
| Enhanced | 15+ languages |

Nova-3 includes: Arabic, Bengali, Bulgarian, Chinese (Simplified/Traditional), Czech, Danish, Dutch, English (US/UK/AU/IN), Finnish, French, German, Greek, Hindi, Hungarian, Indonesian, Italian, Japanese, Korean, Malay, Norwegian, Polish, Portuguese, Romanian, Russian, Spanish, Swedish, Tamil, Turkish, Ukrainian, Vietnamese, and more.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | +$0.0020/min add-on |
| Word-Level Timestamps | ✅ | start/end/confidence per word |
| Segment-Level Timestamps | ✅ | Via utterances |
| Auto Language Detection | ✅ | `detect_language` param |
| Code-Mixing | ✅ | Nova-3 10-language code-switching |
| EU Data Residency | ✅ | `api.eu.deepgram.com` |
| Punctuation | ✅ | `punctuate` param |
| Smart Formatting | ✅ | `smart_format` param |
| Custom Vocabulary | ✅ | `keywords` param |
| Confidence Scores | ✅ | 0–1 per word |

---

## Limits

| Parameter | Value |
|---|---|
| Max file size | 2 GB |
| Max duration (Nova/Base/Enhanced) | **10 minutes per request** |
| Max duration (Whisper) | 20 minutes per request |
| Concurrent requests (PAYG) | 50 pre-recorded |
| Concurrent requests (Growth) | 100+ pre-recorded |

> ⚠️ **Nova-3 has a hard 10-minute limit per request.** For longer videos the audio must be chunked into ≤10-min segments and results merged.

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Token YOUR_API_KEY` |
| **Batch endpoint** | `POST https://api.deepgram.com/v1/listen` |
| **EU endpoint** | `POST https://api.eu.deepgram.com/v1/listen` |
| **Request type** | Synchronous (immediate response) |
| **Content-Type** | `application/json` (URL) or `audio/*` (file upload) |

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.wav)
       │  chunk if > 10 min
       ▼
POST /v1/listen?model=nova-3&diarize=true&punctuate=true
(audio binary or { "url": "https://..." })
       │
       ▼  immediate response
results.channels[0].alternatives[0]
  .words[]      — word, start_s, end_s, confidence, speaker
  .transcript   — full text
results.utterances[] — speaker, start_s, end_s, transcript
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       └── speaker segments ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key request (URL-based):**
```json
{ "url": "https://storage.example.com/audio.wav" }
```
Query params: `?model=nova-3&diarize=true&punctuate=true&language=en`

**Key response fields:**
```json
{
  "results": {
    "channels": [{ "alternatives": [{
      "transcript": "...",
      "words": [{ "word": "hello", "start": 0.1, "end": 0.4, "confidence": 0.99, "speaker": 0 }]
    }] }],
    "utterances": [{ "speaker": 0, "start": 0.1, "end": 5.2, "transcript": "..." }]
  }
}
```

> `start`/`end` are in **seconds**. Diarization adds `speaker` int to each word and populates `utterances[]`.

---

## Notes

- Fastest time-to-first-token among pre-recorded providers
- 10-minute limit per request is a real constraint — requires chunking for full-length videos
- Growth plan offers ~16% discount over PAYG and higher concurrency
- Nova-3 Multilingual costs ~20% more than Mono but covers broader language switching
