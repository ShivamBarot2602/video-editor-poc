const uploadService = require('../services/upload')
const { MAX_FILE_SIZE_MB, ALLOWED_MIME_TYPES } = require('../config/constants')

// POST /api/upload/presign  { filename, contentType, size }
// Validates type/size, mints a videoId, returns a presigned-POST for the browser
// to upload original.<ext> directly to S3. Size + type are re-enforced at S3.
async function presign(req, res) {
  const { filename, contentType, size } = req.body || {}
  if (!filename) return res.status(400).json({ error: 'filename required' })
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    return res.status(400).json({ error: `Unsupported file type: ${contentType || 'unknown'}` })
  }
  const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024
  if (size != null && Number(size) > maxBytes) {
    return res.status(413).json({ error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.` })
  }

  try {
    const data = await uploadService.createPresignedUpload({ filename, contentType, maxBytes })
    res.json(data)
  } catch (err) {
    console.error('Presign error:', err.message)
    res.status(500).json({ error: 'Failed to create upload URL' })
  }
}

// POST /api/upload/complete  { videoId, filename, size }
// Confirms the object landed in S3 and records meta.json.
async function complete(req, res) {
  const { videoId, filename, size } = req.body || {}
  if (!videoId) return res.status(400).json({ error: 'videoId required' })

  try {
    const result = await uploadService.completeUpload({ videoId, filename, size })
    if (!result) return res.status(400).json({ error: 'Upload not found in storage' })
    res.json(result)
  } catch (err) {
    console.error(`[${videoId}] Upload completion failed:`, err.message)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { presign, complete }
