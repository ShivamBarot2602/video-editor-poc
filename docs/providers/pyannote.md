# pyannoteAI

> Precision diarization-first platform — speaker identification, voiceprints, and STT orchestration.

---

## Models

| Model ID | Description |
|---|---|
| `precision-2` | Premium diarization; state-of-the-art accuracy |
| `community-1` | Open-source diarization (pyannote.audio 4.0) |

**Used in this demo:** `precision-2`

> pyannoteAI is primarily a **speaker diarization** platform. STT is handled via orchestration (combining diarization output with a third-party ASR engine). The demo uses their STT orchestration service which bundles both.

---

## Pricing

> Source: [pyannote.ai/pricing](https://www.pyannote.ai/pricing) — verified July 2026

### Per-Hour Rates

| Service | Per Hour |
|---|---|
| Diarization — Precision-2 | **€0.112/hr** (~$0.122) — cut from €0.168 |
| Diarization — Community-1 | €0.035/hr (~$0.038) |
| STT Orchestration (Bring Your Own ASR) | €0.146/hr (~$0.159) |
| Speaker Identification | €0.096/hr (~$0.105) |
| Voice Prints | €0.015 per voiceprint |

> Prices in EUR. Conversion: ~1.09 USD/EUR (July 2026). The Precision-2 rate was cut to **€0.112/hr** (was €0.168).

### Monthly Plans

| Plan | Monthly Cost | Included | Rate Limit |
|---|---|---|---|
| Developer | €19/month | 165 hrs diarization (Precision-2), 1 seat | 100 req/min, 1 concurrent job |
| Starter ⭐ | €99/month | 3 seats | 100 req/min, 1 concurrent job |
| Enterprise | Custom | On-prem, higher concurrency | Custom |

**Free hours:** Now tied to plan tiers (Developer/Starter) rather than a flat trial grant — included diarization hours come with the monthly plan.

---

## Supported Languages

Multilingual support without additional configuration. Specific language count and list not published.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | Primary service |
| Speaker Identification | ✅ | Separate €0.096/hr service |
| Voice Prints | ✅ | €0.015/voiceprint; recognize specific speakers |
| Word-Level Timestamps | ✅ | Via STT orchestration |
| Segment-Level Timestamps | ✅ | Included in diarization output |
| Auto Language Detection | ✅ | Multilingual, no config needed |
| Code-Mixing | ⚠️ | Not explicitly documented |
| Webhook / Callbacks | ✅ | Async job notifications |

---

## Limits

| Parameter | Value |
|---|---|
| Rate limit (Developer/Starter) | 100 requests/min, 1 concurrent batch job |
| Rate limit (Enterprise) | Custom (higher concurrency) |
| Max file size | Not explicitly documented |

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `api-subscription-key: YOUR_API_KEY` |
| **Diarize endpoint** | `POST https://api.pyannote.ai/v1/diarize` |
| **Identify endpoint** | `POST https://api.pyannote.ai/v1/identify` |
| **Voiceprint endpoint** | `POST https://api.pyannote.ai/v1/voiceprint` |
| **Job status** | `GET https://api.pyannote.ai/v1/get-job?jobId={id}` |
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
POST /v1/diarize
{ "url": "https://storage.example.com/audio.wav" }
       │
       ▼
{ jobId: "uuid", status: "processing" }
       │
       ▼
GET /v1/get-job?jobId={id}  ◄── poll every 5 s
       │ status == "succeeded"
       ▼
output.diarization[]  — speaker, start_s, end_s
output.transcript[]   — speaker, start_s, end_s, text
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       └── speaker segments ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key request fields:**
```json
{
  "url": "https://storage.example.com/audio.wav"
}
```

**Key response (succeeded):**
```json
{
  "status": "succeeded",
  "output": {
    "diarization": [{ "speaker": "SPEAKER_0", "start": 0.1, "end": 5.2 }],
    "transcript": [{ "speaker": "SPEAKER_0", "start": 0.1, "end": 5.2, "text": "hello world" }]
  }
}
```

> `start`/`end` are in **seconds**. STT orchestration produces the `transcript[]` array combining speaker turns with transcribed text.

---

## Notes

- Diarization-first approach: speaker separation is optimised before transcription
- Voice prints allow recognizing specific known speakers across multiple recordings
- STT orchestration bundles diarization + ASR into a single job
- Precision-2 rate was cut to **€0.112/hr** (was €0.168); free hours are now tied to plan tiers (Developer/Starter) rather than a flat 150-hour trial grant
