const sc = require('../../config/smartcrop')
const { E } = require('../../lib/apiError')
const uploadService = require('../../services/smartcrop/uploadService')
const { validateProjectId } = require('../../validators/smartcrop/common')
const { validateCreateUpload, validatePartsBody, validateCompleteBody } = require('../../validators/smartcrop/uploads')

function checkId(req) {
  const issues = validateProjectId(req.params.projectId)
  if (issues.length) throw E.validation(issues)
}

// POST /uploads — create project + multipart upload
async function create(req, res) {
  const { value, issues, error } = validateCreateUpload(req.body, { maxBytes: sc.uploadMaxBytes })
  if (issues.length) throw E.validation(issues)
  if (error?.kind === 'UNSUPPORTED_VIDEO_TYPE') throw E.unsupportedVideoType(error.allowed)
  if (error?.kind === 'FILE_TOO_LARGE') throw E.fileTooLarge(error.maxBytes)
  if (error?.kind === 'LAYOUT_NOT_SUPPORTED') throw E.layoutNotSupported(error.aspect, error.layout, error.supported)
  res.status(201).json(await uploadService.createUpload(value))
}

// POST /uploads/:projectId/parts — refresh / resume part URLs
async function parts(req, res) {
  checkId(req)
  const { value, issues } = validatePartsBody(req.body)
  if (issues.length) throw E.validation(issues)
  res.json(await uploadService.refreshParts(req.params.projectId, value))
}

// POST /uploads/:projectId/complete — assemble, validate, start processing
async function complete(req, res) {
  checkId(req)
  const { value, issues } = validateCompleteBody(req.body)
  if (issues.length) throw E.validation(issues)
  res.json(await uploadService.completeUpload(req.params.projectId, value))
}

// DELETE /uploads/:projectId — cancel an upload
async function abort(req, res) {
  checkId(req)
  await uploadService.abortUpload(req.params.projectId)
  res.status(204).end()
}

module.exports = { create, parts, complete, abort }
