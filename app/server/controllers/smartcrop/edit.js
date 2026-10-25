const { E } = require('../../lib/apiError')
const editService = require('../../services/smartcrop/editService')
const previewService = require('../../services/smartcrop/previewService')
const { validateProjectId } = require('../../validators/smartcrop/common')
const { validatePutEditBody, validatePreviewBody } = require('../../validators/smartcrop/edit')

function checkId(req) {
  const issues = validateProjectId(req.params.projectId)
  if (issues.length) throw E.validation(issues)
}

// GET /projects/:projectId/edit
async function get(req, res) {
  checkId(req)
  res.json(await editService.getEdit(req.params.projectId))
}

// PUT /projects/:projectId/edit  { document }
async function put(req, res) {
  checkId(req)
  const { value, issues } = validatePutEditBody(req.body)
  if (issues.length) throw E.validation(issues)
  res.json(await editService.putEdit(req.params.projectId, value))
}

// POST /projects/:projectId/preview-plan  { document } | { editVersion }
async function previewPlan(req, res) {
  checkId(req)
  const { value, issues } = validatePreviewBody(req.body)
  if (issues.length) throw E.validation(issues)
  res.json(await previewService.previewPlan(req.params.projectId, value))
}

module.exports = { get, put, previewPlan }
