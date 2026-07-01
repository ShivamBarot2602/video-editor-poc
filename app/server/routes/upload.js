const express = require('express')
const controller = require('../controllers/upload')

const router = express.Router()

// Browser uploads directly to S3 via presigned URL(s) — the server never
// proxies the bytes. Three JSON endpoints bracket the direct upload:
//   POST /api/upload/presign   → { videoId, key, mode: 'single', url }
//                              | { videoId, key, mode: 'multipart', uploadId, partSize, parts }
//   POST /api/upload/complete  → { videoId, filename, size }
//   POST /api/upload/abort     → cleanup after a failed multipart upload
router.post('/presign', controller.presign)
router.post('/complete', controller.complete)
router.post('/abort', controller.abort)

module.exports = router
