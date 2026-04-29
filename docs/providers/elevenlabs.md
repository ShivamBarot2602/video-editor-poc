# ElevenLabs (Scribe)

> Scribe v2 — synchronous single-call STT with per-word confidence (logprob), diarization, and 32-speaker support.

---

## Models

| Model ID | Description |
|---|---|
| `scribe_v2` | Latest; word timestamps, 32 speakers, logprob confidence |
| `scribe_v1` | Previous version |

**Used in this demo:** `scribe_v2`

---

## Pricing

> Source: [elevenlabs.io/pricing](https://elevenlabs.io/pricing) — verified April 2026

ElevenLabs does not publish per-minute/per-hour STT rates on their public pricing page. Speech-to-Text is billed on usage and bundled into subscription tiers (Free and above). Estimated cost based on community benchmarks: **~$0.40/hr** for base transcription.

### Surcharges (when enabled)
| Add-on | Extra Cost |
|---|---|
| Entity detection (PII/PHI/PCI/offensive) | +30% |
| Speaker role detection (agent vs. customer) | +10% |
| Keyterms biasing (>100 keyterms) | +20% |

> Minimum billable duration: 20 seconds when using more than 100 keyterms.

---

## Supported Languages

Languages specified via ISO-639-1 or ISO-639-3 code. Auto-detection available when `language_code` is omitted. Scribe v2 supports 32+ languages.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | `diarize: true`; up to 32 speakers |
| Word-Level Timestamps | ✅ | `timestamps_granularity: "word"` (default) |
| Character-Level Timestamps | ✅ | `timestamps_granularity: "character"` |
| Per-Word Confidence | ✅ | `logprob` field (−∞ to 0, convert via `Math.exp()`) |
| Auto Language Detection | ✅ | Omit `language_code` param |
| Code-Mixing | ⚠️ | Not explicitly documented |
| Entity Detection | ✅ | PII, PHI, PCI, offensive language (+30%) |
| Keyterms Biasing | ✅ | Up to 1,000 terms (< 50 chars each) |
| Multi-Channel Audio | ✅ | Up to 5 channels |
| Data Residency | ✅ | US, EU, India endpoints |
| Zero Retention | ✅ | Enterprise only |

---

## Limits

| Parameter | Value |
|---|---|
| Max file size | **3 GB** (direct upload) or 2 GB (cloud URL) |
| Max channels | 5 |
| Min duration | 100 ms |
| Max speakers (diarization) | 32 |
| Max keyterms | 1,000 |

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `xi-api-key: YOUR_API_KEY` |
| **Endpoint** | `POST https://api.elevenlabs.io/v1/speech-to-text` |
| **US endpoint** | `https://api.us.elevenlabs.io/v1/speech-to-text` |
| **EU endpoint** | `https://api.eu.residency.elevenlabs.io/v1/speech-to-text` |
| **IN endpoint** | `https://api.in.residency.elevenlabs.io/v1/speech-to-text` |
| **Request type** | Synchronous |
| **Content-Type** | `multipart/form-data` |

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.wav, < 3 GB)
       │
       ▼
POST /v1/speech-to-text
(multipart: file + model_id + diarize + timestamps_granularity)
       │
       ▼  immediate response
{ text, language_code, audio_duration_secs, words[] }
       │
       ▼
Filter words[]  →  keep type == "word"
                   skip type == "spacing", "audio_event"
       │
       ▼
words[]:  text, start_s, end_s, speaker_id, logprob
  │  group consecutive same-speaker words → segments
  ▼
segments[]: speaker, start_s, end_s, text, words[]
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       └── speaker segments ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key request fields:**
```
model_id:               scribe_v2
file:                   <audio binary>
diarize:                true
timestamps_granularity: word
language_code:          en  (optional)
```

**Key response fields:**
```json
{
  "text": "full transcript",
  "language_code": "en",
  "audio_duration_secs": 123.4,
  "words": [{
    "type": "word",
    "text": "hello",
    "start": 0.1,
    "end": 0.4,
    "speaker_id": "speaker_0",
    "logprob": -0.05
  }, {
    "type": "spacing",
    "text": " "
  }]
}
```

> **Critical:** Filter `words` to `type === "word"` only. `start`/`end` are in **seconds**. Confidence = `Math.exp(logprob)` → 0–1 range.

---

## Notes

- Only provider returning per-word log-probability confidence scores
- Response is fully synchronous — no polling required, simplest integration
- `words[]` mixes `type: "word"`, `"spacing"`, and `"audio_event"` — must filter to `"word"` only
- 3 GB file limit is the most permissive in this demo
- Speaker IDs are string labels (e.g., `"speaker_0"`) not integers
