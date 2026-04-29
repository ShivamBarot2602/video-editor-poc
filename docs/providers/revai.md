# Rev AI

> Reverb ASR — 17-hour duration limit, 5 TB file support via URL, strong enterprise use case.

---

## Models

| Model ID | Description |
|---|---|
| `reverb-asr` (Reverb Transcription) | Primary English ASR model |
| Reverb Turbo | Faster, lower cost, English |
| Reverb Foreign Language | 57 languages |
| Whisper Fusion | English, alternative architecture |
| Whisper Large | English |
| Human Transcription | Human transcriber (not ML) |
| Forced Alignment | Align existing transcript to audio |

**Used in this demo:** `reverb-asr` (Reverb Transcription)

---

## Pricing

> Source: [rev.ai/pricing](https://www.rev.ai/pricing) — verified April 2026

| Model | Per Minute | Per Hour | Min Charge |
|---|---|---|---|
| Reverb Transcription (EN) | $0.003 | **$0.18** | 15 seconds |
| Reverb Turbo (EN) | ~$0.0017 | **$0.10** | 15 seconds |
| Reverb Foreign Language (57 langs) | $0.005 | **$0.30** | 15 seconds |
| Whisper Fusion / Large (EN) | $0.005 | **$0.30** | 15 seconds |
| Human Transcription | $1.99/min | — | 15 seconds |
| Forced Alignment | $0.003/min | **$0.18** | — |

> Billing is per-second with a **15-second minimum** per request.

---

## Supported Languages

| Model | Count |
|---|---|
| Reverb (English) | English |
| Reverb Foreign Language | 57 languages |

Includes: Spanish, French, German, Chinese, Portuguese, Japanese, Korean, Arabic, and more.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | Via `skip_diarization: false` (default) |
| Word-Level Timestamps | ✅ | Per-word `ts`/`end_ts` in response |
| Segment-Level Timestamps | ✅ | Per monologue |
| Auto Language Detection | ⚠️ | Not explicitly documented |
| Code-Mixing | ⚠️ | Not documented |
| HIPAA Compliance | ✅ | Available (not default) |
| Custom Vocabulary | ✅ | `custom_vocabularies` param |
| Confidence Scores | ✅ | Per-word |
| Punctuation | ✅ | Included |
| Profanity Filter | ✅ | Optional |

---

## Limits

| Parameter | Value |
|---|---|
| Max duration | **17 hours** |
| Max file size (multipart upload) | 2 GB |
| Max file size (source URL) | **5 TB** |
| Concurrent multipart files | 5 |
| Rate limit (transcription) | 10,000 requests / 10 min |
| Rate limit (active transcriptions) | 500 / 10 min (excess queued) |

> 17-hour duration and 5 TB URL limit are the most permissive in this demo.

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Bearer YOUR_ACCESS_TOKEN` |
| **Submit job** | `POST https://api.rev.ai/speechtotext/v1/jobs` |
| **Get job** | `GET https://api.rev.ai/speechtotext/v1/jobs/{id}` |
| **Get transcript** | `GET https://api.rev.ai/speechtotext/v1/jobs/{id}/transcript` |
| **Request type** | Async with polling |
| **Content-Type** | `multipart/form-data` or `application/json` (URL-based) |

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.wav)
       │
       ▼
POST /speechtotext/v1/jobs
(multipart audio  or  { "media_url": "https://..." })
       │
       ▼
{ id, status: "in_progress" }
       │
       ▼
GET /speechtotext/v1/jobs/{id}  ◄── poll every 5 s
       │ status == "transcribed"
       ▼
GET /speechtotext/v1/jobs/{id}/transcript
       │
       ▼
{ monologues: [{ speaker, elements[] }] }
  elements[]:  type "text" → word, ts_s, end_ts_s, confidence
               type "punct" → punctuation
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       └── speaker monologues ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key submit fields:**
```json
{
  "media_url": "https://...",
  "skip_diarization": false,
  "language": "en"
}
```

**Key transcript response:**
```json
{
  "monologues": [{
    "speaker": 1,
    "elements": [{
      "type": "text",
      "value": "hello",
      "ts": 0.1,
      "end_ts": 0.4,
      "confidence": 0.99
    }]
  }]
}
```

> `ts`/`end_ts` are in **seconds**. Filter `elements` to `type === "text"` for word-level data. `type: "punct"` items attach to adjacent words.

---

## Notes

- Most permissive duration and file size limits (17 hrs, 5 TB via URL) — no chunking needed for any normal video
- Billing is per-second with 15s minimum — efficient for short clips
- HIPAA compliance available but must be explicitly requested/configured
- Foreign language model is ~65% more expensive than English Reverb
