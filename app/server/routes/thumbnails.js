const express = require('express')
const controller = require('../controllers/thumbnails')

const router = express.Router()

router.get('/:videoId', controller.get)
router.patch('/:videoId', controller.patch)
router.get('/:videoId/file/:relpath', controller.serveFile)
router.get('/:videoId/stream', controller.stream)

module.exports = router
