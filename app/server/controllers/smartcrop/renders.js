const { E } = require('../../lib/apiError')
const renderService = require('../../services/smartcrop/renderService')
const { validateProjectId, validateRenderId } = require('../../validators/smartcrop/common')
const { validateCreateRenderBody, validateRenderListQuery } = require('../../validators/smartcrop/renders')

function checkIds(req, { render = false } = {}) {
  const issues = [
    ...validateProjectId(req.params.projectId),
    ...(render ? validateRenderId(req.params.renderId) : []),
  ]
  if (issues.length) throw E.validation(issues)
}

// POST /projects/:projectId/renders  { editVersion? } — Save
async function create(req, res) {
  checkIds(req)
  const { value, issues } = validateCreateRenderBody(req.body)
  if (issues.length) throw E.validation(issues)
  const { location, render } = await renderService.createRender(req.params.projectId, value)
  res.status(202).location(location).json({ render })
}

// GET /projects/:projectId/renders
async function list(req, res) {
  checkIds(req)
  const { value, issues } = validateRenderListQuery(req.query)
  if (issues.length) throw E.validation(issues)
  res.json(await renderService.listRenders(req.params.projectId, value))
}

// GET /projects/:projectId/renders/:renderId
async function get(req, res) {
  checkIds(req, { render: true })
  res.json(await renderService.getRender(req.params.projectId, req.params.renderId))
}

// GET /projects/:projectId/renders/:renderId/download → 302
async function download(req, res) {
  checkIds(req, { render: true })
  const url = await renderService.downloadUrl(req.params.projectId, req.params.renderId)
  res.set('Cache-Control', 'no-store').redirect(302, url)
}

// POST /projects/:projectId/renders/:renderId/cancel
async function cancel(req, res) {
  checkIds(req, { render: true })
  res.json(await renderService.cancelRender(req.params.projectId, req.params.renderId))
}

module.exports = { create, list, get, download, cancel }
