const express = require('express')
const controller = require('../controllers/transcription')

const router = express.Router()

router.get('/:id/:provider', controller.get)
router.patch('/:id/:provider', controller.patch)
router.post('/:id/:provider/ass', controller.downloadAss)
router.get('/:id/:provider/:format', controller.download)

module.exports = router
