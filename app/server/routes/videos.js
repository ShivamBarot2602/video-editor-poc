const express = require('express')
const controller = require('../controllers/videos')

const router = express.Router()

// GET /api/videos — list all video sessions with metadata
router.get('/', controller.list)

// GET /api/videos/:id — single video's metadata
router.get('/:id', controller.get)

module.exports = router
