# Groq

> Whisper on LPU hardware — ultra-fast inference at the lowest price per hour of any provider.

---

## Models

| Model ID | Description |
|---|---|
| `whisper-large-v3-turbo` | Fast, multilingual, 99+ languages |
| `whisper-large-v3` | Highest accuracy Whisper variant |
| `distil-whisper-large-v3-en` | English-only, distilled, fastest |

**Used in this demo:** `whisper-large-v3-turbo`

---

## Pricing

> Source: [groq.com/pricing](https://groq.com/pricing) — verified July 2026

| Model | Per Minute | Per Hour |
|---|---|---|
| `whisper-large-v3` | $0.00185 | **$0.111** |
| `whisper-large-v3-turbo` | $0.00067 | **$0.04** |

> Minimum billing: **10 seconds** per request.  
> `whisper-large-v3-turbo` at $0.04/hr is the **cheapest option** across all providers in this demo.

---

## Supported Languages

| | Value |
|---|---|
| `whisper-large-v3` | 99+ languages |
| `whisper-large-v3-turbo` | 99+ languages |
| `distil-whisper-large-v3-en` | English only |

Language code hint (ISO-639-1) improves accuracy when specified.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ❌ | Not supported (Whisper limitation) |
| Word-Level Timestamps | ✅ | `timestamp_granularities: ["word"]` |
| Segment-Level Timestamps | ✅ | Default |
| Auto Language Detection | ✅ | Omit `language` param |
| Code-Mixing | ⚠️ | Inherits Whisper multilingual capability |
| Confidence / Quality Metadata | ✅ | `avg_logprob`, `no_speech_prob`, `compression_ratio` |
| Context Prompt | ✅ | Up to 224 tokens |

---

## Limits

| Parameter | Value |
|---|---|
| Max file size (free tier) | 25 MB |
| Max file size (dev tier) | **100 MB** |
| Min audio | 0.01 seconds |
| Min billed | 10 seconds |
| Rate limit | 2,000 requests/day |
| Audio rate limit | 7,200 seconds/hour (~2 hrs of audio/clock hour) |
| Max prompt | 224 tokens |

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Bearer YOUR_API_KEY` |
| **Transcription endpoint** | `POST https://api.groq.com/openai/v1/audio/transcriptions` |
| **Request type** | Synchronous (immediate response) |
| **Content-Type** | `multipart/form-data` |
| **Compatible with** | OpenAI Audio API (drop-in replacement) |

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.wav, < 100 MB)
       │  compress if needed
       ▼
POST /openai/v1/audio/transcriptions
(multipart: file + model + response_format + timestamp_granularities)
       │
       ▼  immediate response (very fast — LPU inference)
{ text, segments[], words[] }
  words[].word    — token text
  words[].start   — seconds
  words[].end     — seconds
  segments[].avg_logprob   — quality signal
  segments[].no_speech_prob
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       └── segment text     ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key request fields:**
```
model:                      whisper-large-v3-turbo
file:                       <audio binary>
language:                   en  (optional, improves accuracy)
response_format:            verbose_json
timestamp_granularities[]:  word
```

**Key response fields:**
```json
{
  "text": "full transcript",
  "segments": [{
    "id": 0, "start": 0.0, "end": 5.2, "text": "...",
    "avg_logprob": -0.25, "no_speech_prob": 0.01
  }],
  "words": [{ "word": "hello", "start": 0.1, "end": 0.4 }]
}
```

> `start`/`end` are in **seconds**. No speaker labels — Whisper does not support diarization.

---

## Notes

- Drop-in compatible with OpenAI's audio transcription API format
- No diarization — use for single-speaker content or when speaker attribution isn't needed
- `avg_logprob` and `no_speech_prob` are useful quality signals for filtering low-confidence segments
- Rate limit of 7,200 audio seconds/clock hour means ~2 hours of audio can be processed per hour
