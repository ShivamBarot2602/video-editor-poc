# OpenAI

> GPT-4o-based transcription with speaker diarization — top accuracy, OpenAI-native integration.

---

## Models

| Model ID | Description |
|---|---|
| `gpt-4o-transcribe-diarize` | Latest; speaker diarization included, same cost |
| `gpt-4o-transcribe` | Latest; no diarization |
| `gpt-4o-mini-transcribe` | Half price; no diarization |
| `gpt-4o-mini-transcribe-2025-12-15` | Versioned mini |
| `whisper-1` | Legacy; supports word-level timestamps via `timestamp_granularities` |

**Used in this demo:** `gpt-4o-transcribe-diarize`

---

## Pricing

> Source: [platform.openai.com/docs/pricing](https://platform.openai.com/docs/pricing) — verified May 2026

| Model | Per Minute | Per Hour |
|---|---|---|
| `gpt-4o-transcribe` | $0.006 | **$0.36** |
| `gpt-4o-transcribe-diarize` | $0.006 | **$0.36** |
| `gpt-4o-mini-transcribe` | $0.003 | **$0.18** |
| `whisper-1` | $0.006 | **$0.36** |

> Diarization does **not** cost extra — `gpt-4o-transcribe-diarize` is the same price as `gpt-4o-transcribe`.

---

## Supported Languages

| | Value |
|---|---|
| Reliable (< 50% WER) | 55 languages |
| Total (attempted) | 98 languages |

Reliable: Afrikaans, Arabic, Armenian, Azerbaijani, Belarusian, Bosnian, Bulgarian, Catalan, Chinese, Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Italian, Japanese, Kannada, Kazakh, Korean, Latvian, Lithuanian, Macedonian, Malay, Marathi, Maori, Nepali, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tagalog, Tamil, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Welsh.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | Use `gpt-4o-transcribe-diarize` model |
| Word-Level Timestamps | ✅ | `whisper-1` only via `timestamp_granularities` |
| Segment-Level Timestamps | ✅ | All models |
| Auto Language Detection | ✅ | All models |
| Code-Mixing | ⚠️ | Limited; not explicitly supported |
| Known Speaker Reference | ✅ | `gpt-4o-transcribe-diarize`: up to 4 named speakers |
| Multiple Output Formats | ✅ | json, text, srt, vtt, verbose_json (whisper-1) |
| Context Prompt | ✅ | `prompt` param for terminology hints |

> `gpt-4o-transcribe-diarize` does **not** support: `prompt`, `logprobs`, or `timestamp_granularities[]`.

---

## Limits

| Parameter | Value |
|---|---|
| Max file size | **25 MB** |
| Max duration | ~25 minutes (at 128 kbps) |
| Min duration for diarize | Audio > 30s requires `chunking_strategy` param |

> ⚠️ **25 MB cap** means most raw video audio requires compression or chunking before upload.

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Bearer YOUR_API_KEY` |
| **Endpoint** | `POST https://api.openai.com/v1/audio/transcriptions` |
| **Request type** | Synchronous (immediate response) |
| **Content-Type** | `multipart/form-data` |

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.mp3 @ 128 kbps, < 25 MB)
       │  compress / chunk if needed
       ▼
POST /v1/audio/transcriptions
(multipart: file + model + response_format)
       │
       ▼  immediate response
{ text, segments[] }
  segments[].speaker  — "SPEAKER_0", "SPEAKER_1", …
  segments[].start    — seconds
  segments[].end      — seconds
  segments[].text     — segment transcript
       │
       ├── segment timestamps ──► subtitle generation (.srt / .ass)
       └── speaker segments   ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key request fields:**
```
model:           gpt-4o-transcribe-diarize
file:            <audio binary>
language:        en  (optional)
response_format: json
```

**Key response fields:**
```json
{
  "text": "full transcript",
  "segments": [{
    "id": 0,
    "start": 0.0,
    "end": 5.2,
    "text": "...",
    "speaker": "SPEAKER_0"
  }]
}
```

> `start`/`end` are in **seconds**. `speaker` field populated only with `gpt-4o-transcribe-diarize`.

---

## Notes

- Only provider where diarization is included at the base price — no add-on cost
- `whisper-1` is the only model that exposes word-level timestamps; `gpt-4o` models return segment-level only
- 25 MB limit is the most restrictive in this demo — audio must be compressed to ~128 kbps MP3 for ~25-min clips
- For known speakers (e.g., podcast hosts), the diarize model accepts reference audio clips to identify speakers by name
