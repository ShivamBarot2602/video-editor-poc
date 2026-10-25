const { E } = require('../../lib/apiError')
const projectService = require('../../services/smartcrop/projectService')
const { validateProjectId, validateEmptyBody } = require('../../validators/smartcrop/common')
const { validateProjectListQuery } = require('../../validators/smartcrop/projects')

function checkId(req) {
  const issues = validateProjectId(req.params.projectId)
  if (issues.length) throw E.validation(issues)
}

// GET /projects
async function list(req, res) {
  const { value, issues } = validateProjectListQuery(req.query)
  if (issues.length) throw E.validation(issues)
  res.json(await projectService.list(value))
}

// GET /projects/:projectId
async function get(req, res) {
  checkId(req)
  res.json(await projectService.get(req.params.projectId))
}

// GET /projects/:projectId/editor
async function editor(req, res) {
  checkId(req)
  res.json(await projectService.editor(req.params.projectId))
}

// POST /projects/:projectId/retry  ({} allowed, nothing else)
async function retry(req, res) {
  checkId(req)
  const { issues } = validateEmptyBody(req.body)
  if (issues.length) throw E.validation(issues)
  res.status(202).json(await projectService.retry(req.params.projectId))
}

// DELETE /projects/:projectId
async function remove(req, res) {
  checkId(req)
  const out = await projectService.remove(req.params.projectId)
  if (out.status === 204) return res.status(204).end()
  res.status(out.status).json(out.body)
}

module.exports = { list, get, editor, retry, remove }
