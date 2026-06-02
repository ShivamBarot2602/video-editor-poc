const express = require('express')
const path = require('path')
const fs = require('fs')

const { extractCandidateFrames, getVideoSize } = require('../lib/frameExtraction')
const { scoreFrames, dedupByHash } = require('../lib/frameScoring')
const rerankProviders = require('../providers/thumbnailRerank')
const polishProviders = require('../providers/thumbnailPolish')

const router = express.Router()

// ─── pipeline constants ──────────────────────────────────────────────────────
const MAX_EXTRACT = 60
const POST_DEDUP_KEEP = 12   // top-K to send to VLM rerank
const TOP_PICK_COUNT = 3
const TRANSCRIPT_PROVIDER_PRIORITY = ['assemblyai', 'deepgram', 'openai']

// In-flight pipeline runs keyed by videoId. EventSource auto-reconnects ~3s
// after a stream close — without this guard, a transient disconnect would
// silently fire another full Gemini + image-gen run (~$0.25/run wasted).
const inFlightRuns = new Set()

// ─── helpers ─────────────────────────────────────────────────────────────────

function videoDir(req) {
  return path.join(req.videosDir, req.params.videoId)
}
function originalPath(dir) {
  if (!fs.existsSync(dir)) return null
  const file = fs.readdirSync(dir).find(f => f.startsWith('original.'))
  return file ? path.join(dir, file) : null
}
function loadMeta(dir) {
  const metaPath = path.join(dir, 'meta.json')
  if (!fs.existsSync(metaPath)) return {}
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch (_) { return {} }
}
function loadTranscriptHint(dir) {
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('transcription_') && f.endsWith('.json'))
    .map(f => ({ provider: f.slice('transcription_'.length, -'.json'.length), file: f }))
  if (files.length === 0) return null

  // Honor priority order; fall back to any.
  let chosen = null
  for (const pref of TRANSCRIPT_PROVIDER_PRIORITY) {
    chosen = files.find(f => f.provider === pref)
    if (chosen) break
  }
  if (!chosen) chosen = files[0]

  try {
    const tx = JSON.parse(fs.readFileSync(path.join(dir, chosen.file), 'utf8'))
    const text = (tx.full_transcript || '').toString().trim()
    return text.slice(0, 220) || null
  } catch (_) { return null }
}
function loadState(dir) {
  const p = path.join(dir, 'thumbnails.json')
  if (!fs.existsSync(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (_) { return null }
}
function saveState(dir, state) {
  const p = path.join(dir, 'thumbnails.json')
  fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf8')
}

function relUrl(videoId, p, baseDir) {
  // Convert absolute path under baseDir → URL fragment served via this router.
  const rel = path.relative(baseDir, p).split(path.sep).join('/')
  return `/api/thumbnails/${videoId}/file/${encodeURIComponent(rel)}`
}

// ─── routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/thumbnails/:videoId
 * Returns the stored thumbnails.json, or 404 if not yet generated.
 */
router.get('/:videoId', (req, res) => {
  const dir = videoDir(req)
  const state = loadState(dir)
  if (!state) return res.status(404).json({ error: 'No thumbnails generated yet' })
  res.json(state)
})

/**
 * PATCH /api/thumbnails/:videoId
 * Body: { selectedKey: "12_original" | "12_gemini" | "12_openai" | null }
 */
router.patch('/:videoId', (req, res) => {
  const { videoId } = req.params
  const dir = videoDir(req)
  const state = loadState(dir)
  if (!state) return res.status(404).json({ error: 'No thumbnails generated yet' })

  const { selectedKey } = req.body || {}
  if (selectedKey !== null && typeof selectedKey !== 'string') {
    return res.status(400).json({ error: 'selectedKey must be string or null' })
  }
  const prev = state.selectedKey
  state.selectedKey = selectedKey || null
  saveState(dir, state)
  console.log(`[${videoId}][thumbnails] selectedKey: ${prev ?? 'null'} → ${state.selectedKey ?? 'null'}`)
  res.json(state)
})

/**
 * GET /api/thumbnails/:videoId/file/:relpath
 * Streams any file under the video dir under the thumbnail subpaths.
 * Hardened against path traversal.
 */
router.get('/:videoId/file/:relpath', (req, res) => {
  const dir = videoDir(req)
  const rel = decodeURIComponent(req.params.relpath)
  const target = path.normalize(path.join(dir, rel))
  if (!target.startsWith(dir + path.sep) && target !== dir) {
    return res.status(400).json({ error: 'Invalid path' })
  }
  // Only allow files inside our own subtrees.
  const ok = rel.startsWith('frames/') || rel.startsWith('thumbnails/')
  if (!ok) return res.status(403).json({ error: 'Forbidden' })

  if (!fs.existsSync(target)) return res.status(404).json({ error: 'File not found' })
  res.sendFile(target)
})

/**
 * GET /api/thumbnails/:videoId/stream
 * SSE pipeline. Uses EventSource on the client side — fetch+ReadableStream
 * was buffered end-to-end by the dev proxy / browser, batching all events
 * into one delivery. EventSource is purpose-built and doesn't suffer this.
 *
 * Re-uses cached frames + scoring if `frames/` + `frame_stats.json` already
 * exist; always re-runs the polish stage.
 */
router.get('/:videoId/stream', async (req, res) => {
  const { videoId } = req.params
  const dir = videoDir(req)
  const origPath = originalPath(dir)
  if (!origPath) return res.status(404).json({ error: 'Original video missing' })

  const tag = `[${videoId}][thumbnails]`
  const runStart = Date.now()

  // Reject re-entry while a pipeline is already in-flight for this video.
  // Without this, an EventSource transient drop + auto-reconnect would
  // re-fire the entire Gemini + image-gen run (~$0.25 wasted per reconnect).
  if (inFlightRuns.has(videoId)) {
    console.warn(`${tag} stream rejected: pipeline already in-flight for this videoId`)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Pipeline already running for this video. Wait for it to finish or refresh the page.' })}\n\n`)
    res.end()
    return
  }
  inFlightRuns.add(videoId)
  const releaseInFlight = () => inFlightRuns.delete(videoId)

  // ─── SSE setup ─────────────────────────────────────────────────────────────
  // Pipeline has multi-second gaps between events (ffmpeg extract, ~30s polish
  // calls). Default TCP Nagle + proxy buffering can delay or coalesce writes.
  // Counter-measures:
  //   1. `X-Accel-Buffering: no`  — disables buffering on nginx / Render / CDNs.
  //   2. `Cache-Control: no-transform` — discourages transforming proxies.
  //   3. `socket.setNoDelay(true)` — disables Nagle so each write flushes.
  //   4. Heartbeat comment every 10s during long stages — keeps connection
  //      alive past proxy idle timeouts and forces a periodic flush.
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  try { res.socket?.setNoDelay?.(true) } catch (_) { /* not all transports */ }

  // Browser fetch() ReadableStream buffers the first ~1-2KB before yielding
  // anything to reader.read(). With slow pipelines (long gaps between events)
  // the buffer never fills and the UI sees nothing live — events appear only
  // when the response ends. Pad the first send with a 2KB SSE comment so the
  // buffer overflows immediately and the stream becomes truly live.
  res.write(`: ${'_'.repeat(2048)}\n\n`)

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // SSE comment lines (start with ':') are ignored by the EventSource parser
  // but flush the connection and reset proxy idle timers.
  const heartbeat = setInterval(() => {
    try { res.write(`: hb ${Date.now()}\n\n`) } catch (_) { clearInterval(heartbeat) }
  }, 10000)
  const stopHeartbeat = () => clearInterval(heartbeat)
  // Release the in-flight slot on ANY disconnect path — including the case
  // where the client aborts mid-run. Without this the videoId stays locked
  // until server restart.
  const cleanup = () => {
    stopHeartbeat()
    releaseInFlight()
  }
  req.on('close', cleanup)
  res.on('close', cleanup)

  try {
    sendEvent({ type: 'start' })
    console.log(`${tag} Pipeline start (videoDir=${dir})`)

    const meta = loadMeta(dir)
    const filename = meta.filename || path.basename(origPath)
    const transcriptHint = loadTranscriptHint(dir)
    const framesDir = path.join(dir, 'frames')
    const statsFile = path.join(dir, 'frame_stats.json')

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

    // ─── Stage 1: extract (cached) ─────────────────────────────────────────
    let frames
    if (fs.existsSync(framesDir) && fs.existsSync(statsFile)) {
      sendEvent({ type: 'phase', phase: 'extracting', cached: true })
      try {
        frames = JSON.parse(fs.readFileSync(statsFile, 'utf8'))
        console.log(`${tag} Cache hit: ${frames.length} frames + scores reused`)
      } catch (e) {
        console.warn(`${tag} Cache parse failed (${e.message}); regenerating`)
        frames = null
      }
    }
    if (!frames) {
      sendEvent({ type: 'phase', phase: 'extracting' })
      console.log(`${tag} Extracting frames…`)
      const t0 = Date.now()
      const raw = await extractCandidateFrames(origPath, framesDir, { maxFrames: MAX_EXTRACT })
      console.log(`${tag} Extracted ${raw.length} frames in ${Date.now() - t0}ms`)

      sendEvent({ type: 'phase', phase: 'scoring', count: raw.length })
      console.log(`${tag} Scoring ${raw.length} frames…`)
      const t1 = Date.now()
      const scored = await scoreFrames(raw)
      console.log(`${tag} Scored ${scored.length} frames in ${Date.now() - t1}ms`)

      frames = scored
      fs.writeFileSync(statsFile, JSON.stringify(scored, null, 2), 'utf8')
      console.log(`${tag} frame_stats.json saved`)
    }

    sendEvent({ type: 'phase', phase: 'dedup' })
    // Sort by cvScore desc, dedup, keep top K for VLM.
    const sorted = [...frames].sort((a, b) => b.cvScore - a.cvScore)
    const deduped = dedupByHash(sorted, 8).slice(0, POST_DEDUP_KEEP)
    console.log(`${tag} Dedup: ${frames.length} → ${deduped.length} (top-K for rerank)`)

    // ─── Stage 2: VLM rerank (optional) ────────────────────────────────────
    // Reranker is selectable per run (?reranker=gemini|openai). Gemini is the
    // default. If the selected provider's call fails, fall back to the other
    // available reranker; if none succeed, fall back to CV order.
    let reranked
    let usedReranker = null
    const availRerank = rerankProviders.availableProviders()      // ordered: gemini, openai
    const requested = String(req.query.reranker || '').toLowerCase()
    const preferred = availRerank.includes(requested)
      ? requested
      : (availRerank.includes('gemini') ? 'gemini' : availRerank[0])
    const tryOrder = preferred ? [preferred, ...availRerank.filter(p => p !== preferred)] : []

    for (const provId of tryOrder) {
      const provider = rerankProviders[provId]
      const isFallback = provId !== preferred
      sendEvent({ type: 'phase', phase: 'reranking', count: deduped.length, provider: provId, model: provider.MODEL, fallback: isFallback })
      console.log(`${tag} Rerank: calling ${provId} (${provider.MODEL})${isFallback ? ' [fallback]' : ''} with ${deduped.length} frames…`)
      const t2 = Date.now()
      try {
        const rerankResults = await provider.rerank({ frames: deduped, filename, transcriptHint })
        console.log(`${tag} Rerank done via ${provId} in ${Date.now() - t2}ms (scores: ${rerankResults.map(r => r.vlmScore?.toFixed(1)).join(', ')})`)
        // Merge VLM score into frame records.
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
        sendEvent({ type: 'warn', stage: 'rerank', message: `${provId} rerank failed: ${e.message}` })
        // Loop continues to the next available provider (fallback).
      }
    }

    if (!usedReranker) {
      const reason = availRerank.length ? 'all rerankers failed' : 'no rerank API key set'
      console.log(`${tag} Rerank skipped: ${reason} — falling back to CV order`)
      sendEvent({ type: 'phase', phase: 'reranking', skipped: reason })
      reranked = deduped.map(f => ({ ...f, vlmScore: null, rationale: '' }))
    }

    const topPicks = reranked.slice(0, TOP_PICK_COUNT)
    console.log(`${tag} Top picks: ${topPicks.map(p => `idx=${p.idx} t=${p.t.toFixed(2)}s vlm=${p.vlmScore ?? '-'}`).join(' | ')}`)

    const baseUrl = `/api/thumbnails/${videoId}/file/`
    const relUrl = (absPath) => baseUrl + encodeURIComponent(path.relative(dir, absPath).split(path.sep).join('/'))

    // ─── Stage 3: polish (image-gen, providers run in parallel) ────────────
    const availablePolish = polishProviders.availableProviders()

    // Surface the picks (original frames + scores) NOW so the UI can render the
    // rows immediately, each polish cell in a loading state, before any image-gen
    // call returns. `providers` tells the client which cells to expect per pick.
    sendEvent({
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

    sendEvent({ type: 'phase', phase: 'polishing', providers: availablePolish, picks: topPicks.length })
    console.log(`${tag} Polish: ${availablePolish.length} provider(s) × ${topPicks.length} pick(s) = ${availablePolish.length * topPicks.length} job(s) — providers=[${availablePolish.join(', ')}]`)

    const polishedDir = path.join(dir, 'thumbnails', 'polished')
    fs.mkdirSync(polishedDir, { recursive: true })

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
            const outPath = path.join(polishedDir, `${pick.idx}_${providerId}.${ext}`)
            fs.writeFileSync(outPath, buffer)
            polishedByIdx.get(pick.idx)[providerId] = {
              path: path.relative(dir, outPath).split(path.sep).join('/'),
              status: 'ok',
              model: provider.MODEL,
            }
            console.log(`${jobTag} ok in ${Date.now() - t}ms → ${outPath} (${buffer.length} bytes)`)
            // Stream the finished cell immediately so the UI fills it live.
            sendEvent({ type: 'polished', idx: pick.idx, provider: providerId, url: relUrl(outPath), model: provider.MODEL })
          } catch (e) {
            polishedByIdx.get(pick.idx)[providerId] = {
              status: 'error',
              error: e.message,
            }
            console.error(`${jobTag} failed in ${Date.now() - t}ms: ${e.message}`)
            sendEvent({ type: 'polish_failed', idx: pick.idx, provider: providerId, message: e.message })
          }
        })())
      }
    }
    await Promise.allSettled(jobs)
    console.log(`${tag} Polish stage complete`)

    // ─── Stage 4: persist state ────────────────────────────────────────────
    const candidates = topPicks.map(p => {
      const polishedMap = polishedByIdx.get(p.idx) || {}
      // Convert any polished refs to URL-shape too.
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
    const prev = loadState(dir)
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
    saveState(dir, state)
    console.log(`${tag} thumbnails.json saved (selectedKey=${state.selectedKey ?? 'null'}, candidates=${candidates.length})`)
    console.log(`${tag} Pipeline done in ${Date.now() - runStart}ms`)

    sendEvent({ type: 'done', state })
    cleanup()
    res.end()
  } catch (err) {
    console.error(`${tag} Pipeline error after ${Date.now() - runStart}ms:`, err)
    try {
      sendEvent({ type: 'error', message: err.message })
    } catch (_) { /* connection already closed */ }
    cleanup()
    try { res.end() } catch (_) { /* already ended */ }
  }
})

module.exports = router
