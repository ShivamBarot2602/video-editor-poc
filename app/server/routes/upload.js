const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const { normalizeVideoExtension } = require('../lib/videoExtensions')

const router = express.Router()

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10)
const ALLOWED_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
  'video/webm', 'video/mpeg', 'video/3gpp', 'video/x-flv',
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg',
  'audio/flac', 'audio/webm',
]

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const id = uuidv4()
    const dir = path.join(req.videosDir, id)
    fs.mkdirSync(dir, { recursive: true })
    req.videoId = id
    req.videoDir = dir
    cb(null, dir)
  },
  filename(_req, file, cb) {
    const ext = normalizeVideoExtension(path.extname(file.originalname))
    cb(null, `original${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`))
    }
  },
})

router.post('/', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  // Persist original filename so the Recent Videos list can display it later
  const meta = { filename: req.file.originalname, size: req.file.size, uploadedAt: new Date().toISOString() }
  fs.writeFileSync(path.join(req.videoDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

  res.json({
    videoId: req.videoId,
    filename: req.file.originalname,
    size: req.file.size,
    path: req.file.path,
  })
})

// Handle multer errors (file too large, wrong type, etc.)
router.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`,
    })
  }
  res.status(400).json({ error: err.message })
})

module.exports = router
