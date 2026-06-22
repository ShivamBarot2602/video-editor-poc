const fs = require('fs')
const path = require('path')
const axios = require('axios')
const { buildVideoClipSystemPrompt, buildVideoClipUserPrompt } = require('../../lib/clipPrompt')
const { writeClipDebug } = require('../../lib/clipDebug')
const { uploadVideo, waitForActive } = require('../../lib/geminiFiles')

const MODEL = 'gemini-2.5-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

// Files API resources live ~48h. Reuse a cached upload only inside this window
// (and re-verify it's still ACTIVE before trusting it).
const CACHE_FILE = 'gemini_file.json'
const REUSE_MS = 46 * 60 * 60 * 1000

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { return null }
}

/**
 * Suggest engaging clips by having Gemini watch the actual video (audio + frames)
 * — no transcript. Uploads via the Files API (cached + reused for ~46h), then a
 * single generateContent call returns clips with hook / caption / reason / score
 * and 3 thumbnail timestamps each.
 *
 * @param {object} opts
 * @param {string} opts.videoPath
 * @param {string} opts.dir                       - video dir (for the upload cache)
 * @param {number} opts.count
 * @param {string} opts.bucket
 * @param {number} opts.videoDuration
 * @param {string} [opts.filename]
 * @param {string} [opts.language]
 * @param {string} [opts.debugPath]
 * @param {'default'|'low'} [opts.mediaResolution='default']
 * @param {(phase:string, data?:object)=>void} [opts.onPhase]
 * @param {number} [opts.timeoutMs=500000]
 * @returns {Promise<{ model:string, clips:Array, truncated:boolean }>}
 */
async function suggestFromVideo({
  videoPath, dir, count, bucket, videoDuration, filename, language,
  debugPath, mediaResolution = 'default', onPhase, timeoutMs = 500000,
}) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  // ── 1) Upload (or reuse a recent, still-ACTIVE upload) ──────────────────────
  const cachePath = path.join(dir, CACHE_FILE)
  const cached = loadJson(cachePath)
  let file = null
  if (cached?.name && cached?.uri && cached?.uploadedAt &&
      (Date.now() - new Date(cached.uploadedAt).getTime() < REUSE_MS)) {
    try {
      const active = await waitForActive({ name: cached.name, apiKey, timeoutMs: 15000, intervalMs: 1500 })
      file = { name: active.name, uri: active.uri, mime: active.mimeType || cached.mime, uploadedAt: cached.uploadedAt }
      console.log(`[clipSuggest:geminiVideo] reusing cached file ${file.name}`)
    } catch (_) {
      file = null // expired/deleted server-side → re-upload below
    }
  }

  if (!file) {
    onPhase?.('uploading', { percent: 0 })
    const up = await uploadVideo({
      filePath: videoPath, apiKey, displayName: filename,
      onProgress: (percent) => onPhase?.('uploading', { percent }),
      timeoutMs,
    })
    onPhase?.('processing')
    const active = await waitForActive({ name: up.name, apiKey })
    file = { name: active.name, uri: active.uri, mime: active.mimeType || up.mimeType, uploadedAt: new Date().toISOString() }
    try { fs.writeFileSync(cachePath, JSON.stringify(file, null, 2), 'utf8') } catch (_) {}
  }

  // ── 2) Analyze ──────────────────────────────────────────────────────────────
  onPhase?.('analyzing')

  // Whole prompt comes from the builders — no string assembly in the provider.
  const system = buildVideoClipSystemPrompt()
  const user = buildVideoClipUserPrompt({ bucket, count, videoDuration, language, filename })
  console.log(`[clipSuggest:geminiVideo] model=${MODEL} count=${count} bucket=${bucket} res=${mediaResolution} sysChars=${system.length}`)

  const generationConfig = { temperature: 0.3, responseMimeType: 'application/json' }
  if (mediaResolution === 'low') generationConfig.mediaResolution = 'MEDIA_RESOLUTION_LOW'

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{
      role: 'user',
      parts: [
        { text: user },
        { file_data: { mime_type: file.mime, file_uri: file.uri } },
      ],
    }],
    generationConfig,
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  const t0 = Date.now()
  let response
  try {
    response = await axios.post(ENDPOINT, body, {
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      timeout: timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    })
  } catch (e) {
    console.error(`[clipSuggest:geminiVideo] axios threw in ${Date.now() - t0}ms: ${e.message}`)
    throw new Error(`clipSuggest (geminiVideo) request failed: ${e.message}`)
  }

  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    console.error(`[clipSuggest:geminiVideo] HTTP ${response.status} in ${Date.now() - t0}ms: ${detail.slice(0, 600)}`)
    writeClipDebug(debugPath, { provider: 'geminivideo', model: MODEL, system, user, raw: response.data, error: `HTTP ${response.status}` })
    throw new Error(`clipSuggest (geminiVideo) HTTP ${response.status}: ${detail.slice(0, 400)}`)
  }
  console.log(`[clipSuggest:geminiVideo] API call ok in ${Date.now() - t0}ms`)
  writeClipDebug(debugPath, { provider: 'geminivideo', model: MODEL, system, user, raw: response.data })

  // Stitch all text parts from candidate 0.
  const cand = response.data?.candidates?.[0]
  const text = (cand?.content?.parts || []).map(p => p?.text).filter(Boolean).join('') || ''

  let parsed
  try {
    let clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    if (!clean.startsWith('{')) {
      const first = clean.indexOf('{')
      const last = clean.lastIndexOf('}')
      if (first !== -1 && last > first) clean = clean.slice(first, last + 1)
    }
    parsed = JSON.parse(clean)
  } catch (e) {
    console.error(`[clipSuggest:geminiVideo] JSON parse failed: ${e.message}; raw[0:400]="${text.slice(0, 400)}"`)
    throw new Error(`clipSuggest (geminiVideo): JSON parse failed: ${e.message}\nRaw: ${text.slice(0, 400)}`)
  }

  const clips = Array.isArray(parsed?.clips) ? parsed.clips : null
  if (!clips) {
    console.error(`[clipSuggest:geminiVideo] expected {clips:[...]}; got: ${typeof parsed}`)
    throw new Error('clipSuggest (geminiVideo): expected a "clips" array')
  }
  console.log(`[clipSuggest:geminiVideo] parsed ${clips.length} clips`)

  return { model: MODEL, clips, truncated: false }
}

module.exports = { suggestFromVideo, MODEL }
