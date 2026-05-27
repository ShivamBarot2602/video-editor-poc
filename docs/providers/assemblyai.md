# AssemblyAI

> Purpose-built speech AI platform with best-in-class diarization and the broadest language support.

---

## Models

| Model ID | Tier | Use Case |
|---|---|---|
| `universal-2` | Standard | 99+ languages, multilingual, best for diverse content |
| `universal-3-pro` | Premium | 6 core languages, highest accuracy for supported langs |

**Used in this demo:** `universal-2`

---

## Pricing

> Source: [assemblyai.com/pricing](https://www.assemblyai.com/pricing) — verified May 2026

### Pre-Recorded (Batch)

| Model | Per Minute | Per Hour |
|---|---|---|
| `universal-2` | $0.0025 | **$0.15** |
| `universal-3-pro` | $0.0035 | **$0.21** |

### Add-ons

| Feature | Per Hour |
|---|---|
| Speaker Diarization | +$0.02 |
| Medical Mode | +$0.15 |
| Prompting (Beta, U-3 Pro only) | +$0.05 |
| Keyterms Prompting (U-3 Pro) | +$0.05 |
| Keyterms Prompting (U-2) | Included |

---

## Supported Languages

| Model | Count |
|---|---|
| `universal-2` | 99+ languages |
| `universal-3-pro` | 6 core languages |

**Universal-3-Pro languages:** English (US/UK/AU), Spanish (Castilian/MX/AR/CO/CL/Caribbean/Spanglish), French (Metropolitan/Canadian/Belgian), Portuguese (Brazilian/European), German, Italian.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | +$0.02/hr add-on |
| Word-Level Timestamps | ✅ | Included, 0–1 confidence per word |
| Segment-Level Timestamps | ✅ | Included |
| Auto Language Detection | ✅ | Both models |
| Code-Mixing | ✅ | Multilingual code-switching |
| EU Data Residency | ✅ | `api.eu.assemblyai.com` |
| Medical Mode | ✅ | +$0.15/hr add-on |
| Punctuation & Formatting | ✅ | Included |
| Sentiment Analysis | ✅ | Add-on |
| Custom Vocabulary | ✅ | Keyterms (U-3 Pro) |

---

## Limits

| Parameter | Value |
|---|---|
| Min audio duration | 160 ms |
| Max file size | Not specified (large file support) |
| Max duration | ~10 hours (with URL) |

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `Authorization: YOUR_API_KEY` |
| **Submit job** | `POST https://api.assemblyai.com/v2/transcript` |
| **Poll status** | `GET https://api.assemblyai.com/v2/transcript/{id}` |
| **EU endpoint** | `https://api.eu.assemblyai.com/v2/transcript` |
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
POST /v2/transcript
{ audio_url, speech_model: "universal-2", speaker_labels: true }
       │
       ▼
{ id, status: "queued" }
       │
       ▼
GET /v2/transcript/{id}  ◄── poll every 3 s
       │ status == "completed"
       ▼
words[]      — text, start_ms, end_ms, confidence, speaker
utterances[] — speaker, start_ms, end_ms, text
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
  "audio_url": "https://...",
  "speech_model": "universal-2",
  "speaker_labels": true,
  "language_detection": true
}
```

**Key response fields:**
```json
{
  "status": "completed",
  "text": "full transcript",
  "words": [{ "text": "hello", "start": 100, "end": 400, "confidence": 0.98, "speaker": "A" }],
  "utterances": [{ "speaker": "A", "start": 100, "end": 5000, "text": "..." }]
}
```

> `start`/`end` are in **milliseconds**. Enable `speaker_labels: true` for diarization (+$0.02/hr).

---

## Notes

- Best-in-class diarization accuracy; recommended for multi-speaker content
- `universal-2` covers 99 languages — best pick for multilingual/Indic content
- `universal-3-pro` restricted to 6 languages but offers highest accuracy in those
- US and EU endpoints available for data residency compliance
