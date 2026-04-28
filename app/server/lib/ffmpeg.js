const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')

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

/**
 * Burn an .ass subtitle file into a video.
 * Streams progress (0–100) via the onProgress callback.
 * Leaves the audio stream untouched (-c:a copy).
 */
function burnSubtitles(inputPath, assPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    // Delete existing burned file so ffmpeg doesn't prompt for overwrite
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)

    // Escape backslashes and colons in the path for the ass filter (Windows-safe too)
    const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')

    ffmpeg(inputPath)
      .videoFilters(`ass='${escapedAss}'`)
      .audioCodec('copy')
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

module.exports = { extractAudio, compressAudio, burnSubtitles, getFileSizeMB, extractThumbnail }
