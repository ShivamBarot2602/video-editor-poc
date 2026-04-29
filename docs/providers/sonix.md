# Sonix

> Consumer-grade STT with up to 30 speakers — best suited for small-volume content review workflows.

---

## Models

| Model ID | Description |
|---|---|
| `Sonix AI` | Unified model; no discrete model IDs exposed in API |

**Used in this demo:** `Sonix AI` (internal label — no model ID in API)

---

## Pricing

> Source: [sonix.ai/pricing](https://sonix.ai/pricing) — verified April 2026

| Tier | Per Minute | Per Hour | Monthly Cost |
|---|---|---|---|
| Standard (PAYG) | $0.167 | **$10.00** | None |
| Premium | $0.083 | **$5.00** | $22/seat/month (or $16.50 annually) |
| Enterprise | Custom | Custom | Contact sales |

> **Standard is the most expensive option in this demo by far** — $10/hr vs $0.15–$0.61/hr for others.  
> Premium halves the per-hour rate but requires a monthly seat subscription.

**Additional services:** Translation and subtitles billed at the same rate as transcription.  
**AI Analysis:** $5/month (Premium) or custom (Enterprise).

> ⚠️ **API access requires Premium or Enterprise tier** — Standard accounts can only use the web UI.

---

## Supported Languages

| | Value |
|---|---|
| Count | 50+ languages |

Includes: English, French, German, Spanish, Arabic, Chinese (Mandarin/Cantonese), Japanese, Korean, and more.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | Up to 30 speaker labels |
| Word-Level Timestamps | ✅ | Included in JSON transcript |
| Segment-Level Timestamps | ✅ | Included |
| Auto Language Detection | ✅ | Single-language detection |
| Code-Mixing | ❌ | Between-speaker only (not mid-sentence) |
| Confidence Scores | ✅ | Per-word |
| Subtitle Export | ✅ | SRT, VTT |
| Document Export | ✅ | Word, PDF, plain text |
| Video Burn-in | ✅ | Via API |
| Translation | ✅ | Available |
| Summarization | ✅ | Via AI Analysis add-on |

---

## Limits

| Parameter | Value |
|---|---|
| Max direct upload | **100 MB** |
| Larger files | Use `file_url` param (URL to remote file) |
| Max speakers | 30 |
| Processing time | < 15 min for a 15-min file |

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Bearer YOUR_API_KEY` |
| **API key URL** | `https://my.sonix.ai/api` (Premium accounts only) |
| **Submit media** | `POST https://api.sonix.ai/v1/media` |
| **Get status** | `GET https://api.sonix.ai/v1/media/{id}` |
| **Get transcript** | `GET https://api.sonix.ai/v1/media/{id}/transcript.json` |
| **Get SRT** | `GET https://api.sonix.ai/v1/media/{id}/transcript.srt` |
| **Request type** | Async with polling |
| **Content-Type** | `multipart/form-data` |

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.wav, < 100 MB)
       │  use file_url for larger files
       ▼
POST /v1/media
(multipart: file + language + name  or  file_url)
       │
       ▼
{ id, status: "preparing" }
       │
       ▼
GET /v1/media/{id}  ◄── poll every 5 s
       │ status == "completed"
       ▼
GET /v1/media/{id}/transcript.json
       │
       ▼
{ words[] }
  words[]:  text, start_time_s, end_time_s, speaker, confidence
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       └── speaker segments ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key submit fields:**
```
file:     <audio binary>  (or file_url: "https://...")
language: en
name:     my-recording
```

**Key transcript response:**
```json
{
  "words": [{
    "text": "hello",
    "start_time": 0.1,
    "end_time": 0.4,
    "confidence": 0.98,
    "speaker": "Speaker 1"
  }]
}
```

> `start_time`/`end_time` are in **seconds**. Speaker labels are human-readable strings (`"Speaker 1"`).

---

## Notes

- $10/hr is ~17–66× more expensive than other providers in this demo
- 30 speaker labels is unique — most providers cap at 8–32
- Code-mixing limited to speaker-boundary switching only (not mid-sentence)
- API requires Premium subscription; Standard users have web UI access only
- Best suited for workflows that integrate with Sonix's own web editor/review UI
