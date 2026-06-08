const axios = require('axios')
const { buildClipSystemPrompt, buildClipUserPrompt } = require('../../lib/clipPrompt')
const { writeClipDebug } = require('../../lib/clipDebug')

const MODEL = 'gemini-2.5-pro'

const MODEL_ENDPOINT_VERSION_MAP = {
  'gemini-2.5-pro': 'v1',
  'gemini-2.5-flash': 'v1',
}

const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/${MODEL_ENDPOINT_VERSION_MAP[model] || 'v1'}/models/${model}:generateContent`

/**
 * Suggest engaging clips from a transcript using Gemini 2.5 Pro.
 * Direct REST call via axios.
 *
 * The v1 generateContent endpoint rejects response_mime_type/responseSchema for
 * this model, so we instruct JSON-only in the prompt and defensively strip any
 * stray markdown fences / prose before parsing (same approach as the rerank wrapper).
 *
 * @param {object} opts - prompt inputs (segments, bucket, count, videoDuration, language, filename)
 * @param {string} [opts.debugPath] - if set, write prompts + raw response here (overwritten each run)
 * @param {number} [opts.timeoutMs=120000]
 * @returns {Promise<{ model:string, clips:Array, truncated:boolean }>} raw, un-clamped clips
 */
async function suggest({ segments, bucket, count, videoDuration, language, filename, debugPath, timeoutMs = 120000 }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set')
  }

  const system = buildClipSystemPrompt()
  const { text: user, truncated } = buildClipUserPrompt({ segments, bucket, count, videoDuration, language, filename })
  console.log(`[clipSuggest:gemini] model=${MODEL} count=${count} bucket=${bucket} sysChars=${system.length} userChars=${user.length} truncated=${truncated}`)

  const body = {
    // Top-level system_instruction (v1-supported for 2.x models); the
    // transcript-bearing user turn goes in contents.
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.3,
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
    console.error(`[clipSuggest:gemini] axios threw in ${Date.now() - t0}ms: ${e.message}`)
    throw new Error(`clipSuggest (gemini) request failed: ${e.message}`)
  }

  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data)
    console.error(`[clipSuggest:gemini] HTTP ${response.status} in ${Date.now() - t0}ms: ${detail.slice(0, 600)}`)
    writeClipDebug(debugPath, { provider: 'gemini', model: MODEL, system, user, raw: response.data, error: `HTTP ${response.status}` })
    throw new Error(`clipSuggest (gemini) HTTP ${response.status}: ${detail.slice(0, 400)}`)
  }
  console.log(`[clipSuggest:gemini] API call ok in ${Date.now() - t0}ms`)

  // Persist prompts + the FULL response body now — captures both success and a
  // parse failure below.
  writeClipDebug(debugPath, { provider: 'gemini', model: MODEL, system, user, raw: response.data })

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
    // 2) if still not a JSON object, carve out the first {...} span (handles prose padding)
    if (!clean.startsWith('{')) {
      const first = clean.indexOf('{')
      const last = clean.lastIndexOf('}')
      if (first !== -1 && last > first) clean = clean.slice(first, last + 1)
    }
    parsed = JSON.parse(clean)
  } catch (e) {
    console.error(`[clipSuggest:gemini] JSON parse failed: ${e.message}; raw[0:400]="${text.slice(0, 400)}"`)
    throw new Error(`clipSuggest (gemini): JSON parse failed: ${e.message}\nRaw: ${text.slice(0, 400)}`)
  }

  const clips = Array.isArray(parsed?.clips) ? parsed.clips : null
  if (!clips) {
    console.error(`[clipSuggest:gemini] expected {clips:[...]}; got: ${typeof parsed}`)
    throw new Error('clipSuggest (gemini): expected a "clips" array')
  }
  console.log(`[clipSuggest:gemini] parsed ${clips.length} clips`)

  return { model: MODEL, clips, truncated }
}

module.exports = { suggest, MODEL }
