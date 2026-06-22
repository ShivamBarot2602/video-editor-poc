const fs = require('fs')
const path = require('path')
const axios = require('axios')

const BASE = 'https://generativelanguage.googleapis.com'

// Map a video file extension → the MIME type the Files API expects.
function guessMime(filePath) {
  const ext = path.extname(filePath || '').toLowerCase()
  switch (ext) {
    case '.mp4':  return 'video/mp4'
    case '.mov':  return 'video/quicktime'
    case '.mkv':  return 'video/x-matroska'
    case '.webm': return 'video/webm'
    case '.avi':  return 'video/x-msvideo'
    case '.m4v':  return 'video/x-m4v'
    default:      return 'video/mp4'
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Upload a video to the Gemini Files API via the resumable protocol.
 * Two requests: (1) start → returns an upload URL, (2) upload+finalize → returns
 * the file resource. The video is streamed (not buffered) so large files don't
 * blow up memory; `onProgress(percent)` is driven off the read stream.
 *
 * @param {object} opts
 * @param {string} opts.filePath
 * @param {string} opts.apiKey
 * @param {string} [opts.displayName]
 * @param {(percent:number)=>void} [opts.onProgress]
 * @param {number} [opts.timeoutMs=600000]
 * @returns {Promise<{ name:string, uri:string, mimeType:string, state:string }>}
 */
async function uploadVideo({ filePath, apiKey, displayName, onProgress, timeoutMs = 600000 }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  if (!fs.existsSync(filePath)) throw new Error(`upload source missing: ${filePath}`)

  const size = fs.statSync(filePath).size
  const mime = guessMime(filePath)
  const t0 = Date.now()
  console.log(`[geminiFiles] upload start: ${path.basename(filePath)} ${(size / 1048576).toFixed(1)}MB ${mime}`)

  // (1) START — announce the upload, get the per-upload URL back in a header.
  let start
  try {
    start = await axios.post(
      `${BASE}/upload/v1beta/files`,
      { file: { display_name: displayName || path.basename(filePath) } },
      {
        headers: {
          'x-goog-api-key': apiKey,
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(size),
          'X-Goog-Upload-Header-Content-Type': mime,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
        validateStatus: () => true,
      },
    )
  } catch (e) {
    throw new Error(`Files API start failed: ${e.message}`)
  }
  if (start.status < 200 || start.status >= 300) {
    const detail = typeof start.data === 'string' ? start.data : JSON.stringify(start.data)
    throw new Error(`Files API start HTTP ${start.status}: ${detail.slice(0, 300)}`)
  }
  const uploadUrl = start.headers['x-goog-upload-url'] || start.headers['X-Goog-Upload-URL']
  if (!uploadUrl) throw new Error('Files API start: no upload URL in response headers')
  console.log(`[geminiFiles] resumable session opened in ${Date.now() - t0}ms`)

  // (2) UPLOAD + FINALIZE — stream the bytes, count them for progress.
  const readStream = fs.createReadStream(filePath)
  let uploaded = 0
  readStream.on('data', (chunk) => {
    uploaded += chunk.length
    if (typeof onProgress === 'function' && size > 0) {
      onProgress(Math.max(0, Math.min(99, Math.round((uploaded / size) * 100))))
    }
  })

  let fin
  try {
    fin = await axios.post(uploadUrl, readStream, {
      headers: {
        'Content-Length': String(size),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      timeout: timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    })
  } catch (e) {
    throw new Error(`Files API upload failed: ${e.message}`)
  }
  if (fin.status < 200 || fin.status >= 300) {
    const detail = typeof fin.data === 'string' ? fin.data : JSON.stringify(fin.data)
    throw new Error(`Files API upload HTTP ${fin.status}: ${detail.slice(0, 300)}`)
  }
  onProgress?.(100)

  const file = fin.data?.file
  if (!file?.uri || !file?.name) throw new Error('Files API upload: response missing file uri/name')
  console.log(`[geminiFiles] upload finalized in ${Date.now() - t0}ms → ${file.name} state=${file.state || 'PROCESSING'}`)
  return { name: file.name, uri: file.uri, mimeType: file.mimeType || mime, state: file.state || 'PROCESSING' }
}

/**
 * Poll a file resource until it reports state ACTIVE. The Files API ingests video
 * at 1 FPS server-side, so a freshly uploaded file is PROCESSING for a bit and
 * cannot be referenced in generateContent until ACTIVE.
 *
 * @param {object} opts
 * @param {string} opts.name   - file resource name, e.g. "files/abc123"
 * @param {string} opts.apiKey
 * @param {number} [opts.timeoutMs=180000]
 * @param {number} [opts.intervalMs=2500]
 * @returns {Promise<{ name:string, uri:string, mimeType:string, state:string }>}
 */
async function waitForActive({ name, apiKey, timeoutMs = 180000, intervalMs = 2500 }) {
  const t0 = Date.now()
  const deadline = t0 + timeoutMs
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[geminiFiles] awaiting ACTIVE: ${name}`)
  // name is "files/xyz"; the GET resource path is /v1beta/{name}.
  const url = `${BASE}/v1beta/${name}`
  for (;;) {
    let res
    try {
      res = await axios.get(url, {
        headers: { 'x-goog-api-key': apiKey },
        timeout: 30000,
        validateStatus: () => true,
      })
    } catch (e) {
      throw new Error(`Files API poll failed: ${e.message}`)
    }
    if (res.status < 200 || res.status >= 300) {
      const detail = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      throw new Error(`Files API poll HTTP ${res.status}: ${detail.slice(0, 300)}`)
    }
    const state = res.data?.state
    if (state === 'ACTIVE') {
      console.log(`[geminiFiles] ${name} ACTIVE in ${elapsed()}s`)
      return { name: res.data.name, uri: res.data.uri, mimeType: res.data.mimeType, state }
    }
    if (state === 'FAILED') {
      console.error(`[geminiFiles] ${name} processing FAILED after ${elapsed()}s`)
      throw new Error(`Files API processing FAILED for ${name}`)
    }
    if (Date.now() > deadline) {
      throw new Error(`Files API not ACTIVE within ${Math.round(timeoutMs / 1000)}s (last state: ${state})`)
    }
    console.log(`[geminiFiles] ${name} state=${state || 'PROCESSING'} (${elapsed()}s)`)
    await sleep(intervalMs)
  }
}

module.exports = { guessMime, uploadVideo, waitForActive }
