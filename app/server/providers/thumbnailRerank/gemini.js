const fs = require('fs')
const axios = require('axios')
const { buildRerankPrompt } = require('../../lib/thumbnailPolishPrompt')

const MODEL = 'gemini-2.5-pro'

const MODEL_ENDPOINT_VERSION_MAP = {
  'gemini-2.5-pro': 'v1',
  'gemini-2.5-flash': 'v1',
  'gemini-3.1-pro-preview': 'v1beta',
  'gemini-3-flash-preview': 'v1beta',
  'gemini-3-flash': 'v1beta' ,
}

const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/${MODEL_ENDPOINT_VERSION_MAP[model] || 'v1'}/models/${model}:generateContent`

/**
 * Rerank candidate frames using Gemini 2.5 Flash multi-image scoring.
 * Direct REST call via axios.
 *
 * @param {object} opts
 * @param {Array}  opts.frames           - [{idx, t, path, ...}], usually 8-12 items
 * @param {string} [opts.filename]       - source video filename
 * @param {string} [opts.transcriptHint] - first ~200 chars of transcript, if any
 * @param {number} [opts.timeoutMs=60000]
 *
 * @returns {Promise<Array<{ idx:number, vlmScore:number, rationale:string }>>}
 *          One entry per input frame, in the SAME order as `frames`.
 */
async function rerank({ frames, filename, transcriptHint, timeoutMs = 60000 }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set')
  }
  if (!Array.isArray(frames) || frames.length === 0) {
    console.log('[rerank:gemini] empty frames input → returning []')
    return []
  }

  const prompt = buildRerankPrompt({ count: frames.length, filename, transcriptHint })
  console.log(`[rerank:gemini] model=${MODEL} frames=${frames.length} promptChars=${prompt.length}`)

  const parts = [{ text: prompt }]
  let totalBytes = 0
  for (const f of frames) {
    const buf = fs.readFileSync(f.path)
    totalBytes += buf.length
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: buf.toString('base64') } })
  }
  console.log(`[rerank:gemini] payload: ${frames.length} images, ${(totalBytes / 1024).toFixed(1)}kb raw`)

  // The v1 generateContent endpoint rejects response_mime_type in generation_config
  // for this model. The prompt already instructs the model to return pure JSON
  // ("No prose outside the JSON. No markdown fences.") and the parser below
  // strips stray markdown fences as a safety net.
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
    },
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
    response = await axios.post(ENDPOINT(MODEL), body, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      timeout: timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    })
  } catch (e) {
    console.error(`[rerank:gemini] axios threw in ${Date.now() - t0}ms: ${e.message}`)
    throw new Error(`rerank (gemini) request failed: ${e.message}`)
  }

  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data).slice(0, 600)
    console.error(`[rerank:gemini] HTTP ${response.status} in ${Date.now() - t0}ms: ${detail}`)
    throw new Error(`rerank (gemini) HTTP ${response.status}: ${detail.slice(0, 400)}`)
  }
  console.log(`[rerank:gemini] API call ok in ${Date.now() - t0}ms`)

  // Stitch all text parts from candidate 0.
  const cand = response.data?.candidates?.[0]
  const text = (cand?.content?.parts || [])
    .map(p => p?.text)
    .filter(Boolean)
    .join('') || ''

  let parsed
  try {
    // 1) strip markdown fences
    let clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    // 2) if still not JSON, carve out the first [...] span (handles prose padding)
    if (!clean.startsWith('[')) {
      const first = clean.indexOf('[')
      const last = clean.lastIndexOf(']')
      if (first !== -1 && last > first) clean = clean.slice(first, last + 1)
    }
    parsed = JSON.parse(clean)
  } catch (e) {
    console.error(`[rerank:gemini] JSON parse failed: ${e.message}; raw[0:400]="${text.slice(0, 400)}"`)
    throw new Error(`rerank: JSON parse failed: ${e.message}\nRaw: ${text.slice(0, 400)}`)
  }
  if (!Array.isArray(parsed)) {
    console.error(`[rerank:gemini] expected JSON array; got: ${typeof parsed}`)
    throw new Error('rerank: expected JSON array')
  }
  console.log(`[rerank:gemini] parsed ${parsed.length} entries`)

  // Map label A/B/C... → index in `frames`. Fall back to positional if labels missing.
  return frames.map((f, i) => {
    const labelCh = String.fromCharCode(65 + i)
    const entry = parsed.find(p => (p?.label || '').toUpperCase() === labelCh) || parsed[i] || {}
    const score = Number(entry.score)
    return {
      idx: f.idx,
      vlmScore: Number.isFinite(score) ? score : 0,
      rationale: String(entry.rationale || '').trim(),
    }
  })
}

module.exports = { rerank, MODEL }
