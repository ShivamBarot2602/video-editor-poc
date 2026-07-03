const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')

// x264 memory/CPU caps for re-encode paths (burn, clip cut). Without these,
// x264 sizes itself for the HOST machine: threads = all physical cores (on a
// shared cloud host that can be 16+, each adding 1080p frame buffers) and
// preset medium keeps a deep lookahead — measured 709MB peak RSS on a 1080p
// source, which OOMs small containers (Render 512MB). With these caps the
// same encode peaks at ~260MB. Extra threads are useless on fractional-vCPU
// instances anyway; env-tunable so bigger deployments can raise them.
const X264_THREADS = process.env.FFMPEG_THREADS || '2'
const X264_PRESET = process.env.FFMPEG_PRESET || 'veryfast'

const X264_MEMORY_OPTS = [
  '-threads', X264_THREADS,
  '-preset', X264_PRESET,
  '-tune', 'zerolatency',       // Forces immediate frame output, preventing RAM queueing
  // ref=1: single reference frame; rc-lookahead=20: shallow rate-control
  // window. Both trade a little compression efficiency for a flat memory
  // profile at 1080p.
  '-x264-params', 'ref=1:rc-lookahead=20:bframes=0:sliced-threads=1'
]

/**
 * Extract mono 16kHz WAV audio from any audio/video file.
 */
function extractAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .audioFrequency(16000)
      .audioChannels(1)
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run()
  })
}

/**
 * Compress WAV → MP3 at 128kbps (~1 MB/min) for providers with file size caps.
 */
function compressAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(128)
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run()
  })
}

// Clamp a user-supplied CRF (quality) to a sane range. Lower = better quality,
// bigger file. Shared range for x264 (0–51) and vp9 (0–63); we cap at 51 which
// is valid for both. Non-numeric → 23 (visually transparent default).
function clampCrf(quality) {
  const n = Number(quality)
  if (!Number.isFinite(n)) return 23
  return Math.min(51, Math.max(0, Math.round(n)))
}

/**
 * Burn an .ass subtitle file into a video.
 * Streams progress (0–100) via the onProgress callback.
 *
 * @param {object} [opts]
 * @param {'mp4'|'webm'} [opts.format='mp4'] output container/codec:
 *   - mp4  → H.264 (libx264), audio copied through (fast; source is normally AAC)
 *   - webm → VP9 (libvpx-vp9) + Opus; audio MUST be re-encoded (can't copy AAC
 *     into WebM). VP9 is substantially slower than veryfast x264.
 * @param {number} [opts.quality] CRF; lower = higher quality (default 23).
 */
function burnSubtitles(inputPath, assPath, outputPath, onProgress, opts = {}) {
  return new Promise((resolve, reject) => {
    // Delete existing burned file so ffmpeg doesn't prompt for overwrite
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)

    // Escape backslashes and colons in the path for the ass filter (Windows-safe too)
    const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')
    // Same TTFs the client preview (JASSUB) renders with — keeps burn output
    // identical to the WYSIWYG preview regardless of host system fonts.
    const fontsDir = path.join(__dirname, '../../shared/fonts')
    const escapedFontsDir = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:')

    const format = opts.format === 'webm' ? 'webm' : 'mp4'
    const crf = clampCrf(opts.quality)

    const command = ffmpeg(inputPath)
      .videoFilters(`ass='${escapedAss}':fontsdir='${escapedFontsDir}'`)

    if (format === 'webm') {
      // VP9 constant-quality: -b:v 0 + -crf. row-mt + cpu-used keep it from
      // being unbearably slow (still much slower than x264).
      command
        .videoCodec('libvpx-vp9')
        .audioCodec('libopus')
        .outputOptions([
          '-threads', X264_THREADS,
          '-crf', String(crf),
          '-b:v', '0',
          '-row-mt', '1',
          '-deadline', 'good',
          '-cpu-used', '4',
        ])
    } else {
      // H.264 path — memory-capped x264 opts + user CRF. Audio copied through.
      command
        .videoCodec('libx264')
        .audioCodec('copy')
        .outputOptions([...X264_MEMORY_OPTS, '-crf', String(crf)])
    }

    command
      .output(outputPath)
      .on('progress', ({ percent }) => {
        if (typeof onProgress === 'function' && percent != null) {
          onProgress(Math.min(99, Math.round(percent)))
        }
      })
      .on('end', () => {
        onProgress?.(100)
        resolve()
      })
      .on('error', reject)
      .run()
  })
}

function getFileSizeMB(filePath) {
  return fs.statSync(filePath).size / (1024 * 1024)
}

/**
 * Extract the first frame of a video as a JPEG thumbnail.
 * Keep the source aspect ratio and letterbox into a 16:9 canvas to avoid stretching.
 */
function extractThumbnail(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(0)
      .frames(1)
      .videoFilters('scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black')
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run()
  })
}

/**
 * Cut a [start, start+duration] segment out of a video, re-encoding for a
 * frame-accurate trim (-c copy would snap to keyframes and miss the requested
 * start by seconds). Streams progress (0–100) via the onProgress callback.
 *
 * Note: fluent-ffmpeg reports `percent` against the FULL input duration, so for
 * a short clip cut from a long source the value can read low/jumpy — we clamp
 * to [0,99] then emit 100 on end. Good enough for a progress bar.
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {number} start    - clip start in seconds
 * @param {number} duration - clip length in seconds
 * @param {(percent:number)=>void} [onProgress]
 */
function cutClip(inputPath, outputPath, start, duration, onProgress) {
  return new Promise((resolve, reject) => {
    // Delete existing output so ffmpeg doesn't prompt for overwrite
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)

    ffmpeg(inputPath)
      .setStartTime(start) // output seek → frame-accurate
      .setDuration(duration)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([...X264_MEMORY_OPTS, '-movflags', '+faststart'])
      .output(outputPath)
      .on('progress', ({ percent }) => {
        if (typeof onProgress === 'function' && percent != null) {
          onProgress(Math.max(0, Math.min(99, Math.round(percent))))
        }
      })
      .on('end', () => {
        onProgress?.(100)
        resolve()
      })
      .on('error', reject)
      .run()
  })
}

/**
 * Grab a single frame at timestamp `t` (seconds) as a JPEG — used for clip
 * thumbnail candidates the LLM points at. Seeks before decode (fast), scales to
 * `width` keeping aspect. Unlike extractCandidateFrames (scene-detection), this
 * is a direct seek to one known moment.
 *
 * @param {string} inputPath
 * @param {number} t          - timestamp in seconds
 * @param {string} outputPath
 * @param {{width?:number}} [opts]
 */
function extractFrameAt(inputPath, t, outputPath, { width = 640 } = {}) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(outputPath)) { try { fs.unlinkSync(outputPath) } catch (_) {} }
    ffmpeg(inputPath)
      .seekInput(Math.max(0, Number(t) || 0)) // input seek → fast, frame near t
      .frames(1)
      .outputOptions(['-vf', `scale=${width}:-2`, '-qscale:v', '3', '-an'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run()
  })
}

module.exports = { extractAudio, compressAudio, burnSubtitles, getFileSizeMB, extractThumbnail, cutClip, extractFrameAt }
