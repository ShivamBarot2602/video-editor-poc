const express = require('express')
const controller = require('../controllers/media')

const router = express.Router()

router.get('/:id', controller.serveOriginal)
router.get('/:id/burned', controller.serveBurned)
router.get('/:id/clip/:clipId', controller.serveClip)
router.get('/:id/thumbnail', controller.thumbnail)

module.exports = router
