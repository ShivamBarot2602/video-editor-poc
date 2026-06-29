const express = require('express')
const controller = require('../controllers/burn')

const router = express.Router()

router.post('/:id', controller.burn)

module.exports = router
