const express = require('express')
const controller = require('../controllers/clips')

const router = express.Router()

// Order matters: /:id/saved is declared before /:id/:suggestProvider so "saved"
// isn't matched as a provider.
router.post('/:id/suggest', controller.suggest)
router.get('/:id/saved', controller.listSaved)
router.post('/:id/saved', controller.saveClip)
router.delete('/:id/saved/:savedId', controller.deleteSaved)
router.get('/:id/:suggestProvider', controller.getSuggestions)
router.get('/:id/export/stream', controller.exportStream)
router.get('/:id/suggest/stream', controller.suggestStream)
router.get('/:id/thumb/:clipId/:n', controller.serveThumb)

module.exports = router
