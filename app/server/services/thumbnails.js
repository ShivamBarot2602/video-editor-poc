const path = require('path')
const store = require('../storage/videoStore')
const { extractCandidateFrames, getVideoSize } = require('../lib/frameExtraction')
const { scoreFrames, dedupByHash } = require('../lib/frameScoring')
const rerankProviders = require('../providers/thumbnailRerank')
const polishProviders = require('../providers/thumbnailPolish')
const {
  MAX_EXTRACT, POST_DEDUP_KEEP, TOP_PICK_COUNT,
  TRANSCRIPT_PROVIDER_PRIORITY, TRANSCRIPT_HINT_MAX_CHARS,
} = require('../config/constants')

function getState(videoId) {
  return store.readThumbnailState(videoId)
}

// Persist a new selectedKey onto an already-loaded state object.
function setSelectedKey(videoId, state, selectedKey) {
  state.selectedKey = selectedKey || null
  store.writeThumbnailState(videoId, state)
  return state
}

function originalPath(videoId) {
  return store.findOriginalPath(videoId)
}

// Resolve a file under the thumbnail subtrees. Throws Error with .status
// (400 / 403 / 404); returns the absolute path on success.
function resolveFile(videoId, rawRelpath) {
  const target = store.resolveThumbnailFile(videoId, rawRelpath) // throws 400 / 403
  if (!store.fileExists(target)) {
    const err = new Error('File not found'); err.status = 404; throw err
  }
  return target
}

/**
 * The thumbnail generation pipeline. Emits SSE events via `emit` in the exact
 * same shape + order as before:
 *   start → phase(extracting[/scoring/dedup/reranking/polishing]) → picks →
 *   polished* / polish_failed* / warn* → done
 * Re-uses cached frames + scoring if present; always re-runs polish. Throws on
 * unexpected failure (controller emits the final error event).
 */
