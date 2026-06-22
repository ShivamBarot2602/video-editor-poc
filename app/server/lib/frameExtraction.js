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
 * Extract MEANINGFUL candidate frames for thumbnail selection — ffmpeg-only.
 *
 * One `select` pass picks a frame when ANY of these hold (inside the trimmed
 * window, skipping first/last 0.5s to dodge fades/black):
 *   1. it is the first in-window frame                 (isnan(prev_selected_t))
 *   2. a scene cut AND >= `minGapS` since the last pick (gt(scene,TH) * gate)
 *   3. >= `timeFloorS` since the last pick             (coverage on static video)
 *
 * vs the old blind `fps=1`: shot-aware, and on a long/static video it emits
 * ~duration/timeFloor frames instead of one-per-second (no 600-write-then-delete).
 *
 * `metadata=print` writes each selected frame's real `pts_time` to a sidecar, so
 * timestamps are EXACT (the previous even-spacing approximation is wrong once
 * frames are unevenly spaced by scene cuts).
 *
 * Output: JPEG, 640px wide (aspect preserved). Capped at `maxFrames` by even
 * sampling (real timestamps preserved). Filename: frame_<NNN>_t<seconds>.jpg
 * Returns: [{ idx, t, path, filename }]
 */
function extractCandidateFrames(inputPath, outputDir, opts = {}) {
  const { maxFrames = 60, sceneThreshold = 0.3, minGapS = 1, timeFloorS = 6, minFrames = 8 } = opts

  return new Promise(async (resolve, reject) => {
    try {
      fs.mkdirSync(outputDir, { recursive: true })

      const duration = await getVideoDuration(inputPath)
      const startT = 0.5
      const endT = Math.max(startT + 1, duration - 0.5)
      const span = Math.max(0.1, endT - startT)

      const ptsFile = path.join(outputDir, '_pts.txt')
      const tmpPattern = path.join(outputDir, 'raw_%05d.jpg')

      // Commas inside select() args MUST be escaped (\,) — at filtergraph level a
      // bare comma separates filters. Passed as a single argv (no shell), so only
      // ffmpeg's own escaping applies. format=yuvj420p: some H.264 sources
      // (color_range=tv) trip ffmpeg's mjpeg encoder — convert here to sidestep.
      const expr =
        `between(t\\,${startT}\\,${endT})*` +
        `(isnan(prev_selected_t)` +
        `+gt(scene\\,${sceneThreshold})*gte(t-prev_selected_t\\,${minGapS})` +
        `+gte(t-prev_selected_t\\,${timeFloorS}))`
      const selectGraph = `select=${expr},metadata=print:file=${ptsFile},scale=640:-2,format=yuvj420p`
      // Fallback for huge-GOP sources: adaptive fps for even coverage (~maxFrames).
      const fps = Math.min(1, maxFrames / span)
      const fpsGraph = `fps=${fps.toFixed(5)},metadata=print:file=${ptsFile},scale=640:-2,format=yuvj420p`

      const wipe = () => {
        for (const f of fs.readdirSync(outputDir)) {
          if (f.startsWith('raw_')) fs.unlinkSync(path.join(outputDir, f))
        }
        try { fs.unlinkSync(ptsFile) } catch (_) {}
      }

      // One ffmpeg pass → { files, times } (raw frame names + real pts_time).
      const runPass = (inputOpts, graph) => new Promise((res, rej) => {
        wipe()
        const cmd = ffmpeg(inputPath)
        if (inputOpts?.length) cmd.inputOptions(inputOpts)
        cmd
          // -fps_mode vfr: emit only selected frames (no duplicate-PTS padding).
          .outputOptions(['-vf', graph, '-fps_mode', 'vfr', '-qscale:v', '3', '-an'])
          .output(tmpPattern)
          .on('end', () => {
            try {
              let times = []
              try {
                const txt = fs.readFileSync(ptsFile, 'utf8')
                times = (txt.match(/pts_time:([0-9.]+)/g) || []).map(s => parseFloat(s.split(':')[1]))
              } catch (_) { /* fall back to even spacing below */ }
              const files = fs.readdirSync(outputDir)
                .filter(f => f.startsWith('raw_') && f.endsWith('.jpg'))
                .sort()
              res({ files, times })
            } catch (e) { rej(e) }
          })
          .on('error', rej)
          .run()
      })

      // Fast path: decode I-frames only (`-skip_frame nokey`) — ~50× fewer decodes
      // on long videos. Keyframes are clean and encoder-placed near cuts, so the
      // scene+time-floor select on top is meaningful. Fall back to a full-decode
      // adaptive-fps pass only when a huge-GOP source yields too few keyframes.
      let { files, times } = await runPass(['-skip_frame', 'nokey'], selectGraph)
      if (files.length < minFrames) {
        ({ files, times } = await runPass([], fpsGraph))
      }

      // Pair each frame with its pts_time (same post-select order); even-spacing
      // only if the sidecar is missing/short.
      let pairs = files.map((f, i) => ({
        raw: f,
        t: Number.isFinite(times[i])
          ? times[i]
          : startT + span * (files.length > 1 ? i / (files.length - 1) : 0.5),
      }))

      // Cap by even sampling if too many; keeps real timestamps.
      if (pairs.length > maxFrames) {
        const step = pairs.length / maxFrames
        pairs = Array.from({ length: maxFrames }, (_, i) => pairs[Math.floor(i * step)])
      }

      const results = []
      for (let i = 0; i < pairs.length; i++) {
        const tStr = pairs[i].t.toFixed(2)
        const filename = `frame_${String(i).padStart(3, '0')}_t${tStr}.jpg`
        const dst = path.join(outputDir, filename)
        fs.renameSync(path.join(outputDir, pairs[i].raw), dst)
        results.push({ idx: i, t: pairs[i].t, path: dst, filename })
      }

      // Drop unsampled raw_ frames + the sidecar.
      for (const f of fs.readdirSync(outputDir)) {
        if (f.startsWith('raw_')) fs.unlinkSync(path.join(outputDir, f))
      }
      try { fs.unlinkSync(ptsFile) } catch (_) {}

      resolve(results)
    } catch (e) {
      reject(e)
    }
  })
}

module.exports = { extractCandidateFrames, getVideoDuration, getVideoSize }
