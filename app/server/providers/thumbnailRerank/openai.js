const fs = require('fs')
const axios = require('axios')
const { buildRerankSystemPrompt, buildRerankUserPrompt } = require('../../lib/thumbnailPolishPrompt')

const MODEL = 'gpt-4.1-mini'
const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

// Strict Structured Outputs: the root schema must be an object (not an array),
// every property must be listed in `required`, and `additionalProperties` must
// be false. The score array is wrapped under `scores`. Note: strict mode does
// not support numeric min/max, so the 1–10 bound is enforced via the prompt and
// clamped in code below.
const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'frame_scores',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['scores'],
      properties: {
        scores: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'score', 'rationale'],
            properties: {
              label: { type: 'string' },
              score: { type: 'integer' },
              rationale: { type: 'string' },
            },
          },
        },
      },
    },
  },
}

/**
 * Rerank candidate frames using OpenAI gpt-4.1-mini multi-image scoring.
 * Direct REST call via axios — Chat Completions with strict Structured Outputs.
 *
 * Drop-in alternative to the Gemini reranker: same input/output contract.
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
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set')
  }
  if (!Array.isArray(frames) || frames.length === 0) {
    console.log('[rerank:openai] empty frames input → returning []')
    return []
  }

  // Static rules → system message; per-run context + images → user message.
  // The strict schema needs an object, so steer the model to wrap under `scores`.
  const system =
    buildRerankSystemPrompt() +
    '\n\nReturn a JSON object of the form {"scores":[{"label":"A","score":<1-10 number>,"rationale":"<one short sentence>"}, ...]} containing one entry per image.'
  const user = buildRerankUserPrompt({ count: frames.length, filename, transcriptHint })

  const content = [{ type: 'text', text: user }]
  let totalBytes = 0
  for (const f of frames) {
    const buf = fs.readFileSync(f.path)
    totalBytes += buf.length
    // detail:'low' — rerank judges composition/face/exposure, not fine sharpness,
    // so the 512px low-detail downscale keeps image tokens (and cost) minimal.
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}`, detail: 'low' },
    })
  }
  console.log(`[rerank:openai] model=${MODEL} frames=${frames.length} sysChars=${system.length} userChars=${user.length} images=${(totalBytes / 1024).toFixed(1)}kb raw`)

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content },
    ],
    response_format: RESPONSE_FORMAT,
  }

  const t0 = Date.now()
  let response
  try {
    response = await axios.post(ENDPOINT, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      timeout: timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    })
  } catch (e) {
    console.error(`[rerank:openai] axios threw in ${Date.now() - t0}ms: ${e.message}`)
    throw new Error(`rerank (openai) request failed: ${e.message}`)
  }

  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data).slice(0, 600)
    console.error(`[rerank:openai] HTTP ${response.status} in ${Date.now() - t0}ms: ${detail}`)
    throw new Error(`rerank (openai) HTTP ${response.status}: ${detail.slice(0, 400)}`)
  }
  console.log(`[rerank:openai] API call ok in ${Date.now() - t0}ms`)

  const choice = response.data?.choices?.[0]
  if (choice?.message?.refusal) {
    throw new Error(`rerank (openai) refused: ${choice.message.refusal}`)
  }

  const raw = choice?.message?.content
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    console.error(`[rerank:openai] JSON parse failed: ${e.message}; raw[0:400]="${String(raw).slice(0, 400)}"`)
    throw new Error(`rerank (openai): JSON parse failed: ${e.message}`)
  }

  const scores = Array.isArray(parsed?.scores) ? parsed.scores : null
  if (!scores) {
    console.error(`[rerank:openai] expected {scores:[...]}; got: ${typeof parsed}`)
    throw new Error('rerank (openai): expected a "scores" array')
  }
  console.log(`[rerank:openai] parsed ${scores.length} entries`)

  // Map label A/B/C... → index in `frames`. Fall back to positional if labels missing.
  return frames.map((f, i) => {
    const labelCh = String.fromCharCode(65 + i)
    const entry = scores.find(p => (p?.label || '').toUpperCase() === labelCh) || scores[i] || {}
    const n = Number(entry.score)
    const score = Number.isFinite(n) ? Math.max(1, Math.min(10, n)) : 0
    return {
      idx: f.idx,
      vlmScore: score,
      rationale: String(entry.rationale || '').trim(),
    }
  })
}

module.exports = { rerank, MODEL }
