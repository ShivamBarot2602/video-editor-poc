const express = require('express')
const path = require('path')
const fs = require('fs')
const clipSuggest = require('../providers/clipSuggest')
const { resolveBucket } = require('../lib/clipPrompt')
const { getVideoDuration, getVideoSize } = require('../lib/frameExtraction')
const { cutClip, extractFrameAt } = require('../lib/ffmpeg')

const router = express.Router()

// Only allow simple tokens in path-segment params (provider, clipId) to block traversal.
const SAFE = /^[A-Za-z0-9_-]+$/

// Provider id for the video-understanding method (Gemini watches the raw video).
// Stored separately from the transcript providers so both can coexist.
const VIDEO_PROVIDER = 'geminivideo'

// Default-res Gemini handles ~1h of video; low-res reaches ~3h. Past this we
// force low-res so long uploads still work.
const DEFAULT_RES_MAX_S = 3600

// In-flight lock for the (expensive) video-understanding run, keyed by videoId.
const runningVideo = new Set()

function videoDirOf(req, id) {
  return path.join(req.videosDir, id)
}

function findOriginal(dir) {
  if (!fs.existsSync(dir)) return null
  const f = fs.readdirSync(dir).find(x => x.startsWith('original.'))
  return f ? path.join(dir, f) : null
}

function clipsFile(dir, provider) {
  return path.join(dir, `clips_${provider}.json`)
}

function savedFile(dir) {
  return path.join(dir, 'saved_clips.json')
}

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { return fallback }
}

// Stable id for a saved clip — encodes provider + range so the same clip saved
// twice dedupes, and the on-demand cut file (clips/<id>.mp4) never collides with
// a volatile suggestion file (`<provider>-clip-NN.mp4`).
function computeSavedId(provider, start, end) {
  return `saved-${provider}-${Math.round(start * 1000)}-${Math.round(end * 1000)}`
}

