const axios = require('axios')
const { buildClipPrompt } = require('../../lib/clipPrompt')

const MODEL = 'gpt-4.1-mini'
const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

// Strict Structured Outputs: root must be an object, every property listed in
// `required`, `additionalProperties` false. Strict mode forbids numeric min/max,
// so the second/score bounds are enforced via the prompt and clamped in the route.
const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'clip_suggestions',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['clips'],
      properties: {
        clips: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['start', 'end', 'title', 'hook', 'rationale', 'transcript_excerpt', 'score'],
            properties: {
              start: { type: 'number' },
              end: { type: 'number' },
              title: { type: 'string' },
              hook: { type: 'string' },
              rationale: { type: 'string' },
              transcript_excerpt: { type: 'string' },
              score: { type: 'integer' },
            },
          },
        },
      },
    },
  },
}

/**
 * Suggest engaging clips from a transcript using OpenAI gpt-4.1-mini.
 * Direct REST call via axios — Chat Completions with strict Structured Outputs.
 *
 * @param {object} opts - see buildClipPrompt (segments, bucket, count, videoDuration, language, filename)
 * @param {number} [opts.timeoutMs=90000]
 * @returns {Promise<{ model:string, clips:Array, truncated:boolean }>} raw, un-clamped clips
 */
async function suggest({ segments, bucket, count, videoDuration, language, filename, timeoutMs = 90000 }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set')
  }

  const { prompt, truncated } = buildClipPrompt({ segments, bucket, count, videoDuration, language, filename })
  console.log(`[clipSuggest:openai] model=${MODEL} count=${count} bucket=${bucket} promptChars=${prompt.length} truncated=${truncated}`)

  const body = {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
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
    console.error(`[clipSuggest:openai] axios threw in ${Date.now() - t0}ms: ${e.message}`)
    throw new Error(`clipSuggest (openai) request failed: ${e.message}`)
  }

  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data).slice(0, 600)
    console.error(`[clipSuggest:openai] HTTP ${response.status} in ${Date.now() - t0}ms: ${detail}`)
    throw new Error(`clipSuggest (openai) HTTP ${response.status}: ${detail.slice(0, 400)}`)
  }
  console.log(`[clipSuggest:openai] API call ok in ${Date.now() - t0}ms`)

  const choice = response.data?.choices?.[0]
  if (choice?.message?.refusal) {
    throw new Error(`clipSuggest (openai) refused: ${choice.message.refusal}`)
  }

  const raw = choice?.message?.content
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    console.error(`[clipSuggest:openai] JSON parse failed: ${e.message}; raw[0:400]="${String(raw).slice(0, 400)}"`)
    throw new Error(`clipSuggest (openai): JSON parse failed: ${e.message}`)
  }

  const clips = Array.isArray(parsed?.clips) ? parsed.clips : null
  if (!clips) {
    console.error(`[clipSuggest:openai] expected {clips:[...]}; got: ${typeof parsed}`)
    throw new Error('clipSuggest (openai): expected a "clips" array')
  }
  console.log(`[clipSuggest:openai] parsed ${clips.length} clips`)

  return { model: MODEL, clips, truncated }
}

module.exports = { suggest, MODEL }
