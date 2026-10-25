/**
 * SmartCrop API — mounted at /api/smartcrop by index.js (behind requireAuth,
 * before the app-wide express.json() so this router owns its body limit and
 * error envelope). Spec: .claude/spec/00–04.
 */

const express = require('express')
const { asyncHandler: h, errorMiddleware, E } = require('../lib/apiError')
const uploads = require('../controllers/smartcrop/uploads')
const projects = require('../controllers/smartcrop/projects')
const edit = require('../controllers/smartcrop/edit')
const renders = require('../controllers/smartcrop/renders')

const router = express.Router()

// 1 MiB body cap (PUT /edit, 03 §3); strict = JSON objects/arrays only.
router.use(express.json({ limit: '1mb', strict: true }))

// 01 Upload
router.post('/uploads', h(uploads.create))
router.post('/uploads/:projectId/parts', h(uploads.parts))
router.post('/uploads/:projectId/complete', h(uploads.complete))
router.delete('/uploads/:projectId', h(uploads.abort))

// 02 Projects
router.get('/projects', h(projects.list))
router.get('/projects/:projectId', h(projects.get))
router.get('/projects/:projectId/editor', h(projects.editor))
router.post('/projects/:projectId/retry', h(projects.retry))
router.delete('/projects/:projectId', h(projects.remove))

// 03 Editing
router.get('/projects/:projectId/edit', h(edit.get))
router.put('/projects/:projectId/edit', h(edit.put))
router.post('/projects/:projectId/preview-plan', h(edit.previewPlan))

// 04 Rendering
router.post('/projects/:projectId/renders', h(renders.create))
router.get('/projects/:projectId/renders', h(renders.list))
router.get('/projects/:projectId/renders/:renderId', h(renders.get))
router.get('/projects/:projectId/renders/:renderId/download', h(renders.download))
router.post('/projects/:projectId/renders/:renderId/cancel', h(renders.cancel))

router.use((_req, _res, next) => next(E.routeNotFound()))
router.use(errorMiddleware)

module.exports = router
