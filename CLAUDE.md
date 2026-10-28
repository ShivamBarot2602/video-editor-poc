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

# Server tests (SmartCrop; Node 22, AWS mocked — no network)
yarn --cwd app/server test
```

Only the SmartCrop API has tests (`app/server/test/smartcrop/`). No linting config exists.

## Architecture

Monorepo with two workspaces managed via root `package.json`:

- `app/server/` — Express.js API (Node ≥22.12, CommonJS)
- `app/client/` — React 18 SPA (Vite, ES modules)
- `app/shared/` — code + assets used by both: `assBuilder.mjs` (the ASS subtitle builder; server consumes it via a `require(esm)` shim at `app/server/lib/assBuilder.js`, client imports it through the `@shared` Vite alias) and `fonts/` (TTFs loaded by both the JASSUB preview and ffmpeg's `fontsdir`, so preview and burn rasterize identical glyphs)

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

`EditorPage` is the core UI. It holds all editor state: `transcription`, `style` (persisted to `localStorage` keyed `style_<videoId>`), `burnState`, `speakerAliases`, `selectedProvider`. `DEFAULT_STYLE` in `config/subtitleStyle.js` is the canonical subtitle style schema used by the editor, the preview, and `assBuilder` (re-exported from `EditorPage.jsx` for backward compatibility).

**WYSIWYG preview:** `VideoPlayer` builds the same `.ass` the server burns (`buildAss` from `@shared/assBuilder.mjs`) and renders it with `AssPreview` — a [JASSUB](https://github.com/ThaUnknown/jassub) (libass/WASM) canvas overlaid on the video, so the preview is pixel-accurate to the burned output including karaoke, wrapping, and letterboxing. Style/transcription changes flow through a debounced `setTrack`; a `manualRender` is forced when the video is paused (frame callbacks don't fire then). `position: 'custom'` + `customPosition {x, y}` (normalized 0–1, block center in 1920×1080 PlayRes space) enables free placement via `SubtitleDragLayer`, and maps to `\an5\pos(...)` in the ASS. `jassub` is patched via `patch-package` (`app/client/patches/`) to disable `desynchronized` canvas contexts (Chromium/Windows artifacts).

The client always calls relative `/api` (same-origin everywhere — no CORS). Routing to the backend, in order: `BACKEND_URL` env var → `vite.config.js` proxy locally (dev + `vite preview`) and `middleware.js` (Vercel Routing Middleware) on deployments; unset, it falls back to `localhost:3001` in dev and the static `vercel.json` rewrite (production Render URL) when deployed. Set `BACKEND_URL` in Vercel's Preview environment to point PR preview clients at a preview backend.

The client provider list (`app/client/src/providers.js`) is a static registry used for UI. Keep it in sync with `app/server/providers/index.js` when adding new providers.

### Auth

Single-user login gates the whole app (it's publicly deployed). Credentials come from env: `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` (bcrypt — generate via `node scripts/gen-password-hash.js '<pw>'`), `JWT_SECRET`. The server **refuses to start** if any are missing.

- `POST /api/auth/login` verifies creds, sets an httpOnly `sp_auth` JWT cookie (HS256, 7d).
- `POST /api/auth/logout` clears it; `GET /api/auth/me` reports the session.
- `/api/auth/*` and `/api/health` are public; `requireAuth` (`middleware/auth.js`) gates everything else under `/api`.
- Client: `auth/AuthContext.jsx` checks `/me` on mount and renders `LoginPage` until authed. A `window.fetch` interceptor in `main.jsx` adds `credentials:'include'` to `/api` calls and dispatches `auth:expired` on a 401, dropping back to login.

### Subtitle pipeline

`POST /api/burn` → `buildAss(transcription, style)` (from `app/shared/assBuilder.mjs`) → `.ass` file → `ffmpeg ass filter` with `fontsdir=app/shared/fonts` → `burned.<ext>`. The burn route uses SSE (`text/event-stream`) to stream `{type: 'start'}`, `{type: 'progress', percent}`, `{type: 'done', burnedUrl}` events to the client.

The client preview renders the identical `.ass` through libass (JASSUB), so any change to `buildAss` or the fonts dir affects preview and burn equally — that equivalence is the point; don't fork the two paths. Fonts must exist as files in `app/shared/fonts/`: the UI-selectable families are registered in `AssPreview.jsx` (`AVAILABLE_FONTS`, lowercase keys) and `config/subtitleStyle.js` (`FONT_FAMILIES`); script-fallback fonts (Indic etc.) go in `FALLBACK_FONTS`.

## Environment

Copy `app/server/.env.example` to `app/server/.env`. Only the API keys for providers you intend to use are required. `VIDEOS_DIR` defaults to `./videos` relative to the server working directory.

## SmartCrop API
- Spec: .claude/spec/00-overview.md (shared rules, read first) and 01–04 (one file per endpoint group).
- Opt-in: mounted at `/api/smartcrop` only when `SMARTCROP_ENABLED=true` (then missing env stops boot). It sits behind `requireAuth` and is mounted **before** the app-wide `express.json()`/404/error handler — it owns its 1 MiB body parser, `ROUTE_NOT_FOUND` and error envelope (`lib/apiError.js`).
- Layout: `routes/smartcrop.js` → `controllers/smartcrop/*` (validate → service → respond) → `services/smartcrop/*`. `projectLoader.loadAndSync` is the shared "404 → expire upload → sync processing → sync active render" step; `statusSync` polls Step Functions (no callbacks) with a 3 s throttle + in-process dedupe; `projectRepo` is the only DynamoDB access (conditional on expected status).
- AWS thin clients: `lib/dynamo.js`, `lib/sfn.js`, `lib/lambda.js`, and `lib/s3.js` `forBucket(name)` for the IN/JOBS/OUT buckets. They tag failures with `awsService`, which the error middleware maps to 502 `UPSTREAM_ERROR`.
- Tests: `test/smartcrop/helpers/` holds in-memory DynamoDB + S3 fakes behind `aws-sdk-client-mock` (they evaluate the real condition/update expressions), and fixtures trimmed from real pipeline output. Real-AWS check: `scripts/smartcrop-e2e.js`; tables: `scripts/smartcrop-create-tables.js`.
- The spec is the source of truth for routes, payloads, validation, responses, error codes and corner cases.
  If code and spec disagree, ask before changing either.
- Custom validators only (no zod/joi). All smartcrop S3 keys are built only in server/storage/videoStore.js.
- Tests: every error code and every corner case in a spec file needs a test (AWS mocked with aws-sdk-client-mock).