async function runPipeline({ videoId, origPath, reranker, runStart }, emit) {
  const tag = `[${videoId}][thumbnails]`
  const dir = store.videoDir(videoId)

  emit({ type: 'start' })
  console.log(`${tag} Pipeline start (videoDir=${dir})`)

  const meta = store.readMeta(videoId)
  const filename = meta.filename || path.basename(origPath)
  const transcriptHint = store.readTranscriptHint(videoId, TRANSCRIPT_PROVIDER_PRIORITY, TRANSCRIPT_HINT_MAX_CHARS)
  const framesDir = store.framesDirPath(videoId)

  // Probe video dimensions once — drives polish output aspect + UI cell ratio.
  let videoSize = { width: 0, height: 0, aspect: 'unknown', ratio: 0 }
  try {
    videoSize = await getVideoSize(origPath)
    console.log(`${tag} videoSize=${videoSize.width}x${videoSize.height} aspect=${videoSize.aspect} ratio=${videoSize.ratio.toFixed(3)}`)
  } catch (e) {
    console.warn(`${tag} ffprobe size failed: ${e.message} — defaulting to landscape`)
    videoSize = { width: 0, height: 0, aspect: 'landscape', ratio: 16 / 9 }
  }

  console.log(`${tag} filename="${filename}" transcriptHint=${transcriptHint ? `"${transcriptHint.slice(0, 60)}…"` : 'none'}`)

  // ─── Stage 1: extract (cached) ─────────────────────────────────────────────
  let frames
  if (store.framesExist(videoId) && store.frameStatsExist(videoId)) {
    emit({ type: 'phase', phase: 'extracting', cached: true })
    frames = store.readFrameStats(videoId) // null on parse failure
    if (frames) {
      console.log(`${tag} Cache hit: ${frames.length} frames + scores reused`)
    } else {
      console.warn(`${tag} Cache parse failed; regenerating`)
    }
  }
  if (!frames) {
    emit({ type: 'phase', phase: 'extracting' })
    console.log(`${tag} Extracting frames…`)
    const t0 = Date.now()
    const raw = await extractCandidateFrames(origPath, framesDir, { maxFrames: MAX_EXTRACT })
    console.log(`${tag} Extracted ${raw.length} frames in ${Date.now() - t0}ms`)

    emit({ type: 'phase', phase: 'scoring', count: raw.length })
    console.log(`${tag} Scoring ${raw.length} frames…`)
    const t1 = Date.now()
    const scored = await scoreFrames(raw)
    console.log(`${tag} Scored ${scored.length} frames in ${Date.now() - t1}ms`)

    frames = scored
    store.writeFrameStats(videoId, scored)
    console.log(`${tag} frame_stats.json saved`)
  }

  emit({ type: 'phase', phase: 'dedup' })
  // Sort by cvScore desc, dedup, keep top K for VLM.
  const sorted = [...frames].sort((a, b) => b.cvScore - a.cvScore)
  const deduped = dedupByHash(sorted, 8).slice(0, POST_DEDUP_KEEP)
  console.log(`${tag} Dedup: ${frames.length} → ${deduped.length} (top-K for rerank)`)

  // ─── Stage 2: VLM rerank (optional) ────────────────────────────────────────
  let reranked
  let usedReranker = null
  const availRerank = rerankProviders.availableProviders()
  const requested = String(reranker || '').toLowerCase()
  const preferred = availRerank.includes(requested)
    ? requested
    : (availRerank.includes('gemini') ? 'gemini' : availRerank[0])
  const tryOrder = preferred ? [preferred, ...availRerank.filter(p => p !== preferred)] : []

  for (const provId of tryOrder) {
    const provider = rerankProviders[provId]
    const isFallback = provId !== preferred
    emit({ type: 'phase', phase: 'reranking', count: deduped.length, provider: provId, model: provider.MODEL, fallback: isFallback })
    console.log(`${tag} Rerank: calling ${provId} (${provider.MODEL})${isFallback ? ' [fallback]' : ''} with ${deduped.length} frames…`)
    const t2 = Date.now()
    try {
      const rerankResults = await provider.rerank({ frames: deduped, filename, transcriptHint })
      console.log(`${tag} Rerank done via ${provId} in ${Date.now() - t2}ms (scores: ${rerankResults.map(r => r.vlmScore?.toFixed(1)).join(', ')})`)
      const byIdx = new Map(rerankResults.map(r => [r.idx, r]))
      reranked = deduped.map(f => {
        const r = byIdx.get(f.idx) || {}
        return { ...f, vlmScore: r.vlmScore ?? null, rationale: r.rationale || '' }
      })
      reranked.sort((a, b) => (b.vlmScore ?? 0) - (a.vlmScore ?? 0))
      usedReranker = provId
      break
    } catch (e) {
      console.error(`${tag} Rerank failed via ${provId}: ${e.message}`)
      emit({ type: 'warn', stage: 'rerank', message: `${provId} rerank failed: ${e.message}` })
    }
  }

  if (!usedReranker) {
    const reason = availRerank.length ? 'all rerankers failed' : 'no rerank API key set'
    console.log(`${tag} Rerank skipped: ${reason} — falling back to CV order`)
    emit({ type: 'phase', phase: 'reranking', skipped: reason })
    reranked = deduped.map(f => ({ ...f, vlmScore: null, rationale: '' }))
  }

  const topPicks = reranked.slice(0, TOP_PICK_COUNT)
  console.log(`${tag} Top picks: ${topPicks.map(p => `idx=${p.idx} t=${p.t.toFixed(2)}s vlm=${p.vlmScore ?? '-'}`).join(' | ')}`)

  const baseUrl = `/api/thumbnails/${videoId}/file/`
  const relUrl = (absPath) => baseUrl + encodeURIComponent(path.relative(dir, absPath).split(path.sep).join('/'))

  // ─── Stage 3: polish (image-gen, providers run in parallel) ────────────────
  const availablePolish = polishProviders.availableProviders()

  emit({
    type: 'picks',
    providers: availablePolish,
    rerankProvider: usedReranker || null,
    rerankModel: usedReranker ? rerankProviders[usedReranker].MODEL : null,
    video: videoSize,
    picks: topPicks.map(p => ({
      idx: p.idx,
      t: p.t,
      originalUrl: relUrl(p.path),
      cvScore: p.cvScore,
      vlmScore: p.vlmScore,
      rationale: p.rationale,
      recommended: true,
    })),
  })

  emit({ type: 'phase', phase: 'polishing', providers: availablePolish, picks: topPicks.length })
  console.log(`${tag} Polish: ${availablePolish.length} provider(s) × ${topPicks.length} pick(s) = ${availablePolish.length * topPicks.length} job(s) — providers=[${availablePolish.join(', ')}]`)

  store.ensurePolishedDir(videoId)

  const polishedByIdx = new Map()
  const jobs = []
  for (const pick of topPicks) {
    polishedByIdx.set(pick.idx, {})
    for (const providerId of availablePolish) {
      const provider = polishProviders[providerId]
      const jobTag = `[${videoId}][polish:${providerId}][idx=${pick.idx}]`
      jobs.push((async () => {
        const t = Date.now()
        console.log(`${jobTag} start`)
        try {
          const { buffer, mime } = await provider.polish({
            framePath: pick.path,
            filename,
            transcriptHint,
            aspect: videoSize.aspect,
          })
          const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
          const outPath = store.writePolishedImage(videoId, pick.idx, providerId, ext, buffer)
          polishedByIdx.get(pick.idx)[providerId] = {
            path: path.relative(dir, outPath).split(path.sep).join('/'),
            status: 'ok',
            model: provider.MODEL,
          }
          console.log(`${jobTag} ok in ${Date.now() - t}ms → ${outPath} (${buffer.length} bytes)`)
          emit({ type: 'polished', idx: pick.idx, provider: providerId, url: relUrl(outPath), model: provider.MODEL })
        } catch (e) {
          polishedByIdx.get(pick.idx)[providerId] = {
            status: 'error',
            error: e.message,
          }
          console.error(`${jobTag} failed in ${Date.now() - t}ms: ${e.message}`)
          emit({ type: 'polish_failed', idx: pick.idx, provider: providerId, message: e.message })
        }
      })())
    }
  }
  await Promise.allSettled(jobs)
  console.log(`${tag} Polish stage complete`)

  // ─── Stage 4: persist state ────────────────────────────────────────────────
  const candidates = topPicks.map(p => {
    const polishedMap = polishedByIdx.get(p.idx) || {}
    const polished = {}
    for (const [provId, info] of Object.entries(polishedMap)) {
      polished[provId] = info.status === 'ok'
        ? { ...info, url: baseUrl + encodeURIComponent(info.path) }
        : info
    }
    return {
      idx: p.idx,
      t: p.t,
      originalPath: path.relative(dir, p.path).split(path.sep).join('/'),
      originalUrl: baseUrl + encodeURIComponent(path.relative(dir, p.path).split(path.sep).join('/')),
      cvScore: p.cvScore,
      vlmScore: p.vlmScore,
      rationale: p.rationale,
      recommended: true,
      polished,
    }
  })

  // Preserve previous selectedKey if it still references an extant frame.
  const prev = store.readThumbnailState(videoId)
  let selectedKey = null
  if (prev?.selectedKey) {
    const stillExists = candidates.some(c => {
      const idx = c.idx
      if (prev.selectedKey === `${idx}_original`) return true
      return Object.entries(c.polished || {}).some(([prov, info]) =>
        prev.selectedKey === `${idx}_${prov}` && info.status === 'ok'
      )
    })
    if (stillExists) selectedKey = prev.selectedKey
  }

  const state = {
    generatedAt: new Date().toISOString(),
    rerankProvider: usedReranker || null,
    rerankModel: usedReranker ? rerankProviders[usedReranker].MODEL : null,
    polishModels: availablePolish.map(id => polishProviders[id].MODEL),
    video: {
      width: videoSize.width,
      height: videoSize.height,
      aspect: videoSize.aspect,
      ratio: videoSize.ratio,
    },
    pipeline: {
      framesExtracted: frames.length,
      afterDedup: deduped.length,
      topPicks: topPicks.length,
    },
    candidates,
    selectedKey,
  }
  store.writeThumbnailState(videoId, state)
  console.log(`${tag} thumbnails.json saved (selectedKey=${state.selectedKey ?? 'null'}, candidates=${candidates.length})`)
  console.log(`${tag} Pipeline done in ${Date.now() - runStart}ms`)

  emit({ type: 'done', state })
}

module.exports = { getState, setSelectedKey, originalPath, resolveFile, runPipeline }
