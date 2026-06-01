const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')

/**
 * Probe video duration in seconds via ffprobe.
 */
function getVideoDuration(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) return reject(err)
      resolve(data?.format?.duration ?? 0)
    })
  })
}

/**
 * Probe video width/height (after rotation metadata is applied) via ffprobe.
 * Returns { width, height, aspect: 'landscape' | 'portrait' | 'square', ratio: number }.
 */
function getVideoSize(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) return reject(err)
      const v = (data?.streams || []).find(s => s.codec_type === 'video')
      if (!v) return reject(new Error('No video stream'))
      let w = v.width || 0
      let h = v.height || 0
      // Honor rotation metadata (e.g. 90 / 270) so landscape sources recorded
      // in portrait orientation are reported correctly.
      const rot = parseInt(v.tags?.rotate || v.side_data_list?.[0]?.rotation || 0, 10)
      if (Math.abs(rot) === 90 || Math.abs(rot) === 270) {
        [w, h] = [h, w]
      }
      const ratio = w && h ? w / h : 0
      const aspect = ratio === 0 ? 'unknown'
        : ratio > 1.05 ? 'landscape'
        : ratio < 0.95 ? 'portrait'
        : 'square'
      resolve({ width: w, height: h, aspect, ratio })
    })
  })
}

/**
 * Extract candidate frames for thumbnail selection.
 *
 * Uses ffmpeg's `select` filter to pick:
 *   - frames at scene cuts (scene > 0.3), AND
 *   - one frame per second as a safety net for static videos.
 *
 * Skips first/last 0.5s to dodge fades/black frames.
 * Caps total output at `maxFrames` (default 60) by sampling evenly if needed.
 *
 * Output: JPEG, 640px wide (aspect preserved), into outputDir.
 * Filename pattern: frame_<NNN>_t<seconds>.jpg
 *
 * Returns: [{ idx, t, path, filename }]
 *
 * Note: ffmpeg `select` runs once; we don't get per-frame timestamps in node-land.
 * We rely on `-frame_pts true` + `-vsync vfr` and parse timestamps from filenames
 * via the `%t` printf trick — but fluent-ffmpeg doesn't expose that directly,
 * so we use a 2-step approach: extract with `-frame_pts 1` writing PTS as the
 * filename, then re-list and parse.
 */
function extractCandidateFrames(inputPath, outputDir, opts = {}) {
  const { maxFrames = 60, sceneThreshold = 0.3 } = opts

  return new Promise(async (resolve, reject) => {
    try {
      fs.mkdirSync(outputDir, { recursive: true })

      const duration = await getVideoDuration(inputPath)
      const startT = 0.5
      const endT = Math.max(startT + 1, duration - 0.5)

      // Sampling strategy: 1 frame per second via `fps=1` filter.
      //
      // We previously used `select='gt(scene,T)+eq(mod(t,1),0)'` (scene change OR
      // 1 fps fallback), but the `eq(mod(t,1),0)` half is a float equality on PTS
      // — almost never true with VFR sources — and the result is 0 emitted frames.
      // `fps=1` is deterministic across all codecs/framerates and good enough for
      // POC: the CV scorer + VLM rerank pick the best frames anyway, and scene-cut
      // sampling can be added back later via a dedicated `scdet` pass if needed.
      //
      // sceneThreshold kept in the function signature for forward-compatibility.
      void sceneThreshold

      const tmpPattern = path.join(outputDir, 'raw_%05d.jpg')

      ffmpeg(inputPath)
        .videoFilters([
          // Sample at 1 fps inside the trimmed window.
          `fps=1`,
          `scale=640:-2`,
          // Force JPEG full-range pixel format. Some sources (e.g. H.264 with
          // color_range=tv) trip ffmpeg 8.x's mjpeg encoder:
          //   "Non full-range YUV is non-standard… ff_frame_thread_encoder_init failed"
          // Converting here sidesteps that without needing -strict unofficial.
          `format=yuvj420p`,
        ])
        .outputOptions([
          '-qscale:v', '3',
          '-ss', String(startT),
          '-to', String(endT),
        ])
        .output(tmpPattern)
        .on('end', () => {
          try {
            // List extracted frames, build canonical names with timestamps.
            const files = fs.readdirSync(outputDir)
              .filter(f => f.startsWith('raw_') && f.endsWith('.jpg'))
              .sort()

            // Without PTS in filename, approximate timestamps by even spacing
            // between startT and endT. Good enough for POC UI.
            const totalSpan = Math.max(0.1, endT - startT)
            let kept = files
            // Cap if too many extracted
            if (kept.length > maxFrames) {
              const step = kept.length / maxFrames
              kept = Array.from({ length: maxFrames }, (_, i) => kept[Math.floor(i * step)])
            }

            const results = []
            for (let i = 0; i < kept.length; i++) {
              const raw = kept[i]
              const t = startT + (kept.length === 1 ? totalSpan / 2 : (totalSpan * i) / (kept.length - 1))
              const tStr = t.toFixed(2)
              const filename = `frame_${String(i).padStart(3, '0')}_t${tStr}.jpg`
              const dst = path.join(outputDir, filename)
              fs.renameSync(path.join(outputDir, raw), dst)
              results.push({ idx: i, t, path: dst, filename })
            }

            // Delete any leftover raw_ files (shouldn't be any after rename).
            for (const f of fs.readdirSync(outputDir)) {
              if (f.startsWith('raw_')) fs.unlinkSync(path.join(outputDir, f))
            }

            resolve(results)
          } catch (e) {
            reject(e)
          }
        })
        .on('error', reject)
        .run()
    } catch (e) {
      reject(e)
    }
  })
}

module.exports = { extractCandidateFrames, getVideoDuration, getVideoSize }
