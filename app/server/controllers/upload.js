const uploadService = require('../services/upload')
const { MAX_FILE_SIZE_MB } = require('../config/constants')

// POST /api/upload — multer has already stored the file + set req.videoId/videoDir.
function upload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const meta = { filename: req.file.originalname, size: req.file.size, uploadedAt: new Date().toISOString() }
  uploadService.recordUpload(req.videoId, meta)

  res.json({
    videoId: req.videoId,
    filename: req.file.originalname,
    size: req.file.size,
    path: req.file.path,
  })
}

// Multer error middleware (file too large, wrong type, etc.)
function handleUploadError(err, _req, res, _next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`,
    })
  }
  res.status(400).json({ error: err.message })
}

module.exports = { upload, handleUploadError }
