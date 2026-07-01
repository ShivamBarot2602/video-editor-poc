const path = require('path')
const store = require('../storage/videoStore')
const { withTempDir } = require('../lib/tempWork')
const { extractCandidateFrames, getVideoSize } = require('../lib/frameExtraction')
const { scoreFrames, dedupByHash } = require('../lib/frameScoring')
const rerankProviders = require('../providers/thumbnailRerank')
const polishProviders = require('../providers/thumbnailPolish')
const {
  MAX_EXTRACT, POST_DEDUP_KEEP, TOP_PICK_COUNT,
  TRANSCRIPT_PROVIDER_PRIORITY, TRANSCRIPT_HINT_MAX_CHARS,
} = require('../config/constants')

async function getState(videoId) {
  return store.readThumbnailState(videoId)
}

async function originalExists(videoId) {
  return store.originalExists(videoId)
}

// Resolve a thumbnail-subtree file to a public URL. Throws Error with .status
// (400 / 403 / 404).
async function resolveFileUrl(videoId, rawRelpath) {
  const rel = store.resolveThumbnailRelpath(videoId, rawRelpath) // throws 400 / 403
  if (!(await store.thumbnailFileExists(videoId, rel))) {
    const err = new Error('File not found'); err.status = 404; throw err
  }
  return store.publicUrlThumbnailFile(videoId, rel)
}

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
}

// Resolve a thumbnail-subtree file to its bytes for a forced download. Returns
// { buffer, filename, contentType }. Throws Error with .status (400 / 403 / 404).
async function resolveFileDownload(videoId, rawRelpath) {
  const rel = store.resolveThumbnailRelpath(videoId, rawRelpath) // throws 400 / 403
  const buffer = await store.readThumbnailFileBuffer(videoId, rel)
  if (!buffer) {
    const err = new Error('File not found'); err.status = 404; throw err
  }
  const ext = path.extname(rel).toLowerCase()
  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream'
  // A recognizable, filesystem-safe name: thumbnail_<id8>_<basename>.
  const filename = `thumbnail_${videoId.slice(0, 8)}_${path.basename(rel)}`
  return { buffer, filename, contentType }
}

/**
 * The thumbnail generation pipeline. Runs inside an ephemeral temp dir: downloads
 * the original, extracts/scores/reranks/polishes locally, uploads frames +
 * polished images + state to S3. Emits SSE events via `emit` in the exact same
 * shape + order as before. Re-uses cached frames + scoring from S3 if present
 * (downloads them back into the temp dir); always re-runs polish.
 */
