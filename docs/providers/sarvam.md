# Sarvam AI (Saaras)

> Purpose-built for Indian languages — 22 Indic languages, code-mixing, diarization via Batch API.

---

## Models

| Model ID | Description |
|---|---|
| `saaras:v3` | Current recommended; flexible output modes |
| `saarika:v2.5` | Legacy; deprecated, migrate to Saaras v3 |

**Used in this demo:** `saaras:v3`

---

## Pricing

> Source: [sarvam.ai/api-pricing](https://www.sarvam.ai/api-pricing) — verified April 2026

| Service | Per Hour (INR) | Per Hour (USD ~₹84/$) |
|---|---|---|
| STT only | ₹30 | **~$0.36** |
| STT + Diarization | ₹45 | **~$0.54** |
| STT + Translation | ₹30 | **~$0.36** |
| STT + Diarization + Translation | ₹45 | **~$0.54** |

### Subscription Plans (Rate Limits)

| Plan | Monthly (INR) | Rate Limit |
|---|---|---|
| Starter (PAYG) | Pay-as-you-go | 60 req/min |
| Pro | ₹10,000 | 200 req/min |
| Business | ₹50,000 | 1,000 req/min |

> All plans include ₹1,000 (~$12) in free credits.

---

## Supported Languages

| | Value |
|---|---|
| Count | 22 Indian languages (+ English) |

Includes: Hindi, Bengali, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, Gujarati, English (Indian variants), and 11 more Indic languages.

> ⚠️ Only suitable for Indian language content — not a general-purpose multilingual provider.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | Batch API only; up to 8 speakers; +₹15/hr |
| Word-Level Timestamps | ✅ | `with_timestamps: true` (Batch API) |
| Segment-Level Timestamps | ✅ | Via diarized_transcript |
| Auto Language Detection | ✅ | Default when `language_code` omitted |
| Code-Mixing | ✅ | `mode: "codemix"` output; Indic pairs optimized |
| Transliteration | ✅ | `mode: "translit"` (Latin script output) |
| Translation to English | ✅ | `mode: "translate"` |
| Verbatim Mode | ✅ | `mode: "verbatim"` (includes filler words) |
| Webhook Callbacks | ✅ | Job completion notifications |

---

## Limits

| Parameter | Value |
|---|---|
| REST API max duration | **30 seconds** (not used in demo) |
| Batch API max duration | **1 hour** per file |
| Batch max files per job | 20 files |

> ⚠️ REST API is limited to 30 seconds — this demo uses the **Batch API** for all transcription.

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `api-subscription-key: YOUR_API_KEY` |
| **Batch create job** | `POST https://api.sarvam.ai/speech-to-text/job/v1` |
| **Batch upload URLs** | `POST https://api.sarvam.ai/speech-to-text/job/v1/upload-files` |
| **Batch start** | `POST https://api.sarvam.ai/speech-to-text/job/v1/{id}/start` |
| **Batch status** | `GET https://api.sarvam.ai/speech-to-text/job/v1/{id}/status` |
| **Batch download URLs** | `POST https://api.sarvam.ai/speech-to-text/job/v1/download-files` |
| **Request type** | Async with polling |
| **Content-Type** | `application/json` |

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.wav)
       │
       ▼
POST /speech-to-text/job/v1
{ job_parameters: { model, mode, with_diarization, with_timestamps } }
       │
       ▼
{ job_id: "uuid" }
       │
       ▼
POST /job/v1/upload-files  { job_id, files: ["audio.wav"] }
       │
       ▼
{ upload_urls: { "audio.wav": { file_url: "https://blob.azure..." } } }
       │
       ▼
PUT <Azure Blob URL>  (raw audio bytes, x-ms-blob-type: BlockBlob)
       │
       ▼
POST /job/v1/{id}/start
       │
       ▼
GET /job/v1/{id}/status  ◄── poll every 5 s
       │ job_state == "completed"
       ▼
POST /job/v1/download-files  { job_id, files: ["output.json"] }
       │
       ▼
GET <Azure Blob URL>  (download result JSON)
       │
       ▼
diarized_transcript[] — speaker_id, transcript, start_time_s, end_time_s
timestamps{}          — words[], start_time_seconds[], end_time_seconds[]  (parallel arrays)
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       └── speaker segments ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key job creation body:**
```json
{
  "job_parameters": {
    "model": "saaras:v3",
    "mode": "transcribe",
    "with_diarization": true,
    "with_timestamps": true,
    "language_code": "hi-IN"
  }
}
```

**Key result JSON:**
```json
{
  "transcript": "full text",
  "language_code": "hi-IN",
  "timestamps": {
    "words": ["namaste", "duniya"],
    "start_time_seconds": [0.1, 0.6],
    "end_time_seconds": [0.5, 1.0]
  },
  "diarized_transcript": [{
    "speaker_id": "SPEAKER_0",
    "transcript": "namaste duniya",
    "start_time_seconds": 0.1,
    "end_time_seconds": 1.0
  }]
}
```

> `timestamps` uses **parallel arrays** (not objects). Words are matched to diarized segments by time overlap.

---

## Notes

- 7-step Batch API flow is the most complex integration in this demo
- Audio is uploaded directly to Azure Blob Storage via presigned URL — not Sarvam's servers
- `mode: "codemix"` is Sarvam's strength — handles Hinglish, Tanglish, Kannglish, etc.
- Diarization is Batch-API only — REST API (30s) does not support it
- Pricing in INR — exchange rate fluctuations affect USD equivalent