// Delete a previous suggestion run's exported files for this provider so a
// re-suggest (which reuses `<provider>-clip-NN` ids for different ranges) can't
// serve a stale cut. Saved files (`saved-*`) are never matched.
function cleanStaleSuggestionFiles(dir, provider) {
  try {
    const cdir = path.join(dir, 'clips')
    if (fs.existsSync(cdir)) {
      for (const f of fs.readdirSync(cdir)) {
        if (f.startsWith(`${provider}-clip-`) && f.endsWith('.mp4')) {
          fs.unlinkSync(path.join(cdir, f))
        }
      }
    }
    // Stale thumbnail frames from a previous run of this provider.
    const tdir = path.join(dir, 'clips', 'thumbs')
    if (fs.existsSync(tdir)) {
      for (const f of fs.readdirSync(tdir)) {
        if (f.startsWith(`${provider}-clip-`)) fs.unlinkSync(path.join(tdir, f))
      }
    }
  } catch (_) {}
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * Validate + clean the raw LLM clip list into the persisted shape.
 * - coerce/clamp ranges into [0, videoDuration], drop invalid / <1s
 * - snap start/end to nearby segment boundaries (<=0.5s)
 * - rank by score, drop clips overlapping a higher-ranked one
 * - truncate to `count`, assign stable id `<provider>-clip-NN`
 * Never throws on a salvageable response — returns { clips, warnings }.
 */
function normalizeClips(raw, { videoDuration, count, segments, provider }) {
  const warnings = []
  const boundaries = []
  for (const s of Array.isArray(segments) ? segments : []) {
    if (Number.isFinite(s.start)) boundaries.push(Number(s.start))
    if (Number.isFinite(s.end)) boundaries.push(Number(s.end))
  }
  const snap = (v) => {
    let best = v, bestD = 0.5
    for (const b of boundaries) {
      const d = Math.abs(b - v)
      if (d < bestD) { best = b; bestD = d }
    }
    return best
  }

  const cleaned = []
  for (const c of Array.isArray(raw) ? raw : []) {
    let start = Number(c.start)
    let end = Number(c.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    start = Math.max(0, snap(start))
    end = Math.min(videoDuration, snap(end))
    if (end - start < 1) continue
    const score = Math.max(1, Math.min(10, Math.round(Number(c.score)) || 1))
    const clip = {
      start, end,
      duration: +(end - start).toFixed(2),
      title: String(c.title || '').trim().slice(0, 120),
      hook: String(c.hook || '').trim(),
      // video method emits `reason`; transcript method emits `rationale`.
      rationale: String(c.rationale ?? c.reason ?? '').trim(),
      transcript_excerpt: String(c.transcript_excerpt || '').trim(),
      score,
    }

    // Video-understanding extras — only attached when present, so transcript
    // clips keep their existing shape.
    const caption = String(c.caption || '').trim()
    if (caption) clip.caption = caption

    const rawThumbs = Array.isArray(c.thumbnails) ? c.thumbnails : []
    const thumbs = []
    for (const rt of rawThumbs) {
      let tt = Number(rt && typeof rt === 'object' ? rt.t : rt)
      if (!Number.isFinite(tt)) continue
      tt = Math.max(start, Math.min(end, tt)) // clamp inside the (clamped) clip
      thumbs.push({ t: +tt.toFixed(2) })
      if (thumbs.length >= 3) break
    }
    if (thumbs.length) clip.thumbnails = thumbs

    cleaned.push(clip)
  }

  // Rank best-first, then drop any clip overlapping an already-accepted one.
  cleaned.sort((a, b) => b.score - a.score || a.start - b.start)
  const accepted = []
  for (const c of cleaned) {
    const overlaps = accepted.some(a => c.start < a.end && c.end > a.start)
    if (!overlaps) accepted.push(c)
  }

  if (accepted.length > count) accepted.length = count
  if (accepted.length < count) {
    warnings.push(`Model returned ${accepted.length} usable clips (requested ${count}).`)
  }

  // Present in chronological order; id carries provider + 1-based index.
  accepted.sort((a, b) => a.start - b.start)
  return {
    clips: accepted.map((c, i) => ({
      id: `${provider}-clip-${pad2(i + 1)}`,
      suggestProvider: provider,
      ...c,
      exported: false,
      clipUrl: null,
    })),
    warnings,
  }
}

// POST /api/clips/:id/suggest  { suggestProvider, transcriptProvider, bucket, count }
router.post('/:id/suggest', async (req, res) => {
  const { id } = req.params
  const { suggestProvider, transcriptProvider, bucket = 'auto', count } = req.body || {}

  try {
    const dir = videoDirOf(req, id)
    const originalPath = findOriginal(dir)
    if (!originalPath) return res.status(404).json({ error: 'Video not found' })

    if (!SAFE.test(String(suggestProvider || '')) || !clipSuggest.REGISTRY[suggestProvider]) {
      return res.status(400).json({ error: `Unknown suggest provider "${suggestProvider}"` })
    }
    if (!SAFE.test(String(transcriptProvider || ''))) {
      return res.status(400).json({ error: 'Invalid transcript provider' })
    }
    if (!clipSuggest.availableProviders().includes(suggestProvider)) {
      const key = suggestProvider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'
      return res.status(400).json({ error: `${key} not set on the server` })
    }

    const txFile = path.join(dir, `transcription_${transcriptProvider}.json`)
    if (!fs.existsSync(txFile)) {
      return res.status(400).json({ error: 'Run transcription first for the selected provider' })
    }
    const tx = JSON.parse(fs.readFileSync(txFile, 'utf8'))

    const videoDuration = await getVideoDuration(originalPath)
    const b = resolveBucket(bucket)
    if (!videoDuration || videoDuration < b.min) {
      return res.status(400).json({ error: 'Video is too short for clip suggestions' })
    }

    const wantCount = Math.max(3, Math.min(5, parseInt(count, 10) || 3))
    let size = { width: 0, height: 0 }
    try { size = await getVideoSize(originalPath) } catch (_) {}

    let filename
    try { filename = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).filename } catch (_) {}

    const language = tx?.metadata?.detected_language
    // One debug log per provider, overwritten each run — prompts + raw response.
    const debugPath = path.join(dir, `clip_debug_${suggestProvider}.log`)
    const result = await clipSuggest.REGISTRY[suggestProvider].suggest({
      segments: tx.segments,
      bucket,
      count: wantCount,
      videoDuration,
      language,
      filename,
      debugPath,
    })

    const { clips, warnings } = normalizeClips(result.clips, {
      videoDuration,
      count: wantCount,
      segments: tx.segments,
      provider: suggestProvider,
    })

    const obj = {
      metadata: {
        suggestProvider,
        model: result.model,
        transcriptProvider,
        bucket,
        bucketSeconds: { min: b.min, max: b.max },
        requestedCount: wantCount,
        video_duration_s: +videoDuration.toFixed(2),
        video_width: size.width,
        video_height: size.height,
        language: language || null,
        transcript_truncated: !!result.truncated,
        timestamp: new Date().toISOString(),
        warnings,
      },
      clips,
    }

    cleanStaleSuggestionFiles(dir, suggestProvider)
    fs.writeFileSync(clipsFile(dir, suggestProvider), JSON.stringify(obj, null, 2), 'utf8')
    res.json(obj)
  } catch (err) {
    console.error(`[${id}] clip suggest error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/clips/:id/saved  → the persistent saved-clips library for this video
// (declared before /:id/:suggestProvider so "saved" isn't matched as a provider)
router.get('/:id/saved', (req, res) => {
  const file = savedFile(videoDirOf(req, req.params.id))
  res.json(loadJson(file, { clips: [] }))
})

// POST /api/clips/:id/saved  { clip, transcriptProvider, bucket }
// Bookmarks a clip definition (no cut) so it survives later suggest runs.
router.post('/:id/saved', (req, res) => {
  const { id } = req.params
  const { clip, transcriptProvider, bucket } = req.body || {}
  try {
    const dir = videoDirOf(req, id)
    if (!findOriginal(dir)) return res.status(404).json({ error: 'Video not found' })
    if (!clip || !Number.isFinite(Number(clip.start)) || !Number.isFinite(Number(clip.end)) || Number(clip.end) <= Number(clip.start)) {
      return res.status(400).json({ error: 'Invalid clip' })
    }

    const provider = clip.suggestProvider || 'clip'
    const start = Number(clip.start)
    const end = Number(clip.end)
    const savedId = computeSavedId(provider, start, end)

    const file = savedFile(dir)
    const data = loadJson(file, { clips: [] })
    if (!Array.isArray(data.clips)) data.clips = []

    const existing = data.clips.find(c => c.id === savedId)
    if (existing) return res.json({ saved: existing, clips: data.clips })

    const entry = {
      id: savedId,
      sourceClipId: clip.id || null,
      suggestProvider: provider,
      transcriptProvider: transcriptProvider || null,
      bucket: bucket || null,
      start,
      end,
      duration: +(end - start).toFixed(2),
      title: String(clip.title || '').trim(),
      hook: String(clip.hook || '').trim(),
      rationale: String(clip.rationale || '').trim(),
      transcript_excerpt: String(clip.transcript_excerpt || '').trim(),
      score: clip.score ?? null,
      savedAt: new Date().toISOString(),
      exported: false,
      clipUrl: null,
    }
    data.clips.push(entry)
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
    res.json({ saved: entry, clips: data.clips })
  } catch (err) {
    console.error(`[${id}] save clip error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/clips/:id/saved/:savedId  → drop from library + remove any cut file
router.delete('/:id/saved/:savedId', (req, res) => {
  const { id, savedId } = req.params
  if (!SAFE.test(savedId)) return res.status(400).json({ error: 'Invalid saved id' })
  try {
    const dir = videoDirOf(req, id)
    const file = savedFile(dir)
    const data = loadJson(file, { clips: [] })
    data.clips = (data.clips || []).filter(c => c.id !== savedId)
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')

    const cut = path.join(dir, 'clips', `${savedId}.mp4`)
    if (fs.existsSync(cut)) { try { fs.unlinkSync(cut) } catch (_) {} }

    res.json({ clips: data.clips })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/clips/:id/:suggestProvider  → saved suggestions for that provider
router.get('/:id/:suggestProvider', (req, res) => {
  const { id, suggestProvider } = req.params
  if (!SAFE.test(suggestProvider)) return res.status(400).json({ error: 'Invalid provider' })
  const file = clipsFile(videoDirOf(req, id), suggestProvider)
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'No clips generated yet' })
  try {
    res.json(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/clips/:id/export/stream?suggestProvider=&clipId=  → SSE ffmpeg cut
router.get('/:id/export/stream', async (req, res) => {
  const { id } = req.params
  const { suggestProvider, clipId, source } = req.query
  const isSaved = source === 'saved'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    if (!SAFE.test(String(clipId || '')) || (!isSaved && !SAFE.test(String(suggestProvider || '')))) {
      sendEvent({ type: 'error', message: 'Invalid provider or clip id' })
      return res.end()
    }

    const dir = videoDirOf(req, id)
    const originalPath = findOriginal(dir)
    if (!originalPath) {
      sendEvent({ type: 'error', message: 'Video not found' })
      return res.end()
    }

    const file = isSaved ? savedFile(dir) : clipsFile(dir, suggestProvider)
    if (!fs.existsSync(file)) {
      sendEvent({ type: 'error', message: isSaved ? 'No saved clips' : 'No clips for this provider' })
      return res.end()
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const clip = (data.clips || []).find(c => c.id === clipId)
    if (!clip) {
      sendEvent({ type: 'error', message: 'Clip not found' })
      return res.end()
    }

    const clipsDir = path.join(dir, 'clips')
    fs.mkdirSync(clipsDir, { recursive: true })
    const outPath = path.join(clipsDir, `${clipId}.mp4`)
    const clipUrl = `/api/video/${id}/clip/${clipId}`

    // Idempotent: already cut → return immediately.
    if (fs.existsSync(outPath)) {
      sendEvent({ type: 'done', clipUrl })
      return res.end()
    }

    sendEvent({ type: 'start' })

    // Re-clamp against the live duration in case the stored range is stale.
    const videoDuration = await getVideoDuration(originalPath)
    const start = Math.max(0, Math.min(clip.start, videoDuration - 0.1))
    const end = Math.min(clip.end, videoDuration)
    const duration = Math.max(0.1, end - start)

    await cutClip(originalPath, outPath, start, duration, (percent) => {
      sendEvent({ type: 'progress', percent })
    })

    // Persist export state back into the suggestions file.
    clip.exported = true
    clip.clipUrl = clipUrl
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')

    sendEvent({ type: 'done', clipUrl })
    res.end()
  } catch (err) {
    console.error(`[${id}] clip export error:`, err.message)
    try {
      sendEvent({ type: 'error', message: err.message })
      res.end()
    } catch (_) {}
  }
})

// GET /api/clips/:id/suggest/stream?method=video&count=&bucket=&res=
// Video-understanding method (SSE): upload the raw video to Gemini → analyze →
// extract thumbnail frames. Long-running, so it streams phase events and holds
// an in-flight lock per video.
router.get('/:id/suggest/stream', async (req, res) => {
  const { id } = req.params
  const { method, bucket = 'auto', count, res: resParam } = req.query

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  if (method !== 'video') {
    sendEvent({ type: 'error', message: 'Unsupported method for streaming suggest' })
    return res.end()
  }
  if (runningVideo.has(id)) {
    sendEvent({ type: 'error', message: 'A video analysis is already running for this video. Wait for it to finish or refresh the page.' })
    return res.end()
  }

  runningVideo.add(id)
  try {
    const dir = videoDirOf(req, id)
    const originalPath = findOriginal(dir)
    if (!originalPath) { sendEvent({ type: 'error', message: 'Video not found' }); return res.end() }
    if (!clipSuggest.videoMethodAvailable()) {
      sendEvent({ type: 'error', message: 'GEMINI_API_KEY not set on the server' }); return res.end()
    }

    const wantCount = Math.max(3, Math.min(5, parseInt(count, 10) || 3))
    const b = resolveBucket(bucket)
    const videoDuration = await getVideoDuration(originalPath)
    if (!videoDuration || videoDuration < b.min) {
      sendEvent({ type: 'error', message: 'Video is too short for clip suggestions' }); return res.end()
    }
    let size = { width: 0, height: 0 }
    try { size = await getVideoSize(originalPath) } catch (_) {}

    const warnings = []
    let mediaResolution = 'low'
    // let mediaResolution = resParam === 'low' ? 'low' : 'default'
    // if (videoDuration > DEFAULT_RES_MAX_S && mediaResolution !== 'low') {
    //   mediaResolution = 'low'
    //   warnings.push(`Video over ${Math.round(DEFAULT_RES_MAX_S / 60)} min — using low media resolution.`)
    // }

    let filename
    try { filename = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).filename } catch (_) {}

    console.log(`[${id}] video suggest start: count=${wantCount} bucket=${bucket} res=${mediaResolution} dur=${videoDuration.toFixed(1)}s`)
    sendEvent({ type: 'start' })

    const debugPath = path.join(dir, `clip_debug_${VIDEO_PROVIDER}.log`)
    const result = await clipSuggest.geminiVideo.suggestFromVideo({
      videoPath: originalPath, dir, count: wantCount, bucket, videoDuration,
      filename, language: null, debugPath, mediaResolution,
      onPhase: (phase, data) => sendEvent({ type: 'phase', phase, ...(data || {}) }),
    })

    const { clips, warnings: normWarnings } = normalizeClips(result.clips, {
      videoDuration, count: wantCount, segments: [], provider: VIDEO_PROVIDER,
    })
    warnings.push(...normWarnings)

    // Extract the suggested thumbnail frames; a failed extract just drops that
    // one thumb (the clip stays valid).
    sendEvent({ type: 'phase', phase: 'extracting' })
    cleanStaleSuggestionFiles(dir, VIDEO_PROVIDER)
    const thumbsDir = path.join(dir, 'clips', 'thumbs')
    fs.mkdirSync(thumbsDir, { recursive: true })
    for (const clip of clips) {
      if (!Array.isArray(clip.thumbnails)) continue
      const kept = []
      for (let n = 0; n < clip.thumbnails.length; n++) {
        const t = clip.thumbnails[n].t
        try {
          await extractFrameAt(originalPath, t, path.join(thumbsDir, `${clip.id}-${n}.jpg`))
          kept.push({ t, url: `/api/clips/${id}/thumb/${clip.id}/${n}` })
        } catch (e) {
          console.error(`[${id}] thumb extract failed (${clip.id}#${n} @${t}s): ${e.message}`)
        }
      }
      clip.thumbnails = kept
    }

    const obj = {
      metadata: {
        method: 'video',
        suggestProvider: VIDEO_PROVIDER,
        model: result.model,
        bucket,
        bucketSeconds: { min: b.min, max: b.max },
        requestedCount: wantCount,
        video_duration_s: +videoDuration.toFixed(2),
        video_width: size.width,
        video_height: size.height,
        mediaResolution,
        language: null,
        timestamp: new Date().toISOString(),
        warnings,
      },
      clips,
    }
    fs.writeFileSync(clipsFile(dir, VIDEO_PROVIDER), JSON.stringify(obj, null, 2), 'utf8')
    console.log(`[${id}] video suggest done: ${clips.length} clips, ${warnings.length} warnings → clips_${VIDEO_PROVIDER}.json`)

    sendEvent({ type: 'done', data: obj })
    res.end()
  } catch (err) {
    console.error(`[${id}] video suggest error:`, err.message)
    try { sendEvent({ type: 'error', message: err.message }); res.end() } catch (_) {}
  } finally {
    runningVideo.delete(id)
  }
})

// GET /api/clips/:id/thumb/:clipId/:n  → a clip's extracted thumbnail frame
router.get('/:id/thumb/:clipId/:n', (req, res) => {
  const { id, clipId, n } = req.params
  if (!SAFE.test(clipId)) return res.status(400).json({ error: 'Invalid clip id' })
  const idx = parseInt(n, 10)
  if (!Number.isInteger(idx) || idx < 0 || idx > 9) return res.status(400).json({ error: 'Invalid index' })
  const file = path.join(videoDirOf(req, id), 'clips', 'thumbs', `${clipId}-${idx}.jpg`)
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Thumbnail not found' })
  res.sendFile(file)
})

module.exports = router
