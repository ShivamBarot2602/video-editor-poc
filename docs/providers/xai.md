# xAI Grok STT

> Synchronous speech-to-text API launched by xAI in April 2026.  
> Single REST call — no polling required. Competitive pricing with diarization included at no extra charge.

---

## Models

| Model ID | Description |
|---|---|
| `grok-stt` | General-purpose multilingual STT with diarization and word timestamps |

**Used in this demo:** `grok-stt`

---

## Pricing

> Source: [docs.x.ai/developers/models](https://docs.x.ai/developers/models) — verified May 2026

| Mode | Per Minute | Per Hour |
|---|---|---|
| REST (batch, file/URL) | ~$0.00167 | **$0.10** |
| WebSocket (streaming, realtime) | ~$0.00333 | **$0.20** |

> This demo uses the **REST** endpoint only.  
> Diarization is **included** — no add-on charge.  
> No free tier documented at time of writing; check [x.ai/api](https://x.ai/api) for current credits.

---

## Supported Languages

25 languages supported. Auto-detected when `language` parameter is omitted; accepts BCP-47 language codes when specified.

Full enumerated list not published in official docs — check [docs.x.ai](https://docs.x.ai) for the current registry.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | `diarize: true` — included, no extra cost |
| Word-Level Timestamps | ✅ | `start`/`end` per word in response |
| Segment-Level Timestamps | ✅ | Derived from word groups |
| Auto Language Detection | ✅ | Omit `language` param |
| Manual Language Hint | ✅ | BCP-47 code |
| Multichannel Audio | ✅ | Useful for call-centre / meeting recordings |
| Keyterm Prompting | ✅ | Domain-specific vocabulary biasing |
| Confidence Scores | ❌ | Not returned |
| PII Redaction | ❌ | Not documented |
| Custom Vocab / Glossary | ⚠️ | Keyterm prompting only |

---

## Limits

| Parameter | Value |
|---|---|
| Max file size | **500 MB** |
| Supported formats | WAV, MP3, MP4, M4A, WebM, OGG |
| Max duration | Not explicitly documented |
| Rate limit (REST) | 600 requests/min |
| Rate limit (REST) | 10 requests/sec |
| Region | `us-east-1` |

> **Field order:** The `file` field must be the **last** field in the multipart form (per xAI docs).

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Bearer YOUR_XAI_API_KEY` |
| **Transcription endpoint** | `POST https://api.x.ai/v1/stt` |
| **Request type** | Synchronous (immediate response — no polling) |
| **Content-Type** | `multipart/form-data` |

**Key request fields:**
```
diarize:   true
language:  en  (optional BCP-47 code; omit for auto-detect)
file:      <audio binary>   ← MUST be last field
```

**Key response fields:**
```json
{
  "text": "full transcript",
  "language": "en",
  "duration": 92.4,
  "words": [
    { "text": "Hello", "start": 0.1, "end": 0.45, "speaker": "SPEAKER_00" }
  ]
}
```

> Note: word-level field is `text` (not `word`). The integration maps `w.text → w.word` internally.

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.wav, ≤ 500 MB)
       │
       ▼
POST https://api.x.ai/v1/stt
(multipart: diarize + [language] + file  ← file MUST be last)
       │
       ▼  immediate response (synchronous)
{ text, language, duration, words[] }
  words[].text     — word string  (mapped to .word internally)
  words[].start    — seconds
  words[].end      — seconds
  words[].speaker  — "SPEAKER_00", "SPEAKER_01", …
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       ├── speaker labels   ──► speaker-aware subtitle styling
       └── full text        ──► LLM prompt for clip extraction
```

---

## Notes

- Diarization included at no extra cost — unlike AssemblyAI (+$0.02/hr) and Deepgram (+$0.12/hr)
- At $0.10/hr it is the **cheapest diarization-capable** provider in this demo (Groq is cheaper at $0.04/hr but has no diarization) — undercuts Mistral ($0.18/hr) and Rev AI ($0.20/hr)
- No polling required; single synchronous call simplifies integration compared to AssemblyAI, Gladia, Rev AI
- 500 MB file limit accommodates most long-form video audio without chunking
- Language support capped at ~25 languages — narrower than AssemblyAI Universal-2 (99) or Gladia (100+)
- Confidence scores not returned; no quality signal for filtering low-accuracy segments
- Launched April 2026 — relatively new, less battle-tested than AssemblyAI or Deepgram
