const fs = require('fs')
const axios = require('axios')
const { buildPolishPrompt } = require('../../lib/thumbnailPolishPrompt')

const MODEL = 'gemini-2.5-flash-image'
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`

/**
 * Map our aspect category → Gemini aspectRatio enum value.
 * Gemini accepts: 1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4, 8:1, 9:16, 16:9, 21:9
 */
function aspectRatioFor(aspect) {
  switch (aspect) {
    case 'landscape': return '16:9'
    case 'portrait':  return '9:16'
    case 'square':    return '1:1'
    default:          return null // omit → let model decide
  }
}

/**
 * Polish a single thumbnail candidate with Gemini 2.5 Flash Image ("Nano Banana").
 *
 * Direct REST call via axios — matches the official docs at
 * https://ai.google.dev/gemini-api/docs/image-generation
 *
 * @param {object} opts
 * @param {string} opts.framePath
 * @param {string} [opts.filename]
 * @param {string} [opts.transcriptHint]
 * @param {string} [opts.styleBrief]
 * @param {'landscape'|'portrait'|'square'|'unknown'} [opts.aspect='unknown']
 * @param {string} [opts.imageSize='2K']      - Gemini imageSize enum: '512', '1K', '2K', '4K'
 * @param {number} [opts.timeoutMs=60000]
 *
 * @returns {Promise<{ buffer: Buffer, mime: string, model: string }>}
 */
async function polish({
  framePath,
  filename,
  transcriptHint,
  styleBrief,
  aspect = 'unknown',
  imageSize = '2K',
  timeoutMs = 60000,
}) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set')

  // The v1 endpoint for the dedicated image model rejects generationConfig
  // (response_modalities / response_format etc are not accepted on this path).
  // The official docs cURL example posts only `contents`. The model is image-out
  // by design, so modality declaration is unnecessary.
  // Aspect-ratio hint is delivered via the text prompt (see buildPolishPrompt).
  const prompt = buildPolishPrompt({ filename, transcriptHint, styleBrief, aspect })
  const frameBuf = fs.readFileSync(framePath)
  const aspectRatio = aspectRatioFor(aspect)
  console.log(`[polish:gemini] model=${MODEL} aspect=${aspect} aspectRatio=${aspectRatio ?? '(omit)'} input=${framePath} (${frameBuf.length} bytes) promptChars=${prompt.length}`)

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: frameBuf.toString('base64'),
            },
          },
        ],
      },
    ],
    // Most permissive adjustable thresholds. Hardcoded image-gen
    // policies (e.g. real-person manipulation, CSAM) are not overridable.
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
    console.error(`[polish:gemini] axios threw in ${Date.now() - t0}ms: ${e.message}`)
    throw new Error(`polish (gemini) request failed: ${e.message}`)
  }

  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data).slice(0, 800)
    console.error(`[polish:gemini] HTTP ${response.status} in ${Date.now() - t0}ms: ${detail}`)
    throw new Error(`polish (gemini) HTTP ${response.status}: ${detail.slice(0, 400)}`)
  }
  console.log(`[polish:gemini] API call ok in ${Date.now() - t0}ms`)

  console.dir({ imgGenRes: response.data }, { depth: null });

  // Detect prompt-level blocks before scanning for an image part.
  const promptFeedback = response.data?.promptFeedback
  if (promptFeedback?.blockReason) {
    const reason = promptFeedback.blockReason
    const blockMsg = promptFeedback.blockReasonMessage || ''
    const ratings = (promptFeedback.safetyRatings || [])
      .filter(r => r.blocked || r.probability !== 'NEGLIGIBLE')
      .map(r => `${r.category}=${r.probability}${r.blocked ? '(blocked)' : ''}`)
      .join(', ')
    console.error(`[polish:gemini] prompt blocked: reason=${reason} msg="${blockMsg}" ratings=[${ratings}]`)
    throw new Error(
      `polish (gemini) blocked: ${reason}` +
      (blockMsg ? ` — ${blockMsg}` : '') +
      (ratings ? ` (${ratings})` : '') +
      (reason === 'OTHER'
        ? ' — image-gen content policy. Common cause: real-person manipulation rule.'
        : '')
    )
  }

  const candidates = response.data?.candidates || []
  for (const cand of candidates) {
    for (const part of (cand?.content?.parts || [])) {
      // Accept both camelCase and snake_case (REST returns snake_case fields).
      const inline = part?.inlineData || part?.inline_data
      if (inline?.data) {
        const outBuf = Buffer.from(inline.data, 'base64')
        const mime = inline.mimeType || inline.mime_type || 'image/png'
        console.log(`[polish:gemini] image extracted: mime=${mime} bytes=${outBuf.length}`)
        return { buffer: outBuf, mime, model: MODEL }
      }
    }
  }

  // No image part — surface model text (often a refusal or safety stop).
  const txt = candidates?.[0]?.content?.parts?.map(p => p?.text).filter(Boolean).join(' ') || ''
  const finishReason = candidates?.[0]?.finishReason || candidates?.[0]?.finish_reason || ''
  console.error(`[polish:gemini] no image part in response; finishReason="${finishReason}" text="${txt.slice(0, 300)}"`)
  throw new Error(
    `polish (gemini): no image in response` +
    (finishReason ? ` (finishReason=${finishReason})` : '') +
    (txt ? ` — model text: "${txt.slice(0, 200)}"` : '')
  )
}

module.exports = { polish, MODEL, aspectRatioFor }
