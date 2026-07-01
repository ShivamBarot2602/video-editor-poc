const express = require('express')
const controller = require('../controllers/upload')

const router = express.Router()

// Browser uploads directly to S3 via a presigned POST — the server never proxies
// the bytes. Two JSON steps bracket the direct upload:
//   POST /api/upload/presign   → { videoId, url, fields }
//   POST /api/upload/complete  → { videoId, filename, size }
router.post('/presign', controller.presign)
router.post('/complete', controller.complete)

module.exports = router
