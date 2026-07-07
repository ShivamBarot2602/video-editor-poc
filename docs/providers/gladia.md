# Gladia

> Universal speech-to-text with Solaria-1 — strong diarization accuracy and explicit code-switching support.

---

## Models

| Model ID | Description |
|---|---|
| `solaria-1` | Universal model; 100+ languages, code-switching, diarization |
| `solaria-3` | Newer flagship; best for English / European languages |

**Used in this demo:** `solaria-1` (not deprecated; still $0.61/hr)

---

## Pricing

> Source: [gladia.io/pricing](https://www.gladia.io/pricing) — verified July 2026

| Tier | Per Hour | Notes |
|---|---|---|
| Starter | $0.61 | 10 free hours/month |
| Growth | ~$0.20 | Volume commitment required |
| Enterprise | Custom | Unlimited concurrency |

> `solaria-1` is unchanged at $0.61/hr (Growth plan reaches ~$0.20/hr on volume). A newer **Solaria-3** flagship is also available (best for English / European languages); `solaria-1` is not deprecated.

Diarization, word timestamps, and all enrichment features are **included** — no add-on pricing.

**Free tier:** 10 hours free per month on Starter plan.

---

## Supported Languages

| | Value |
|---|---|
| Total languages | 100+ |
| Unique to Gladia | 42 |

Includes high-population markets: Bengali, Punjabi, Tamil, Urdu, Persian, Marathi, Hebrew, Pashto, Kazakh, Georgian, Mongolian, Haitian Creole, Maori, Javanese, Malagasy.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | Configurable min/max speakers |
| Word-Level Timestamps | ✅ | `word_timestamps: true` (default: false) |
| Segment-Level Timestamps | ✅ | Per utterance |
| Auto Language Detection | ✅ | Default when `language_config` omitted |
| Code-Mixing | ✅ | `code_switching: true` per-utterance language detection |
| Translation | ✅ Beta | Multi-language |
| Summarization | ✅ Beta | |
| Sentiment Analysis | ✅ | |
| PII Redaction | ✅ | |
| Named Entity Recognition | ✅ Alpha | |
| Custom Vocabulary | ✅ Beta | |
| GDPR / HIPAA / SOC2 | ✅ | All paid tiers |
| Zero Data Retention | ✅ | Enterprise only |

---

## Limits

| Parameter | Value |
|---|---|
| Max file size | 1,000 MB |
| Max duration (pre-recorded) | 135 minutes (2h 15m) |
| Max duration (Enterprise) | 255 minutes (4h 15m) |
| Max duration (YouTube links) | 120 minutes |
| Starter concurrency | 25 requests |

**Supported audio formats:** MP3, WAV, FLAC, AAC, OGG, Opus, M4A, AC3, EAC3, MP2  
**Supported video formats:** MP4, MOV, AVI, FLV, WMV, M4V, MKV, 3GP, 3G2  
**Online video:** YouTube, TikTok, Instagram, Facebook, Vimeo, Dailymotion, LinkedIn

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `x-gladia-key: YOUR_API_KEY` |
| **Upload endpoint** | `POST https://api.gladia.io/v2/upload` |
| **Transcription endpoint** | `POST https://api.gladia.io/v2/pre-recorded` |
| **Poll result** | `GET <result_url>` (returned in submit response) |
| **Request type** | Async with polling |
| **Content-Type (upload)** | `multipart/form-data` |
| **Content-Type (submit)** | `application/json` |

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.wav)
       │
       ▼
POST /v2/upload  (multipart audio file)
       │
       ▼
{ audio_url: "https://cdn.gladia.io/..." }
       │
       ▼
POST /v2/pre-recorded
{ audio_url, diarization: true, word_timestamps: true,
  language_config: { code_switching: true } }
       │
       ▼
{ id: "job-uuid", result_url: "https://..." }
       │
       ▼
GET <result_url>  ◄── poll every 3 s
       │ status == "done"
       ▼
result.transcription.utterances[]
  — speaker, start_s, end_s, text, words[]
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       └── speaker segments ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key submit fields:**
```json
{
  "audio_url": "https://...",
  "diarization": true,
  "sentences": true,
  "word_timestamps": true,
  "language_config": { "languages": ["en"], "code_switching": true }
}
```

**Key response (done):**
```json
{
  "status": "done",
  "result": {
    "transcription": {
      "full_transcript": "...",
      "utterances": [{
        "speaker": 0, "start": 0.1, "end": 5.2, "text": "...",
        "words": [{ "word": "hello", "start": 0.1, "end": 0.4 }]
      }]
    }
  }
}
```

> `start`/`end` are in **seconds**. Omit `language_config` entirely for auto-detection (don't send empty `languages: []`).

---

## Notes

- Diarization error rate claimed 3× lower than competitors per internal benchmarks
- `sentences: true` produces better text segmentation for subtitle generation
- Growth plan requires volume commitment but drops cost ~67% vs Starter ($0.61 → ~$0.20/hr)
- Upload step is separate — file is stored on Gladia's CDN before the transcription job begins
- A newer **Solaria-3** flagship is available (best for English / European languages); `solaria-1` remains at $0.61/hr and is not deprecated
