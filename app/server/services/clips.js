const store = require('../storage/videoStore')
const clipSuggest = require('../providers/clipSuggest')
const { resolveBucket } = require('../lib/clipPrompt')
const { getVideoDuration, getVideoSize } = require('../lib/frameExtraction')
const { cutClip, extractFrameAt } = require('../lib/ffmpeg')
const { VIDEO_PROVIDER, SAFE_TOKEN, CLIP_COUNT_MIN, CLIP_COUNT_MAX } = require('../config/constants')

// Expected-failure helper: carries an HTTP status the controller maps directly.
function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function clampCount(count) {
  return Math.max(CLIP_COUNT_MIN, Math.min(CLIP_COUNT_MAX, parseInt(count, 10) || CLIP_COUNT_MIN))
}

// Stable id for a saved clip — encodes provider + range so the same clip saved
// twice dedupes, and the on-demand cut file never collides with a volatile
// suggestion file.
function computeSavedId(provider, start, end) {
  return `saved-${provider}-${Math.round(start * 1000)}-${Math.round(end * 1000)}`
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

// POST /api/clips/:id/suggest — transcript-based suggestion. Returns the saved
// object; throws httpError(4xx) for expected validation failures.
async function suggest({ id, suggestProvider, transcriptProvider, bucket, count }) {
  const originalPath = store.findOriginalPath(id)
  if (!originalPath) throw httpError(404, 'Video not found')

  if (!SAFE_TOKEN.test(String(suggestProvider || '')) || !clipSuggest.REGISTRY[suggestProvider]) {
    throw httpError(400, `Unknown suggest provider "${suggestProvider}"`)
  }
  if (!SAFE_TOKEN.test(String(transcriptProvider || ''))) {
    throw httpError(400, 'Invalid transcript provider')
  }
  if (!clipSuggest.availableProviders().includes(suggestProvider)) {
    const key = suggestProvider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'
    throw httpError(400, `${key} not set on the server`)
  }

  if (!store.transcriptionExists(id, transcriptProvider)) {
    throw httpError(400, 'Run transcription first for the selected provider')
  }
  const tx = store.readTranscription(id, transcriptProvider)

  const videoDuration = await getVideoDuration(originalPath)
  const b = resolveBucket(bucket)
  if (!videoDuration || videoDuration < b.min) {
    throw httpError(400, 'Video is too short for clip suggestions')
  }

  const wantCount = clampCount(count)
  let size = { width: 0, height: 0 }
  try { size = await getVideoSize(originalPath) } catch (_) {}

  const filename = store.readMeta(id).filename
  const language = tx?.metadata?.detected_language
  // One debug log per provider, overwritten each run — prompts + raw response.
  const debugPath = store.clipDebugPath(id, suggestProvider)
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

  store.cleanStaleSuggestionFiles(id, suggestProvider)
  store.writeClipSuggestions(id, suggestProvider, obj)
  return obj
}

function listSaved(id) {
  return store.readSavedClips(id)
}

// Bookmark a clip definition (no cut). Throws httpError(4xx) on bad input.
function saveClip({ id, clip, transcriptProvider, bucket }) {
  if (!store.findOriginalPath(id)) throw httpError(404, 'Video not found')
  if (!clip || !Number.isFinite(Number(clip.start)) || !Number.isFinite(Number(clip.end)) || Number(clip.end) <= Number(clip.start)) {
    throw httpError(400, 'Invalid clip')
  }

  const provider = clip.suggestProvider || 'clip'
  const start = Number(clip.start)
  const end = Number(clip.end)
  const savedId = computeSavedId(provider, start, end)

  const data = store.readSavedClips(id)
  if (!Array.isArray(data.clips)) data.clips = []

  const existing = data.clips.find(c => c.id === savedId)
  if (existing) return { saved: existing, clips: data.clips }

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
  store.writeSavedClips(id, data)
  return { saved: entry, clips: data.clips }
}

function deleteSaved(id, savedId) {
  const data = store.readSavedClips(id)
  data.clips = (data.clips || []).filter(c => c.id !== savedId)
  store.writeSavedClips(id, data)
  store.deleteClipOutput(id, savedId)
  return { clips: data.clips }
}

function hasSuggestions(id, provider) {
  return store.clipsSuggestionsExist(id, provider)
}

function getSuggestions(id, provider) {
  return store.readClipSuggestions(id, provider)
}

// Absolute path to a clip's thumbnail frame, or null if absent.
function thumbPath(id, clipId, idx) {
  return store.clipThumbExists(id, clipId, idx) ? store.clipThumbPath(id, clipId, idx) : null
}

// GET /api/clips/:id/export/stream — cut a clip via ffmpeg, emitting SSE events.
// Emits its own validation errors (stream is already open); throws only on
// unexpected failure (controller emits a final error event).
async function exportClip({ id, clipId, suggestProvider, source }, emit) {
  const isSaved = source === 'saved'
  if (!SAFE_TOKEN.test(String(clipId || '')) || (!isSaved && !SAFE_TOKEN.test(String(suggestProvider || '')))) {
    return emit({ type: 'error', message: 'Invalid provider or clip id' })
  }

  const originalPath = store.findOriginalPath(id)
  if (!originalPath) return emit({ type: 'error', message: 'Video not found' })

  const fileExists = isSaved ? store.savedClipsExist(id) : store.clipsSuggestionsExist(id, suggestProvider)
  if (!fileExists) {
    return emit({ type: 'error', message: isSaved ? 'No saved clips' : 'No clips for this provider' })
  }
  const data = isSaved ? store.readSavedClipsStrict(id) : store.readClipSuggestions(id, suggestProvider)
  const clip = (data.clips || []).find(c => c.id === clipId)
  if (!clip) return emit({ type: 'error', message: 'Clip not found' })

  store.ensureClipsDir(id)
  const outPath = store.clipOutputPath(id, clipId)
  const clipUrl = `/api/video/${id}/clip/${clipId}`

  // Idempotent: already cut → return immediately.
  if (store.clipOutputExists(id, clipId)) {
    return emit({ type: 'done', clipUrl })
  }

  emit({ type: 'start' })

  // Re-clamp against the live duration in case the stored range is stale.
  const videoDuration = await getVideoDuration(originalPath)
  const start = Math.max(0, Math.min(clip.start, videoDuration - 0.1))
  const end = Math.min(clip.end, videoDuration)
  const duration = Math.max(0.1, end - start)

  await cutClip(originalPath, outPath, start, duration, (percent) => {
    emit({ type: 'progress', percent })
  })

  // Persist export state back into the source file.
  clip.exported = true
  clip.clipUrl = clipUrl
  if (isSaved) store.writeSavedClips(id, data)
  else store.writeClipSuggestions(id, suggestProvider, data)

  emit({ type: 'done', clipUrl })
}

// GET /api/clips/:id/suggest/stream (method=video) — Gemini video understanding.
// Emits its own validation errors; throws only on unexpected failure.
async function suggestFromVideo({ id, bucket, count }, emit) {
  const originalPath = store.findOriginalPath(id)
  if (!originalPath) return emit({ type: 'error', message: 'Video not found' })
  if (!clipSuggest.videoMethodAvailable()) {
    return emit({ type: 'error', message: 'GEMINI_API_KEY not set on the server' })
  }

  const wantCount = clampCount(count)
  const b = resolveBucket(bucket)
  const videoDuration = await getVideoDuration(originalPath)
  if (!videoDuration || videoDuration < b.min) {
    return emit({ type: 'error', message: 'Video is too short for clip suggestions' })
  }
  let size = { width: 0, height: 0 }
  try { size = await getVideoSize(originalPath) } catch (_) {}

  const warnings = []
  const mediaResolution = 'low'

  const filename = store.readMeta(id).filename

  console.log(`[${id}] video suggest start: count=${wantCount} bucket=${bucket} res=${mediaResolution} dur=${videoDuration.toFixed(1)}s`)
  emit({ type: 'start' })

  const debugPath = store.clipDebugPath(id, VIDEO_PROVIDER)
  const result = await clipSuggest.geminiVideo.suggestFromVideo({
    videoPath: originalPath, dir: store.videoDir(id), count: wantCount, bucket, videoDuration,
    filename, language: null, debugPath, mediaResolution,
    onPhase: (phase, data) => emit({ type: 'phase', phase, ...(data || {}) }),
  })

  const { clips, warnings: normWarnings } = normalizeClips(result.clips, {
    videoDuration, count: wantCount, segments: [], provider: VIDEO_PROVIDER,
  })
  warnings.push(...normWarnings)

  // Extract the suggested thumbnail frames; a failed extract just drops that
  // one thumb (the clip stays valid).
  emit({ type: 'phase', phase: 'extracting' })
  store.cleanStaleSuggestionFiles(id, VIDEO_PROVIDER)
  store.ensureClipThumbsDir(id)
  for (const clip of clips) {
    if (!Array.isArray(clip.thumbnails)) continue
    const kept = []
    for (let n = 0; n < clip.thumbnails.length; n++) {
      const t = clip.thumbnails[n].t
      try {
        await extractFrameAt(originalPath, t, store.clipThumbPath(id, clip.id, n))
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
  store.writeClipSuggestions(id, VIDEO_PROVIDER, obj)
  console.log(`[${id}] video suggest done: ${clips.length} clips, ${warnings.length} warnings → clips_${VIDEO_PROVIDER}.json`)

  emit({ type: 'done', data: obj })
}

module.exports = {
  suggest,
  listSaved,
  saveClip,
  deleteSaved,
  hasSuggestions,
  getSuggestions,
  thumbPath,
  exportClip,
  suggestFromVideo,
}
