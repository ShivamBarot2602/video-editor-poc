# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted.

```bash
# Install dependencies for both workspaces
yarn install:all

# Start both server (port 3001) and client (port 5173) concurrently
yarn dev

# Start individually
yarn --cwd app/server dev   # node --watch index.js
yarn --cwd app/client dev   # vite

# Build client for production
yarn --cwd app/client build
```

There are no test scripts. No linting config exists.

## Architecture

Monorepo with two workspaces managed via root `package.json`:

- `app/server/` — Express.js API (Node, CommonJS)
- `app/client/` — React 18 SPA (Vite, ES modules)

### Server

`index.js` is the entry point. It mounts four route modules and handles several inline endpoints:

| Route | Purpose |
|---|---|
| `POST /api/upload` | Multer upload → creates `videos/<uuid>/original.<ext>` + `meta.json` |
| `POST /api/prepare/:id` | Idempotent audio extraction → `audio.wav` (call once before parallel transcription) |
| `POST /api/transcribe/:id` | Runs a named provider, saves `transcription_<provider>.json` + `raw_<provider>.json` |
| `POST /api/burn/:id` | Builds `.ass` from transcription+style, burns subtitles via ffmpeg, streams progress via SSE |
| `GET /api/videos` | Lists all sessions from `VIDEOS_DIR` |
| `GET /api/transcription/:id/:provider` | Returns saved transcription |
| `PATCH /api/transcription/:id/:provider` | Persists `speaker_aliases` and `segment_edits` into the transcription JSON |
| `GET /api/video/:id` | Streams original video |
| `GET /api/video/:id/burned` | Streams burned video |
| `GET /api/video/:id/thumbnail` | Generates/caches `thumbnail_v2.jpg` via ffmpeg |

**Persistence model:** Everything is stored on disk under `VIDEOS_DIR` (default `./videos`). Each video gets a UUID directory containing `original.*`, `audio.wav`, `transcription_<provider>.json`, `raw_<provider>.json`, `subtitles.ass`, `burned.*`, `thumbnail_v2.jpg`, `meta.json`.

**Provider system:** Each STT provider lives in `app/server/providers/<name>.js` and exports a single async function `({ audioPath, videoDir, language, videoId }) => result`. All providers must return a normalized shape:

```js
{
  metadata: { provider, model, detected_language, audio_duration_s, confidence, speakers, segment_count, word_timestamps, timestamp },
  segments: [{ speaker, start, end, text, words: [{ word, start, end }] }],
  full_transcript: string,
  _raw: <raw API response>   // stripped before saving, written to raw_<provider>.json
}
```

Use `buildMetadata` and `formatTranscript` from `providers/utils.js`. Speaker IDs must be normalized to `SPEAKER_NN` format via `normalizeSpeaker()`. Audio extraction (`extractAudio`) produces mono 16kHz WAV; use `compressAudio` (128kbps MP3) for providers with file size caps.

Currently registered providers: `assemblyai`, `openai`, `groq`, `deepgram`, `gladia`, `sonix`, `speechmatics`, `mistral`, `revai`, `pyannote`, `elevenlabs`, `sarvam`, `xai`.

### Client

React Router v7 SPA. Routes:

| Path | Page | Purpose |
|---|---|---|
| `/` | `LandingPage` | Upload new video, list recent videos |
| `/editor/:videoId` | `EditorPage` | Main editor — transcription, style, burn |
| `/playground` | `PlaygroundPage` | Provider comparison playground |
| `/report` | `ProviderReportPage` | STT provider comparison report |

`EditorPage` is the core UI. It holds all editor state: `transcription`, `style` (persisted to `localStorage` keyed `style_<videoId>`), `burnState`, `speakerAliases`, `selectedProvider`. The `DEFAULT_STYLE` export from `EditorPage.jsx` is the canonical subtitle style schema used by both the editor and `assBuilder`.

`vite.config.js` proxies `/api` to `localhost:3001` in dev, and to the Render.com backend in production.

The client provider list (`app/client/src/providers.js`) is a static registry used for UI. Keep it in sync with `app/server/providers/index.js` when adding new providers.

### Subtitle pipeline

`POST /api/burn` → `assBuilder.buildAss(transcription, style)` → `.ass` file → `ffmpeg ass filter` → `burned.<ext>`. The burn route uses SSE (`text/event-stream`) to stream `{type: 'start'}`, `{type: 'progress', percent}`, `{type: 'done', burnedUrl}` events to the client.

## Environment

Copy `app/server/.env.example` to `app/server/.env`. Only the API keys for providers you intend to use are required. `VIDEOS_DIR` defaults to `./videos` relative to the server working directory.
