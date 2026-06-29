const express = require('express')
const controller = require('../controllers/transcribe')

const router = express.Router()

router.post('/:id', controller.run)

module.exports = router
