---
pdf_options:
  format: a4
  margin: 18mm 15mm 20mm 15mm
  printBackground: true
css: |
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
         color: #1e293b !important; font-size: 12px; line-height: 1.5; }
  h1, h2, h3, h4 { font-family: inherit !important; font-weight: 700; break-after: avoid; }
  h1 { color: #0f172a !important; font-size: 26px; margin: 0 0 2px; border: none; }
  h1 + p { margin-top: 4px; }
  h2 { color: #1D4ED8 !important; font-size: 17px; margin: 22px 0 9px; padding-bottom: 5px;
       border-bottom: 2px solid #1D4ED8; }
  h3 { color: #1e3a8a !important; font-size: 13px; margin: 14px 0 6px; }
  h4 { color: #334155 !important; font-size: 12px; margin: 12px 0 5px; }
  p, li { margin: 6px 0; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 10px;
          break-inside: avoid; }
  th { background: #1D4ED8 !important; color: #fff !important; text-align: left; padding: 6px 8px;
       border: 1px solid #1D4ED8; font-weight: 600; }
  td { padding: 5px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f1f5f9 !important; }
  code, pre, pre code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace !important; }
  code { background: #eef2ff !important; color: #3730a3 !important; padding: 1px 4px;
         border-radius: 3px; font-size: 0.85em !important; overflow-wrap: anywhere; }
  pre { background: #f8fafc !important; border: 1px solid #cbd5e1; border-radius: 8px;
        padding: 12px 14px; font-size: 9px !important; line-height: 1.3; overflow-x: auto;
        break-inside: avoid; white-space: pre-wrap; word-break: break-word; }
  pre code { background: none !important; color: #0f172a !important; padding: 0;
             font-size: 9px !important; }
  blockquote { margin: 10px 0; padding: 8px 14px; background: #eff6ff !important;
               border-left: 4px solid #1D4ED8; color: #334155 !important; break-inside: avoid; }
  blockquote p { margin: 3px 0; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 18px 0; }
  a { color: #1D4ED8 !important; text-decoration: none; word-break: break-all; }
  strong { color: #0f172a; }
  .subtitle { color: #475569; font-size: 13px; margin: 2px 0 0; }
  .meta { color: #64748b; font-size: 11px; margin-top: 6px; }
  .legend { font-size: 10.5px; color: #475569; }
  .part { color: #0f172a !important; font-size: 15px; font-weight: 700; margin: 4px 0 0;
          padding: 6px 0 0; border-top: 3px solid #0f172a; }
  .page-break { page-break-after: always; }
---

# FFmpeg Command Reference

<p class="subtitle">Every ffmpeg / ffprobe command this project runs — what it does, every parameter, its compute &amp; IO cost, and why it is shaped the way it is.</p>
<p class="meta">Video Editor POC · generated June 2026 · verified against source at the line numbers cited.</p>

## Overview

This project never shells out to `ffmpeg` directly. Every media operation is built as a **`fluent-ffmpeg`** chain, and every metadata probe goes through `fluent-ffmpeg`'s `.ffprobe()` helper (which invokes the `ffprobe` binary under the hood). All of it lives in **two hub modules**:

- **`app/server/lib/ffmpeg.js`** — six transcode / frame commands (audio extraction, audio compression, subtitle burn, clip cut, single-frame grab, first-frame thumbnail).
- **`app/server/lib/frameExtraction.js`** — two `ffprobe` probes plus a two-pass scene-aware candidate-frame extractor.

Routes and STT providers import these helpers; there is **no raw `ffmpeg`/`ffprobe` string anywhere in the routes or providers**. This doc lists each command as the **equivalent runnable CLI** (the form you would type in a terminal), alongside the actual `fluent-ffmpeg` source it is generated from.

> **Note on `fluent-ffmpeg` defaults.** Every chain ends in `.run()`, and the library passes `-y` (overwrite output without prompting) by default. Output container and default codecs are inferred from the output file extension unless an explicit codec is set.

## Command summary

| # | Feature | Source function | CLI gist | Triggered by | CPU cost |
|---|---|---|---|---|---|
| 1 | Audio extraction → 16 kHz mono WAV | `extractAudio` | `ffmpeg -i in -vn -c:a pcm_s16le -ar 16000 -ac 1 out.wav` | `POST /api/prepare`, `POST /api/transcribe` | Low |
| 2 | STT audio compression → 128 kbps MP3 | `compressAudio` | `ffmpeg -i in -vn -c:a libmp3lame -b:a 128k out.mp3` | OpenAI / Groq providers (size cap) | Low |
| 3 | Subtitle burning (.ass → video) | `burnSubtitles` | `ffmpeg -i in -vf "ass='subs.ass'" -c:a copy out.mp4` | `POST /api/burn` | **High** |
| 4 | Video clip cutting (frame-accurate) | `cutClip` | `ffmpeg -i in -ss S -t D -c:v libx264 -c:a aac -preset veryfast -movflags +faststart out.mp4` | `GET /api/clips/:id/export/stream` (SSE) | Mod–High |
| 5 | Clip-thumbnail frame grab | `extractFrameAt` | `ffmpeg -ss T -i in -frames:v 1 -vf scale=W:-2 -qscale:v 3 -an out.jpg` | `GET /api/clips/:id/suggest/stream` (video) | Low |
| 6 | First-frame video-list thumbnail | `extractThumbnail` | `ffmpeg -ss 0 -i in -frames:v 1 -vf "scale=…,pad=…" out.jpg` | `GET /api/video/:id/thumbnail` | Low |
| 7 | Candidate frames — scene-aware (pass 1) | `extractCandidateFrames` | `ffmpeg -skip_frame nokey -i in -vf "select=…,metadata=print,scale,format" -fps_mode vfr … raw_%05d.jpg` | `GET /api/thumbnails/:videoId/stream` (SSE) | Low–Mod |
| 8 | Candidate frames — fps fallback (pass 2) | `extractCandidateFrames` | `ffmpeg -i in -vf "fps=F,metadata=print,scale,format" -fps_mode vfr … raw_%05d.jpg` | Pass-1 fallback (huge-GOP) | **High** |
| 9 | Probe duration | `getVideoDuration` | `ffprobe -show_entries format=duration in` | Candidate extraction, clips | Negligible |
| 10 | Probe size + rotation | `getVideoSize` | `ffprobe -select_streams v:0 -show_entries stream=width,height… in` | Clips, thumbnails (aspect) | Negligible |

## How to read this doc

Each command has four parts, mirroring the requested format: **(1)** the command (equivalent CLI + the `fluent-ffmpeg` source), **(2)** parameter-by-parameter details, **(3)** CPU / IO usage, **(4)** remarks.

**CPU/IO cost legend** — the dominant cost in any ffmpeg job is whether it **decodes** and **re-encodes** video frames:

- **Negligible** — `ffprobe`; reads container/stream headers only, decodes zero frames.
- **Low** — audio-only, or a single video frame decoded (`-frames:v 1`), or keyframe-only decode (`-skip_frame nokey`).
- **Moderate–High** — full video decode + re-encode of a *segment* (`libx264`).
- **High** — full decode + per-frame filtering + full re-encode of the *whole* video.

**`fluent-ffmpeg` → CLI mapping** used throughout (the seek-placement rule is the one that matters most):

| `fluent-ffmpeg` | CLI | Note |
|---|---|---|
| `ffmpeg(x)` / `.input(x)` | `-i x` | input |
| `.seekInput(t)` | `-ss t` **before** `-i` | **input seek** — fast, lands on nearest keyframe (approximate) |
| `.setStartTime(t)` | `-ss t` **after** `-i` | **output seek** — decodes 0→t and discards, frame-accurate but slower |
| `.setDuration(d)` | `-t d` | output length |
| `.noVideo()` | `-vn` | drop video |
| `.audioCodec(c)` / `.videoCodec(c)` | `-c:a c` / `-c:v c` | codec |
| `.audioFrequency(f)` / `.audioChannels(n)` | `-ar f` / `-ac n` | sample rate / channels |
| `.audioBitrate(b)` | `-b:a {b}k` | audio bitrate |
| `.videoFilters(f)` | `-vf "f"` | filtergraph |
| `.frames(1)` | `-frames:v 1` | one frame then stop |
| `.inputOptions([…])` / `.outputOptions([…])` | flags before / after `-i` | verbatim |
| `.ffprobe(cb)` | `ffprobe … in` | runs `ffprobe -print_format json -show_format -show_streams -show_error in` |

<div class="page-break"></div>

<p class="part">Part A · Audio pipeline (transcription)</p>

## 1. Audio extraction (mono 16 kHz WAV for STT)

**Source:** `app/server/lib/ffmpeg.js:7-19` (function `extractAudio`) — called from `app/server/routes/prepare.js` and `app/server/routes/transcribe.js`

### 1. Command
```bash
ffmpeg -y -i original.mp4 -vn -c:a pcm_s16le -ar 16000 -ac 1 audio.wav
```

```js
ffmpeg(inputPath)
  .noVideo()                 // -vn
  .audioCodec('pcm_s16le')   // -c:a pcm_s16le
  .audioFrequency(16000)     // -ar 16000
  .audioChannels(1)          // -ac 1
  .output(outputPath)        // audio.wav
  .run()
```

### 2. Parameter details

| Flag | Value | Meaning |
|---|---|---|
| `-y` | — | Overwrite output without prompting (fluent-ffmpeg default). |
| `-i` | `original.mp4` | Input file — any audio/video container ffmpeg can demux; here the uploaded `original.<ext>`. |
| `-vn` | — | Drop the video stream ("no video"). Only audio is decoded and written. |
| `-c:a` | `pcm_s16le` | Audio codec = signed 16-bit little-endian linear PCM — uncompressed samples, the standard WAV payload. |
| `-ar` | `16000` | Sample rate = 16 kHz, the native input rate expected by virtually every STT model; supplying it avoids an implicit resample inside the provider. |
| `-ac` | `1` | Channels = 1 (mono). Downmixes any stereo/multichannel source — what STT models consume, and it at least halves file size vs stereo. |
| `audio.wav` | — | Output path; `.wav` extension makes ffmpeg infer the WAV (RIFF) container. |

### 3. CPU / IO usage

**Low CPU.** `-vn` means the video stream is never decoded — eliminating the expensive part of any video file. The audio path is decode-source → resample to 16 kHz → mono downmix → write raw PCM. PCM involves **no compression**, so encode cost is ~zero; only the source decode and resample/downmix do real work. Runs far faster than real time (a multi-minute clip extracts in a second or two).

**IO is output-dominated** because PCM is uncompressed: 16 kHz × mono × 16-bit = **32,000 bytes/s ≈ 1.83 MB/min** (≈ 110 MB/hour) regardless of source compression. Input read once (sequential); WAV written once. On long videos the WAV is the largest intermediate artifact in the pipeline.

### 4. Remarks

- **Why these values.** 16 kHz mono `pcm_s16le` is the lowest-common-denominator format accepted by essentially all STT providers; extracting once in this shape lets every provider read the same `audio.wav` without re-deriving it (per CLAUDE.md's provider contract).
- **When it runs.** First ffmpeg step in transcription. `POST /api/prepare/:id` calls it once up front so parallel multi-provider runs share one extraction; `POST /api/transcribe/:id` calls it lazily for single-provider runs.
- **Idempotency.** The function always re-encodes, but both callers gate it: `prepare.js` returns `{ cached: true }` if `audio.wav` exists; `transcribe.js` skips when `skipExtract` is set and the file exists. So the heavy work happens at most once per video.
- **WAV vs MP3.** Lossless PCM is used deliberately for transcription accuracy — no lossy artifacts before the model. The cost is file size, which is why size-capped providers compress to MP3 first (command 2).

## 2. STT audio compression (WAV → 128 kbps MP3 for size-capped providers)

**Source:** `app/server/lib/ffmpeg.js:24-35` (function `compressAudio`) — called from `app/server/providers/openai.js` and `app/server/providers/groq.js`

### 1. Command
```bash
ffmpeg -y -i audio.wav -vn -c:a libmp3lame -b:a 128k audio_compressed.mp3
```

```js
ffmpeg(inputPath)
  .noVideo()                  // -vn
  .audioCodec('libmp3lame')   // -c:a libmp3lame
  .audioBitrate(128)          // -b:a 128k
  .output(outputPath)         // audio_compressed.mp3
  .run()
```

### 2. Parameter details

| Flag | Value | Meaning |
|---|---|---|
| `-y` | — | Overwrite without prompting (fluent-ffmpeg default). |
| `-i` | `audio.wav` | Input — in practice always the `audio.wav` from `extractAudio` (mono, 16 kHz). |
| `-vn` | — | Drop video. Input is already audio-only, so this is a no-op safeguard guaranteeing no video is attempted. |
| `-c:a` | `libmp3lame` | Audio codec = LAME MP3 encoder → lossy MPEG-1/2 Layer III stream. |
| `-b:a` | `128k` | Audio bitrate = 128 kbit/s. `.audioBitrate(128)` renders as `128k`; sets the lossy compression target. |
| `audio_compressed.mp3` | — | Output path; `.mp3` selects the MP3 container. |

### 3. CPU / IO usage

**Light CPU.** Still audio-only (`-vn`), so no video decode. The added cost over WAV extraction is the LAME MP3 **encode** — a lossy psychoacoustic pass, measurably more work than writing PCM but still light for one mono stream at 128 kbps, and many times faster than real time.

**IO shrinks on output:** 128 kbps ≈ **16,000 bytes/s ≈ 0.96 MB/min** (≈ 1 MB/min) vs ≈ 1.83 MB/min for the WAV — roughly a **2× reduction** here (far larger for higher-rate sources). Input read once, smaller MP3 written once.

### 4. Remarks

- **Why it exists.** Purely to satisfy upload size caps. Both call sites then check `getFileSizeMB(mp3Path)` against a per-provider `LIMIT_MB` and throw a helpful error (suggesting AssemblyAI/Deepgram for longer videos) if still too big. 128 kbps is the sweet spot — under the cap, high enough not to hurt transcription quality.
- **When it runs.** Inside the OpenAI and Groq providers, after `audio.wav` exists and just before the file is streamed to the API. Writes a separate `audio_compressed.mp3`; never touches `audio.wav`, so the lossless original stays available to other providers.
- **Lossy on purpose.** Unlike `extractAudio`, this re-encodes lossily, but only for providers that cannot accept the larger WAV — the accuracy/size trade-off is accepted narrowly, not pipeline-wide.
- **No `-ar`/`-ac`.** The input WAV is already mono 16 kHz, so MP3 inherits those properties — no resample or downmix requested.

<div class="page-break"></div>

<p class="part">Part B · Subtitle burning</p>

## 3. Subtitle burning (.ass hardcoded into video)

**Source:** `app/server/lib/ffmpeg.js:42-66` (function `burnSubtitles`) — called from `app/server/routes/burn.js`

### 1. Command
```bash
ffmpeg -y -i original.mp4 -vf "ass='subtitles.ass'" -c:a copy burned.mp4
```

```js
// path escaped first: backslashes → '/', colons → '\:'  (filter-graph safe, Windows too)
const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')

ffmpeg(inputPath)
  .videoFilters(`ass='${escapedAss}'`)  // -vf "ass='…'"
  .audioCodec('copy')                   // -c:a copy
  .output(outputPath)                   // burned.mp4
  .on('progress', ({ percent }) => onProgress(Math.min(99, Math.round(percent))))
  .on('end', () => { onProgress?.(100); resolve() })
  .run()
```

### 2. Parameter details

| Flag | Value | Meaning |
|---|---|---|
| `-y` | — | Overwrite output without prompting (fluent default). |
| `-i` | `original.mp4` | Input video (the session's `original.<ext>`). |
| `-vf` | `ass='subtitles.ass'` | Apply the `ass` video filter. libass renders the Advanced SubStation Alpha file frame-by-frame onto the video, honoring all `.ass` styling — fonts, positions, colors, outlines, per-event overrides. |
| `-c:a` | `copy` | Stream-copy audio: no decode/re-encode, fast and lossless. Only video is re-encoded. |
| `burned.mp4` | — | Output path (from `.output(outputPath)`). |

The video stream **is** re-encoded: the `ass` filter forces a decode → filter (subtitle compositing) → encode cycle. There is no explicit `-c:v`, so ffmpeg selects the default encoder for the output container — for MP4, `libx264`.

### 3. CPU / IO usage

**HIGH CPU — the most expensive command in the pipeline.** The `ass` filter forces a full video decode, per-frame subtitle compositing, and a full video re-encode (default `libx264`). Audio is stream-copied (cheap). IO reads the entire input and writes a fully re-encoded output. Cost scales with video length and resolution. Because it is long-running, progress is streamed to the client over **SSE** rather than blocking on a single response.

### 4. Remarks

- **Path escaping.** Before insertion the `.ass` path is escaped: backslashes → `/`, colons → `\:`. Required because the `-vf` filter-graph syntax treats `:` as an option separator and `\` as an escape char; a Windows path like `C:\videos\subtitles.ass` would otherwise be misparsed. Forward slashes + escaped colon keep it Windows-safe.
- **Overwrite handling.** Any existing `burned.<ext>` is deleted (`fs.unlinkSync`) before the run, so ffmpeg never blocks on an interactive overwrite prompt.
- **Progress clamping.** Reported `percent` is rounded and clamped to ≤ `99` during the run, then forced to `100` on `end` — avoids a premature 100%. Emitted as SSE `{ type: 'progress', percent }`, framed by `start` and a final `done` event carrying the burned-video URL.
- **Audio untouched.** With `-c:a copy` the original audio is preserved bit-for-bit; only the picture changes.

<div class="page-break"></div>

<p class="part">Part C · Video clips</p>

## 4. Video clip cutting (frame-accurate trim)

**Source:** `app/server/lib/ffmpeg.js:104-128` (function `cutClip`) — called from `app/server/routes/clips.js`

### 1. Command
```bash
ffmpeg -y -i input.mp4 -ss 12.5 -t 30 -c:v libx264 -c:a aac -preset veryfast -movflags +faststart clip.mp4
```

```js
ffmpeg(inputPath)
  .setStartTime(start)     // -ss 12.5  (AFTER -i → output seek, frame-accurate)
  .setDuration(duration)   // -t 30
  .videoCodec('libx264')   // -c:v libx264
  .audioCodec('aac')       // -c:a aac
  .outputOptions(['-preset', 'veryfast', '-movflags', '+faststart'])
  .output(outputPath)      // clip.mp4
```

### 2. Parameter details

| Flag | Value | Meaning |
|---|---|---|
| `-i` | `input.mp4` | Source video (the full uploaded original). |
| `-ss` | `12.5` | Clip start (s). Placed **after** `-i` (`.setStartTime()`) → **output seek**: ffmpeg decodes from 0 to the start and discards those frames, so the cut lands on the exact requested frame. Trade-off: a large start offset means more decode thrown away. |
| `-t` | `30` | Clip duration (s) = end − start. ffmpeg stops writing after this much output. |
| `-c:v` | `libx264` | Re-encode video with the x264 H.264 encoder — required because the clip starts at an arbitrary (non-keyframe) point; frames must be rebuilt, not copied. |
| `-c:a` | `aac` | Re-encode audio to AAC to match and keep a standard, web-playable MP4. |
| `-preset` | `veryfast` | x264 speed/compression trade-off. Faster presets encode quicker at slightly larger files; `veryfast` keeps a full re-encode practical for on-demand export. |
| `-movflags` | `+faststart` | Relocate the MP4 `moov` atom (index) from end to front, so a browser can begin playback before the whole file downloads — important for the clip preview. |
| `clip.mp4` | — | Output path. |

### 3. CPU / IO usage

**MODERATE–HIGH.** Full re-encode through `libx264` for both video and audio — CPU-bound; the `veryfast` preset keeps it reasonable but far heavier than a stream copy. Because of output-seek, ffmpeg also decodes every frame from 0 up to `start` and throws them away, so a clip deep into a long source wastes proportionally more decode before any output. IO scales with the clip length written plus the leading portion of the source decoded-then-discarded.

### 4. Remarks

- **Re-encode, not stream-copy.** The clip start is an arbitrary LLM-suggested timestamp, not a keyframe. Output seek + re-encode = frame-accurate; `-c copy` would snap the start back to the nearest preceding keyframe and could miss the intended start by seconds.
- **`+faststart` for web playback.** The exported clip is previewed in the browser, so the index is moved to the front for instant streaming.
- **Progress is approximate.** The handler clamps `percent` to `[0,99]` and emits `100` on `end`. ffmpeg reports against the *full input* duration, not clip length, so for a short clip from a long source the percentage reads low/jumpy — fine for a bar, not exact.
- **Pre-deletes output.** Any existing `outputPath` is unlinked first → no overwrite prompt.
- **Call site.** The route re-clamps the stored clip range against the live video duration (in case the suggestion is stale) before computing `start`/`duration`, then streams `progress` over SSE.

## 5. Clip-thumbnail frame grab

**Source:** `app/server/lib/ffmpeg.js:141-153` (function `extractFrameAt`) — called from `app/server/routes/clips.js`

### 1. Command
```bash
ffmpeg -y -ss 12.5 -i input.mp4 -frames:v 1 -vf scale=640:-2 -qscale:v 3 -an frame.jpg
```

```js
ffmpeg(inputPath)
  .seekInput(Math.max(0, Number(t) || 0))  // -ss 12.5  (BEFORE -i → input seek, fast)
  .frames(1)                               // -frames:v 1
  .outputOptions(['-vf', `scale=${width}:-2`, '-qscale:v', '3', '-an'])
  .output(outputPath)
```

### 2. Parameter details

| Flag | Value | Meaning |
|---|---|---|
| `-ss` | `12.5` | Target timestamp (s). Placed **before** `-i` (`.seekInput()`) → **input seek**: jumps to a point near `t` (nearest preceding keyframe) and begins decoding there. Fast (skips everything before the seek), at the cost of the landed frame being approximately at `t`. Floored at 0 (`Math.max(0, Number(t) || 0)`) against negative/NaN input. |
| `-i` | `input.mp4` | Source video. |
| `-frames:v` | `1` | Capture exactly one video frame, then stop. |
| `-vf` | `scale=640:-2` | Scale to `width` (default 640) px wide; `-2` auto-computes height to preserve aspect, rounded to a multiple of 2 (required by yuv420 chroma subsampling). |
| `-qscale:v` | `3` | JPEG quality (scale 2–31, **lower = better**); `3` = high quality, modest size. |
| `-an` | — | Drop audio — irrelevant for a still, avoids any audio processing. |
| `frame.jpg` | — | Output path. |

### 3. CPU / IO usage

**LOW.** The input seek jumps straight to ≈`t`, so ffmpeg decodes only ~one frame instead of walking the file from the start. That frame is scaled and JPEG-encoded (trivial). IO is minimal — a small seek-and-read near `t` plus one small JPEG write. Cheap enough to call repeatedly across every candidate timestamp of every suggested clip.

### 4. Remarks

- **Input seek = fast but approximate.** The grabbed frame may land slightly off the requested timestamp; acceptable for a thumbnail candidate (a representative still, not a frame-exact extract), and the speed lets it run once per candidate.
- **Use case.** The clip-suggestion step returns candidate thumbnail timestamps per clip (`clip.thumbnails[n].t`); this grabs each as a JPEG into `clips/thumbs/<clip.id>-<n>.jpg`. A failed extract for one timestamp is caught and dropped from the kept list — the clip stays valid.
- **Distinct from scene-detection** (commands 7–8): a direct seek to one known moment, not a scan for interesting frames.
- **Pre-deletes output** (wrapped in `try/catch`) so ffmpeg never prompts to overwrite.

<div class="page-break"></div>

<p class="part">Part D · Thumbnails</p>

## 6. First-frame video-list thumbnail

**Source:** `app/server/lib/ffmpeg.js:76-87` (function `extractThumbnail`) — called from `app/server/index.js` (`GET /api/video/:id/thumbnail`)

### 1. Command
```bash
ffmpeg -y -ss 0 -i input.mp4 -frames:v 1 \
  -vf "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black" \
  thumbnail_v2.jpg
```

```js
ffmpeg(inputPath)
  .seekInput(0)        // -ss 0  (first frame)
  .frames(1)           // -frames:v 1
  .videoFilters('scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black')
  .output(outputPath)
```

### 2. Parameter details

| Flag | Value | Meaning |
|---|---|---|
| `-ss` | `0` | Input-side seek to timestamp 0 (before `-i`) → grabs the first frame. |
| `-i` | `input.mp4` | Input video. |
| `-frames:v` | `1` | Decode and write exactly one frame, then stop. |
| `-vf` `scale` | `320:180:force_original_aspect_ratio=decrease` | Resize to fit *within* a 320×180 box keeping aspect (uses the smaller scale factor → never stretched, never exceeds either dimension). |
| `-vf` `pad` | `320:180:(ow-iw)/2:(oh-ih)/2:black` | Letterbox the scaled frame onto a fixed 320×180 black canvas, centered `(ow-iw)/2` horizontally and `(oh-ih)/2` vertically → uniform 16:9 output regardless of source shape. |
| `thumbnail_v2.jpg` | — | Output path (cached on disk). |

### 3. CPU / IO usage

**LOW.** Only a single frame is decoded (`-frames:v 1`); the work is a scale plus pad onto a small canvas, then JPEG encode. Negligible CPU, one tiny file written.

### 4. Remarks

- Input seek to `0` lands on the first frame; the frame is fit into a 16:9 320×180 box and letterboxed onto black, so the thumbnail is never stretched and always uniform regardless of source aspect.
- Drives the thumbnails in the **video list** and is cached on disk as `thumbnail_v2.jpg`, so the command runs only once per video — the endpoint serves the cached file on subsequent requests.

## 7. Candidate-frame extraction — Pass 1 (scene-aware fast path)

**Source:** `app/server/lib/frameExtraction.js:65-171` (function `extractCandidateFrames`, pass 1 at 102–131) — called from `app/server/routes/thumbnails.js`

### 1. Command
```bash
# startT=0.5  endT=duration-0.5  (sceneThreshold=0.3, minGapS=1, timeFloorS=6)
ffmpeg -y -skip_frame nokey -i input.mp4 \
  -vf "select='between(t,0.5,ENDT)*(isnan(prev_selected_t)+gt(scene,0.3)*gte(t-prev_selected_t,1)+gte(t-prev_selected_t,6))',metadata=print:file=_pts.txt,scale=640:-2,format=yuvj420p" \
  -fps_mode vfr -qscale:v 3 -an \
  raw_%05d.jpg
```

> In the runnable CLI the commas *inside* `select(...)` are bare because the whole `-vf` value is one quoted shell token. In source, fluent-ffmpeg passes the filtergraph as a single argv element (no shell), so those same commas are escaped `\,` to stop ffmpeg reading them as filter separators at the filtergraph level.

```js
const expr =
  `between(t\\,${startT}\\,${endT})*` +
  `(isnan(prev_selected_t)` +
  `+gt(scene\\,${sceneThreshold})*gte(t-prev_selected_t\\,${minGapS})` +
  `+gte(t-prev_selected_t\\,${timeFloorS}))`
const selectGraph = `select=${expr},metadata=print:file=${ptsFile},scale=640:-2,format=yuvj420p`

const cmd = ffmpeg(inputPath)
cmd.inputOptions(['-skip_frame', 'nokey'])
cmd
  .outputOptions(['-vf', selectGraph, '-fps_mode', 'vfr', '-qscale:v', '3', '-an'])
  .output(tmpPattern)   // raw_%05d.jpg
  .run()
```

### 2. Parameter details

| Flag | Value | Meaning |
|---|---|---|
| `-skip_frame` | `nokey` | **Input option (before `-i`).** Decode only keyframes / I-frames. On a long video, ~50× fewer decodes; scene detection runs only over those clean, encoder-placed keyframes. |
| `-i` | `input.mp4` | Input video. |
| `-vf` `select` | `'between(t,startT,endT)*( … )'` | Frame-selection expression. Outer `between(t,startT,endT)` gates everything to the trimmed window (first/last 0.5 s skipped to dodge fades/black). It multiplies a sum of three OR-style conditions; a frame is kept when the product is non-zero. |
| ↳ | `isnan(prev_selected_t)` | True only when no frame has been selected yet → seeds the first in-window pick. |
| ↳ | `gt(scene,0.3)*gte(t-prev_selected_t,1)` | A scene cut above `sceneThreshold` (0.3) **AND** ≥ `minGapS` (1 s) since the last pick (factors multiply = logical AND) → suppresses bursts of cuts. |
| ↳ | `gte(t-prev_selected_t,6)` | ≥ `timeFloorS` (6 s) since the last pick → guarantees coverage on static/single-shot video where no cuts fire. |
| `metadata=print` | `file=_pts.txt` | Write each *selected* frame's real `pts_time` to a sidecar, so downstream timestamps are exact (not even-spacing approximated). |
| `scale` | `640:-2` | 640 px wide; `-2` auto-even height (yuv420 needs even dims). |
| `format` | `yuvj420p` | Convert to full-range YUV 4:2:0. Some H.264 sources are tagged `color_range=tv` (limited range), which can trip ffmpeg's mjpeg encoder; converting here sidesteps that. |
| `-fps_mode` | `vfr` | Variable frame rate — emit only frames `select` passed, no duplicate-PTS padding. |
| `-qscale:v` | `3` | JPEG quality (lower = better; 3 = high). |
| `-an` | — | Drop audio. |
| `raw_%05d.jpg` | — | Numbered output pattern (temporary, later renamed). |

### 3. CPU / IO usage

**LOW–MODERATE.** `-skip_frame nokey` makes the decoder touch only keyframes — on the order of 50× fewer decodes than full decode on a long video — and selection runs only over those. Output is a handful of small JPEGs plus the tiny `_pts.txt` sidecar.

### 4. Remarks

- First of a two-stage strategy. The fast path leans on keyframes being decoder-cheap *and* encoder-placed near scene changes, so scene-cut-plus-time-floor `select` over keyframes-only decoding is both quick and meaningful.
- **Fallback trigger.** If this yields fewer than `minFrames` (8) frames — typical of huge-GOP sources with sparse keyframes — the code falls back to Pass 2 (command 8).
- **Exact timestamps.** `metadata=print` captures each frame's real `pts_time`; once frames are unevenly spaced by scene cuts, the old even-spacing approximation is simply wrong.
- **Comma escaping.** Commas inside `select(...)` are escaped `\,` because at the filtergraph level a bare comma separates one filter from the next.
- **Post-processing.** Frames are capped to `maxFrames` (60) by even sampling (real timestamps preserved), and each surviving `raw_NNNNN.jpg` is renamed `frame_<NNN>_t<sec>.jpg`. These candidates feed the AI thumbnail-selection feature.

## 8. Candidate-frame extraction — Pass 2 (full-decode fps fallback)

**Source:** `app/server/lib/frameExtraction.js:65-171` (function `extractCandidateFrames`, fallback at 90–133) — called from `app/server/routes/thumbnails.js`

### 1. Command
```bash
# F = min(1, maxFrames/span), e.g. 0.50000  — NO -skip_frame here (full decode)
ffmpeg -y -i input.mp4 \
  -vf "fps=0.50000,metadata=print:file=_pts.txt,scale=640:-2,format=yuvj420p" \
  -fps_mode vfr -qscale:v 3 -an \
  raw_%05d.jpg
```

```js
const fps = Math.min(1, maxFrames / span)
const fpsGraph = `fps=${fps.toFixed(5)},metadata=print:file=${ptsFile},scale=640:-2,format=yuvj420p`

// runs only if pass 1 produced fewer than minFrames (8):
if (files.length < minFrames) {
  ({ files, times } = await runPass([], fpsGraph))  // [] = no input options → full decode
}
```

### 2. Parameter details

| Flag | Value | Meaning |
|---|---|---|
| `-i` | `input.mp4` | Input video. **No `-skip_frame`** — this pass fully decodes every frame, so sampling isn't limited to sparse keyframes. |
| `-vf` `fps` | `F = min(1, maxFrames/span)` | Adaptive sampling rate: one frame every `1/F` s. `span` = trimmed window length; `maxFrames/span` targets ~`maxFrames` evenly-spaced samples, capped at 1 fps so short clips don't oversample. Written to 5 decimals (`toFixed(5)`). |
| `metadata=print` | `file=_pts.txt` | Write each emitted frame's `pts_time` to the sidecar (exact timestamps), same as pass 1. |
| `scale` | `640:-2` | 640 px wide, auto-even height. |
| `format` | `yuvj420p` | Full-range YUV 4:2:0 to avoid the mjpeg encoder tripping on `color_range=tv` sources. |
| `-fps_mode` | `vfr` | Variable frame rate; emit only sampled frames, no duplicate-PTS padding. |
| `-qscale:v` | `3` | JPEG quality (high). |
| `-an` | — | Drop audio. |
| `raw_%05d.jpg` | — | Numbered output pattern. |

### 3. CPU / IO usage

**HIGH.** Omitting `-skip_frame nokey` means ffmpeg fully decodes *every* frame to resample at the adaptive `fps` rate — far more decode work than pass 1. Intentionally the fallback, reserved for huge-GOP sources whose keyframes are too sparse for pass 1 to reach `minFrames`. Note the previous blind `fps=1` approach would write-then-delete up to ~600 frames on a long video; the adaptive rate (plus the cap-by-even-sampling step) targets ~`maxFrames` outputs directly and avoids that churn.

### 4. Remarks

- Second half of the two-stage design: the cheap I-frame `select` path (command 7) runs first; this full-decode adaptive-fps pass runs *only* when that returns fewer than `minFrames` (8).
- Samples on a clock rather than on scene cuts — the robust choice when a source has too few keyframes for shot-aware selection.
- As in pass 1: `metadata=print` captures real `pts_time`, the result set is capped to `maxFrames` by even sampling (real timestamps preserved), and each surviving `raw_NNNNN.jpg` is renamed `frame_<NNN>_t<sec>.jpg` before being handed to AI thumbnail selection.

<div class="page-break"></div>

<p class="part">Part E · Metadata probing (ffprobe)</p>

## 9. Probe video duration

**Source:** `app/server/lib/frameExtraction.js:8-15` (function `getVideoDuration`) — called from `extractCandidateFrames` (same file, to compute the trim window) and `app/server/routes/clips.js`

### 1. Command
```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 input.mp4
```

Prints just the duration as a bare value (e.g. `137.480000`). Under the hood fluent-ffmpeg does **not** run this exact command — its `.ffprobe()` always issues the broader call and parses the full JSON, reading only `format.duration`:

```bash
ffprobe -print_format json -show_format -show_streams -show_error input.mp4
```

```js
ffmpeg.ffprobe(inputPath, (err, data) => {
  if (err) return reject(err)
  resolve(data?.format?.duration ?? 0)
})
```

### 2. Parameter details

| Flag | Value | Meaning |
|---|---|---|
| `-v` | `error` | Log level: silence all but actual errors, keeping stdout clean for the value. |
| `-show_entries` | `format=duration` | Restrict output to the `duration` key from the container's `format` section. |
| `-of` | `default=noprint_wrappers=1:nokey=1` | Output format `default` with section wrappers and `key=` prefix suppressed → only the raw numeric value. |
| `-print_format` | `json` | *(fluent's actual call)* Emit results as JSON. |
| `-show_format` | — | *(fluent)* Include the container-level `format` block (where `duration` lives). |
| `-show_streams` | — | *(fluent)* Include per-stream metadata (unused here, always requested). |
| `-show_error` | — | *(fluent)* Emit an `error` object in the JSON on failure → surfaced as the callback's `err`. |

### 3. CPU / IO usage

**Negligible.** `ffprobe` reads only container/stream headers; it does **not** decode any video frames. Duration comes from the container's format block (e.g. the `moov`/`mvhd` atom in MP4), so the call is near-instant with tiny IO (header read, not a whole-file scan) — the sharp opposite of the encode/burn commands.

### 4. Remarks

- Returns `format.duration` in seconds, falling back to `0` when absent (`?? 0`), rejecting on probe error.
- Drives the trim window in `extractCandidateFrames` (skip first/last fraction) and bounds clip start/end in `clips.js`.
- `ffprobe` ships with the ffmpeg suite — no separate dependency.

## 10. Probe video size + rotation

**Source:** `app/server/lib/frameExtraction.js:21-43` (function `getVideoSize`) — called from `app/server/routes/clips.js` and `app/server/routes/thumbnails.js`

### 1. Command
```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height:stream_tags=rotate:stream_side_data=rotation \
  -of json input.mp4
```

Isolates the first video stream and returns just dimensions + rotation. As with duration, fluent-ffmpeg actually runs the broader call below and parses the full JSON, reading from its `streams` array:

```bash
ffprobe -print_format json -show_format -show_streams -show_error input.mp4
```

```js
ffmpeg.ffprobe(inputPath, (err, data) => {
  if (err) return reject(err)
  const v = (data?.streams || []).find(s => s.codec_type === 'video')
  if (!v) return reject(new Error('No video stream'))
  let w = v.width || 0, h = v.height || 0
  const rot = parseInt(v.tags?.rotate || v.side_data_list?.[0]?.rotation || 0, 10)
  if (Math.abs(rot) === 90 || Math.abs(rot) === 270) { [w, h] = [h, w] }  // honor rotation
  const ratio = w && h ? w / h : 0
  const aspect = ratio === 0 ? 'unknown' : ratio > 1.05 ? 'landscape' : ratio < 0.95 ? 'portrait' : 'square'
  resolve({ width: w, height: h, aspect, ratio })
})
```

### 2. Parameter details

| Flag | Value | Meaning |
|---|---|---|
| `-v` | `error` | Errors only, suppress informational noise. |
| `-select_streams` | `v:0` | Probe only the first video stream, ignoring audio/subtitle/data. |
| `-show_entries` | `stream=width,height` | Emit the stored pixel `width` and `height`. |
| `-show_entries` | `stream_tags=rotate` | Emit the legacy `rotate` tag (e.g. `90`, `270`) when present. |
| `-show_entries` | `stream_side_data=rotation` | Emit the newer display-matrix `rotation` value from side-data (modern replacement for the `rotate` tag). |
| `-of` | `json` | Structured JSON output, matching what fluent-ffmpeg parses. |
| `-print_format json -show_format -show_streams -show_error` | — | *(fluent's actual call)* — this function reads the `streams` array to find the video stream and its `width`, `height`, `tags.rotate`, `side_data_list[].rotation`. |

### 3. CPU / IO usage

**Negligible.** Dimensions and rotation come straight from stream metadata in the container header — no frames decoded. Effectively instant, touches only the file header (the `moov` atom / stream descriptors), not the media payload.

### 4. Remarks

- Returns `{ width, height, aspect, ratio }`. Honors rotation so landscape footage recorded in portrait orientation reports correctly: a rotation of `90`/`270` (abs value) swaps width and height. Reads legacy `tags.rotate` first, falls back to side-data `rotation`.
- Aspect classified from the ratio: `> 1.05` → `landscape`, `< 0.95` → `portrait`, else `square` (`unknown` when dimensions are missing).
- Drives aspect-aware logic downstream — `clips.js` and `thumbnails.js` use it to choose output framing / UI cell ratios. **`thumbnails.js` wraps the call in `try/catch`** and, on failure, logs `"ffprobe size failed … — defaulting to landscape"` and falls back to a 16:9 landscape default so thumbnail generation still proceeds.

<div class="page-break"></div>

## Appendix · Where each command runs

| Pipeline stage | Endpoint / trigger | Commands used |
|---|---|---|
| Prepare audio | `POST /api/prepare/:id` | 1 (extract) |
| Transcribe | `POST /api/transcribe/:id` | 1 (extract, if not prepared), 2 (compress — OpenAI/Groq only) |
| Burn subtitles | `POST /api/burn/:id` (SSE) | 3 (burn) |
| Suggest clips (transcript) | `POST /api/clips/:id/suggest` | 9 (duration), 10 (size) |
| Suggest clips (video understanding) | `GET /api/clips/:id/suggest/stream?method=video` (SSE) | 9 (duration), 10 (size), 5 (candidate frame per thumbnail) |
| Export clip | `GET /api/clips/:id/export/stream` (SSE) | 4 (cut) |
| Video-list thumbnail | `GET /api/video/:id/thumbnail` | 6 (first-frame) |
| AI thumbnail selection | `GET /api/thumbnails/:videoId/stream` (SSE) | 9 (duration), 10 (size), 7 → 8 (candidate frames, pass 1 then fallback) |

*All commands are generated by `fluent-ffmpeg`; the CLI forms above are the equivalent you would run by hand. Verified against the source at the cited line numbers (June 2026).*
