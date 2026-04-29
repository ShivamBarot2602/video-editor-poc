# Speechmatics

> Enhanced model — best-in-class claimed accuracy, 80+ languages, explicit code-mixing bilingual packs.

---

## Models

| Model ID | Description |
|---|---|
| `enhanced` | Highest accuracy; domain models for healthcare |
| `standard` | Faster, cost-effective alternative |

**Used in this demo:** `enhanced`

---

## Pricing

> Source: [speechmatics.com/pricing](https://www.speechmatics.com/pricing) — verified April 2026

| Tier | Per Hour | Notes |
|---|---|---|
| Free | $0 | 480 minutes/month included |
| Pro | From $0.24/hr | 480 min included; volume discounts above 500 hrs/month |
| Enterprise | Custom | No rate limits, unlimited scale |

**Volume discounts (Pro):**
- > 500 hours/month: 20% discount
- Capped at 6,000 hours/month before Enterprise required

> Standard and Enhanced models are the same price — accuracy is the only differentiator.

---

## Supported Languages

| | Value |
|---|---|
| Count | 80+ languages and language pairs |

Bilingual packs (2026): Arabic + English, Mandarin + English, Spanish + English, Tamil + English, Malay + English, Tagalog + English.  
Multilingual pack: Mandarin + Malay + Tamil + English.  
Healthcare models: English, French, German, Spanish, Dutch, Danish, Finnish, Norwegian, Arabic + English (Enhanced only).

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Speaker Diarization | ✅ | `diarization: "speaker"` in config |
| Speaker Identification | ✅ | Recognize enrolled voice profiles |
| Word-Level Timestamps | ✅ | Included in `json-v2` transcript format |
| Segment-Level Timestamps | ✅ | Included |
| Auto Language Detection | ✅ | Via `language_identification` (batch only) |
| Code-Mixing | ✅ | Bilingual packs; 35% fewer errors than competitors |
| Translation | ✅ | English → 34+ languages |
| Summarization | ✅ | |
| Sentiment Analysis | ✅ | |
| Auto Chapters | ✅ | |
| Audio Events | ✅ | |
| Custom Dictionary | ✅ | Accuracy improvement |
| Medical Models | ✅ | Enhanced operating point only |

---

## Limits

| Parameter | Value |
|---|---|
| Max duration | **2 hours** per job |
| Batch concurrent jobs (Pro) | 10 jobs/second |

---

## API Reference

| | Value |
|---|---|
| **Auth header** | `Authorization: Bearer YOUR_API_KEY` |
| **Submit batch job** | `POST https://asr.api.speechmatics.com/v2/jobs/` |
| **Get job status** | `GET https://asr.api.speechmatics.com/v2/jobs/{id}` |
| **Get transcript** | `GET https://asr.api.speechmatics.com/v2/jobs/{id}/transcript?format=json-v2` |
| **Request type** | Async with polling |
| **Content-Type** | `multipart/form-data` |

---

## Integration Pipeline

```
User uploads video
       │
       ▼
ffmpeg extract audio (→ audio.wav)
       │
       ▼
POST /v2/jobs/
(multipart: data_file + config JSON)
       │
       ▼
{ id: "job-uuid" }
       │
       ▼
GET /v2/jobs/{id}  ◄── poll every 5 s
       │ job.status == "done"
       ▼
GET /v2/jobs/{id}/transcript?format=json-v2
       │
       ▼
{ results[] }
  results[]:  type "word"  → content, start_time_s, end_time_s, confidence, speaker
              type "punct" → punctuation that attaches to adjacent word
       │
       ├── word timestamps  ──► subtitle generation (.srt / .ass)
       └── speaker segments ──► LLM prompt for clip extraction
                                          │
                                          ▼
                               ffmpeg clip cuts → Reels / Shorts
```

**Key config JSON (sent as form field `config`):**
```json
{
  "type": "transcription",
  "transcription_config": {
    "language": "en",
    "operating_point": "enhanced",
    "diarization": "speaker",
    "enable_entities": true
  }
}
```

**Key transcript response:**
```json
{
  "results": [{
    "type": "word",
    "start_time": 0.1,
    "end_time": 0.4,
    "alternatives": [{ "content": "hello", "confidence": 0.99, "language": "en" }],
    "speaker": "S1",
    "attaches_to": "next"
  }]
}
```

> `start_time`/`end_time` are in **seconds**. Filter `results` to `type === "word"` for word-level data.

---

## Notes

- Bilingual packs are a 2026 addition — best option for Tagalog-English and Tamil-English content
- Language identification enables auto-detection but is batch-only
- Fetch transcript as `json-v2` format for full word-level data with speaker attribution
- 2-hour job limit requires chunking for longer content
