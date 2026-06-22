const fs = require('fs')
const path = require('path')
const axios = require('axios')
const FormData = require('form-data')
const { buildPolishPrompt } = require('../../lib/thumbnailPolishPrompt')

const MODEL = 'gpt-image-1.5'
const ENDPOINT = 'https://api.openai.com/v1/images/edits'

/**
 * Map a source video's aspect category to the closest size gpt-image-1 accepts.
 * gpt-image-1 supports: 1024x1024, 1024x1536 (portrait), 1536x1024 (landscape), or auto.
 */
function sizeForAspect(aspect) {
  switch (aspect) {
    case 'landscape': return '1536x1024'
    case 'portrait':  return '1024x1536'
    case 'square':    return '1024x1024'
    default:          return 'auto'
  }
}

/**
 * Polish a single thumbnail candidate with OpenAI gpt-image-1.
 *
 * Uses axios + form-data (axios consumes the Node form-data stream correctly,
 * whereas Node's native fetch garbles it → "failed to parse multipart/form-data").
 *
 * @param {object} opts
 * @param {string} opts.framePath
 * @param {string} [opts.filename]
 * @param {string} [opts.transcriptHint]
 * @param {string} [opts.styleBrief]
 * @param {'landscape'|'portrait'|'square'|'unknown'} [opts.aspect='unknown']
 * @param {string} [opts.size]                - explicit size override (e.g. '1536x1024'); otherwise picked from aspect
 * @param {string} [opts.quality='medium']
 * @param {string} [opts.outputFormat='png']
 * @param {number} [opts.timeoutMs=120000]
 *
 * @returns {Promise<{ buffer: Buffer, mime: string, model: string }>}
 */
async function polish({
  framePath,
  filename,
  transcriptHint,
  styleBrief,
  aspect = 'unknown',
  size,
  quality = 'high',
  outputFormat = 'png',
  timeoutMs = 120000,
}) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')

  const resolvedSize = size || sizeForAspect(aspect)
  const prompt = buildPolishPrompt({ provider: 'openai', filename, transcriptHint, styleBrief, aspect })
  console.log(`[polish:openai] model=${MODEL} aspect=${aspect} size=${resolvedSize} quality=${quality} input_fidelity=high output_format=${outputFormat} input=${framePath} promptChars=${prompt.length}`)

  const form = new FormData()
  form.append('model', MODEL)
  form.append('prompt', prompt)
  form.append('image', fs.createReadStream(framePath), {
    filename: path.basename(framePath),
    contentType: 'image/jpeg',
  })
  form.append('size', resolvedSize)
  form.append('quality', quality)
  form.append('input_fidelity', 'high') // preserve subject identity
  form.append('output_format', outputFormat)
  form.append('moderation', 'low') // reduce false-positive content blocks on real video frames
  form.append('n', '1')

  const t0 = Date.now()
  let response
  try {
    response = await axios.post(ENDPOINT, form, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        ...form.getHeaders(),
      },
      timeout: timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    })
  } catch (e) {
    console.error(`[polish:openai] axios threw in ${Date.now() - t0}ms: ${e.message}`)
    throw new Error(`polish (openai) request failed: ${e.message}`)
  }

  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data).slice(0, 600)
    console.error(`[polish:openai] HTTP ${response.status} in ${Date.now() - t0}ms: ${detail}`)
    throw new Error(`polish (openai) HTTP ${response.status}: ${detail.slice(0, 400)}`)
  }
  console.log(`[polish:openai] API call ok in ${Date.now() - t0}ms`)

  const b64 = response.data?.data?.[0]?.b64_json
  if (!b64) {
    console.error('[polish:openai] no b64_json in response:', JSON.stringify(response.data).slice(0, 400))
    throw new Error('polish (openai): no b64_json in response')
  }

  const mime = outputFormat === 'jpeg'
    ? 'image/jpeg'
    : outputFormat === 'webp' ? 'image/webp' : 'image/png'

  const buffer = Buffer.from(b64, 'base64')
  console.log(`[polish:openai] image decoded: mime=${mime} bytes=${buffer.length} usage=${JSON.stringify(response.data?.usage || {})}`)
  return { buffer, mime, model: MODEL }
}

module.exports = { polish, MODEL, sizeForAspect }
