const express = require('express')
const controller = require('../controllers/videos')

const router = express.Router()

// GET /api/videos — list all video sessions with metadata
router.get('/', controller.list)

module.exports = router
