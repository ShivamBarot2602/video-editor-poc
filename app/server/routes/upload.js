const express = require('express')
const multer = require('multer')
const path = require('path')
const { normalizeVideoExtension } = require('../lib/videoExtensions')
const { MAX_FILE_SIZE_MB, ALLOWED_MIME_TYPES } = require('../config/constants')
const store = require('../storage/videoStore')
const controller = require('../controllers/upload')

const router = express.Router()

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    // Create the session dir up front (side effect during multipart parse) and
    // stash the id/dir for the handler. createVideoDir() owns the uuid + mkdir.
    const { id, dir } = store.createVideoDir()
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

router.post('/', upload.single('video'), controller.upload)

// Handle multer errors (file too large, wrong type, etc.)
router.use(controller.handleUploadError)

module.exports = router
