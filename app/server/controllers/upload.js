const uploadService = require('../services/upload')
const { MAX_FILE_SIZE_MB, ALLOWED_MIME_TYPES } = require('../config/constants')

const maxBytes = () => MAX_FILE_SIZE_MB * 1024 * 1024

// POST /api/upload/presign  { filename, contentType, size }
// Validates type/size, mints a videoId, returns presigned upload URL(s) for the
// browser to PUT original.<ext> directly to S3 — a single URL for small files,
// or a multipart uploadId + one URL per part for large ones.
async function presign(req, res) {
  const { filename, contentType, size } = req.body || {}
  if (!filename) return res.status(400).json({ error: 'filename required' })
  if (size == null || !Number.isFinite(Number(size)) || Number(size) <= 0) {
    return res.status(400).json({ error: 'size required' })
  }
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    return res.status(400).json({ error: `Unsupported file type: ${contentType || 'unknown'}` })
  }
  if (Number(size) > maxBytes()) {
    return res.status(413).json({ error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.` })
  }

  try {
    const data = await uploadService.createPresignedUpload({ filename, contentType, size: Number(size) })
    res.json(data)
  } catch (err) {
    console.error('Presign error:', err.message)
    res.status(500).json({ error: 'Failed to create upload URL' })
  }
}

// POST /api/upload/complete  { videoId, filename, size, key, uploadId?, parts? }
// Assembles multipart uploads on S3 (when uploadId is present), confirms the
// object landed and isn't oversized, and records meta.json.
async function complete(req, res) {
  const { videoId, filename, size, key, uploadId, parts } = req.body || {}
  if (!videoId) return res.status(400).json({ error: 'videoId required' })
  if (uploadId && !key) return res.status(400).json({ error: 'key required to complete a multipart upload' })

  try {
    const result = await uploadService.completeUpload({ videoId, filename, size, key, uploadId, parts, maxBytes: maxBytes() })
    if (!result) return res.status(400).json({ error: 'Upload not found in storage' })
    res.json(result)
  } catch (err) {
    if (err.oversized) return res.status(413).json({ error: err.message })
    console.error(`[${videoId}] Upload completion failed:`, err.message)
    res.status(500).json({ error: err.message })
  }
}

// POST /api/upload/abort  { key, uploadId }
// Not user-facing — called automatically by the client when a multipart
// upload fails past its retry budget, so orphaned parts don't linger on S3.
async function abort(req, res) {
  const { key, uploadId } = req.body || {}
  if (!key || !uploadId) return res.status(400).json({ error: 'key and uploadId required' })

  try {
    await uploadService.abortUpload({ key, uploadId })
    res.json({ aborted: true })
  } catch (err) {
    console.error('Upload abort failed:', err.message)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { presign, complete, abort }