async function runPipeline({ videoId, reranker, runStart }, emit) {
  const tag = `[${videoId}][thumbnails]`
  emit({ type: 'start' })

  await withTempDir(`thumbs-${videoId}`, async (dir) => {
    const framesDir = path.join(dir, 'frames')
    console.log(`${tag} Pipeline start (workDir=${dir})`)

    const meta = await store.readMeta(videoId)
    const transcriptHint = await store.readTranscriptHint(videoId, TRANSCRIPT_PROVIDER_PRIORITY, TRANSCRIPT_HINT_MAX_CHARS)

    const baseUrl = `/api/thumbnails/${videoId}/file/`
    const fileUrl = (rel) => baseUrl + encodeURIComponent(rel)
    const frameRel = (absPath) => `${'frames'}/${path.basename(absPath)}`

    // The original video is only needed for frame extraction and to ffprobe its
    // dimensions — on a full cache hit neither is required, so it's downloaded
    // lazily (at most once) instead of unconditionally up front. For a large
    // video this is the difference between the cached path being instant vs.
    // paying a full download every time thumbnails are reopened.
    let origPath = null
    const ensureOriginal = async () => {
      if (!origPath) {
        console.time(`${tag} download total`)
        origPath = await store.downloadOriginal(videoId, dir)
        console.timeEnd(`${tag} download total`)
      }
      return origPath
    }

    // ─── Stage 1: extract (cached) ───────────────────────────────────────────
    let frames
    let videoSize = null
    if (await store.framesExist(videoId) && await store.frameStatsExist(videoId)) {
      const stored = await store.readFrameStats(videoId) // null on parse failure
      if (stored) {
        emit({ type: 'phase', phase: 'extracting', cached: true })
        // Hydrate the cached frame files back into the temp dir and rebase paths.
        await store.downloadFrames(videoId, framesDir)
        frames = stored.map(f => ({ ...f, path: path.join(framesDir, path.basename(f.path)) }))
        console.log(`${tag} Cache hit: ${frames.length} frames + scores reused`)

        // Reuse dimensions a prior successful run already probed + persisted —
        // they can't have changed (videos are immutable once uploaded), so this
        // is the only thing that lets a full cache hit skip downloadOriginal entirely.
        const prevState = await store.readThumbnailState(videoId)
        if (prevState?.video?.width > 0) {
          videoSize = prevState.video
          console.log(`${tag} Reusing cached video size ${videoSize.width}x${videoSize.height} (no original download needed)`)
        }
      } else {
        console.warn(`${tag} Cache parse failed; regenerating`)
      }
    }

    if (!videoSize) {
      const p = await ensureOriginal()
      try {
        videoSize = await getVideoSize(p)
        console.log(`${tag} videoSize=${videoSize.width}x${videoSize.height} aspect=${videoSize.aspect} ratio=${videoSize.ratio.toFixed(3)}`)
      } catch (e) {
        console.warn(`${tag} ffprobe size failed: ${e.message} — defaulting to landscape`)
        videoSize = { width: 0, height: 0, aspect: 'landscape', ratio: 16 / 9 }
      }
    }

    // findOriginalName is an S3 key listing (no download) — cheap fallback when
    // meta.filename is missing, matches what path.basename(origPath) would give.
    const filename = meta.filename || await store.findOriginalName(videoId) || 'video'
    console.log(`${tag} filename="${filename}" transcriptHint=${transcriptHint ? `"${transcriptHint.slice(0, 60)}…"` : 'none'}`)

    if (!frames) {
      emit({ type: 'phase', phase: 'extracting' })
      console.log(`${tag} Extracting frames…`)
      const t0 = Date.now()
      const p = await ensureOriginal()
      const raw = await extractCandidateFrames(p, framesDir, { maxFrames: MAX_EXTRACT })
      console.log(`${tag} Extracted ${raw.length} frames in ${Date.now() - t0}ms`)

      emit({ type: 'phase', phase: 'scoring', count: raw.length })
      console.log(`${tag} Scoring ${raw.length} frames…`)
      const t1 = Date.now()
      const scored = await scoreFrames(raw)
      console.log(`${tag} Scored ${scored.length} frames in ${Date.now() - t1}ms`)

      frames = scored
      // Persist scores with relative (basename) paths, then upload the frame files.
      await store.writeFrameStats(videoId, scored.map(f => ({ ...f, path: path.basename(f.path) })))
      await store.uploadFrames(videoId, framesDir)
      console.log(`${tag} frame_stats.json + frames uploaded`)
    }

    emit({ type: 'phase', phase: 'dedup' })
    const sorted = [...frames].sort((a, b) => b.cvScore - a.cvScore)
    const deduped = dedupByHash(sorted, 8).slice(0, POST_DEDUP_KEEP)
    console.log(`${tag} Dedup: ${frames.length} → ${deduped.length} (top-K for rerank)`)

    // ─── Stage 2: VLM rerank (optional) ──────────────────────────────────────
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

    // ─── Stage 3: polish (image-gen, providers run in parallel) ──────────────
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
        originalUrl: fileUrl(frameRel(p.path)),
        cvScore: p.cvScore,
        vlmScore: p.vlmScore,
        rationale: p.rationale,
        recommended: true,
      })),
    })

    emit({ type: 'phase', phase: 'polishing', providers: availablePolish, picks: topPicks.length })
    console.log(`${tag} Polish: ${availablePolish.length} provider(s) × ${topPicks.length} pick(s) = ${availablePolish.length * topPicks.length} job(s) — providers=[${availablePolish.join(', ')}]`)

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
            const rel = await store.writePolishedImage(videoId, pick.idx, providerId, ext, buffer)
            polishedByIdx.get(pick.idx)[providerId] = {
              path: rel,
              status: 'ok',
              model: provider.MODEL,
            }
            console.log(`${jobTag} ok in ${Date.now() - t}ms → ${rel} (${buffer.length} bytes)`)
            emit({ type: 'polished', idx: pick.idx, provider: providerId, url: fileUrl(rel), model: provider.MODEL })
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

    // ─── Stage 4: persist state ──────────────────────────────────────────────
    const candidates = topPicks.map(p => {
      const polishedMap = polishedByIdx.get(p.idx) || {}
      const polished = {}
      for (const [provId, info] of Object.entries(polishedMap)) {
        polished[provId] = info.status === 'ok'
          ? { ...info, url: fileUrl(info.path) }
          : info
      }
      const origRel = frameRel(p.path)
      return {
        idx: p.idx,
        t: p.t,
        originalPath: origRel,
        originalUrl: fileUrl(origRel),
        cvScore: p.cvScore,
        vlmScore: p.vlmScore,
        rationale: p.rationale,
        recommended: true,
        polished,
      }
    })

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
    }
    await store.writeThumbnailState(videoId, state)
    console.log(`${tag} thumbnails.json saved (candidates=${candidates.length})`)
    console.log(`${tag} Pipeline done in ${Date.now() - runStart}ms`)

    emit({ type: 'done', state })
  })
}

module.exports = { getState, originalExists, resolveFileUrl, resolveFileDownload, runPipeline }
