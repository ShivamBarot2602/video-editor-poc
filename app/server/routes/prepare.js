const express = require('express')
const controller = require('../controllers/prepare')

const router = express.Router()

router.post('/:id', controller.prepare)

module.exports = router
