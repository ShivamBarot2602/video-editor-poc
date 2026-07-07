# Mistral (Voxtral)

> Voxtral Mini — competitive accuracy, native diarization, 3-hour audio cap, OpenAI-compatible API.

---

## Models

| Model ID | Description |
|---|---|
| `voxtral-mini-latest` | Dynamic alias — resolves to the newest Voxtral Mini transcription model (recommended) |
| `voxtral-mini-2602` | Pinned: Voxtral Transcribe 2 (current target of `-latest`) |
| `voxtral-mini-2507` | Pinned: previous Voxtral Mini (deprecates 2026-02-27) |
| `voxtral-small-24b-2507` | Higher accuracy, larger model |

**Used in this demo:** `voxtral-mini-latest`

> Note: `voxtral-mini-latest` is a **dynamic alias** the transcription endpoint resolves to the newest Voxtral Mini transcribe model. As of the Feb 2026 upgrade it now resolves to **Voxtral Transcribe 2** (`voxtral-mini-2602`), which silently superseded `voxtral-mini-2507` (deprecating 2026-02-27) behind the alias. Transcribe 2 extends the audio cap to 3 hr and adds native word-level timestamps + diarization. Price is unchanged at $0.18/hr. Pin `voxtral-mini-2602` for reproducible behaviour.

---

## Pricing

> Source: [mistral.ai/news/voxtral-transcribe-2](https://mistral.ai/news/voxtral-transcribe-2) — verified July 2026

| Model | Per Minute | Per Hour |
|---|---|---|
| Voxtral Mini (`voxtral-mini-latest` → Voxtral Transcribe 2) | $0.003 | **$0.18** |
| Voxtral Small 24B 2507 | $0.004 + token cost | ~$0.24+ |

> Token cost for Voxtral Small: +$0.10/M input tokens, +$0.30/M output tokens (in addition to per-minute rate).

---

## Supported Languages

| | Value |
|---|---|
| Count | **13 languages** |

Languages: English, Chinese, Hindi, Spanish, Arabic, French, Portuguese, Russian, German, Japanese, Korean, Italian, Dutch.

> ⚠️ Most restricted language set among providers in this demo — no Indic languages other than Hindi.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | Included, no extra cost |
| Word-Level Timestamps | ✅ | Included |
| Segment-Level Timestamps | ✅ | Included |
| Auto Language Detection | ✅ | Omit `language` param |
| Code-Mixing | ⚠️ | Not explicitly specified |
| Context Biasing | ✅ | Up to 100 terms (English optimized; experimental for others) |
| GDPR / HIPAA | ✅ | Compliance options available |

> Diarization limitation: overlapping speech typically transcribes only one speaker.

---

## Limits

| Parameter | Value |
|---|---|
| Max file size | 1 GB |
| Max duration | **3 hours** per request |
| Supported formats | .mp3, .wav, .m4a, .flac, .ogg |

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Bearer YOUR_API_KEY` |
| **Endpoint** | `POST https://api.mistral.ai/v1/audio/transcriptions` |
| **Request type** | Synchronous |
| **Content-Type** | `multipart/form-data` |
| **Compatible with** | OpenAI Audio API (drop-in with base URL swap) |

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.wav, < 1 GB)
       │
       ▼
POST /v1/audio/transcriptions
(multipart: file + model + diarization + language)
       │
       ▼  immediate response
{ text, segments[], words[] }
  segments[].speaker  — "SPEAKER_0", "SPEAKER_1", …
  segments[].start    — seconds
  segments[].end      — seconds
  segments[].text     — segment text
  words[].word        — token text
  words[].start / end — seconds
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       └── speaker segments ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key request fields:**
```
model:        voxtral-mini-latest
file:         <audio binary>
language:     en  (optional)
diarization:  true
```

**Key response fields:**
```json
{
  "text": "full transcript",
  "segments": [{
    "start": 0.0, "end": 5.2,
    "text": "...", "speaker": "SPEAKER_0"
  }],
  "words": [{ "word": "hello", "start": 0.1, "end": 0.4 }]
}
```

> `start`/`end` are in **seconds**. Diarization adds `speaker` field to each segment.

---

## Notes

- One of the few providers with a 3-hour cap — handles most long-form podcasts/interviews in a single call
- 1 GB file limit is generous; most audio files fit without pre-processing
- OpenAI-compatible API allows easy switching between OpenAI and Mistral with just a base URL change
- Context biasing useful for domain-specific vocabulary (company names, product names)
- The `voxtral-mini-latest` alias silently upgraded to **Voxtral Transcribe 2** (Feb 2026); price is unchanged at $0.18/hr across 13 languages
