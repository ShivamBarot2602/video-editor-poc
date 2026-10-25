/**
 * Shared test harness: fake AWS (S3 + DynamoDB in memory, Step Functions and
 * Lambda as per-test stubs), an Express app with only the smartcrop router
 * (auth is index.js's job), fixtures from real pipeline output, and builders
 * for projects in each state.
 *
 * Usage (first lines of a test file):
 *   require('./helpers/env')
 *   const h = require('./helpers/harness')
 */

const fs = require('fs')
const path = require('path')
const express = require('express')
const request = require('supertest')
const { mockClient } = require('aws-sdk-client-mock')
const {
  SFNClient, StartExecutionCommand, DescribeExecutionCommand, GetExecutionHistoryCommand, StopExecutionCommand,
} = require('@aws-sdk/client-sfn')
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda')

const { createFakeDynamo } = require('./fakeDynamo')
const { createFakeS3 } = require('./fakeS3')

const ddb = createFakeDynamo()
const s3 = createFakeS3()
const sfnMock = mockClient(SFNClient)
const lambdaMock = mockClient(LambdaClient)

const sc = require('../../../config/smartcrop')
const { newProjectId, newRenderId } = require('../../../lib/ids')
const ffmpeg = require('../../../lib/ffmpeg')
const { smartcrop: store } = require('../../../storage/videoStore')
const { identityEdit } = require('../../../validators/smartcrop/editDocument')
const statusSync = require('../../../services/smartcrop/statusSync')
const previewService = require('../../../services/smartcrop/previewService')

const app = express()
app.use('/api/smartcrop', require('../../../routes/smartcrop'))
const api = () => request(app)
const BASE = '/api/smartcrop'

const T = { projects: 'smartcrop-api-projects', renders: 'smartcrop-api-renders', jobs: 'pipeline-jobs' }
const B = { in: 'sc-in', jobs: 'sc-jobs', out: 'sc-out' }

// ─── fixtures (trimmed from real pipeline output) ───────────────────────────

const FIX = path.join(__dirname, '..', 'fixtures')
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf-8'))

// Real plans.json rewritten to point at this project's JOBS keys.
function manifestFor(p, dirKey, plans) {
  const base = fixture('plans.json')
  return {
    ...base,
    analysis: `s3://${B.jobs}/${p}/analysis.npz`,
    decision: `s3://${B.jobs}/${p}/decision.json`,
    plans: plans.map(pl => ({
      ...base.plans[0],
      aspect: pl.aspect,
      layout: pl.layout,
      name: `${pl.aspect.replace(':', 'x')}_${pl.layout}`,
      path: `s3://${B.jobs}/${dirKey}/${pl.aspect.replace(':', 'x')}_${pl.layout}.plan.json`,
      canvas: pl.canvas || base.plans[0].canvas,
      frames: pl.frames ?? base.plans[0].frames,
      layout_frames: pl.layout_frames || { [pl.layout]: pl.frames ?? base.plans[0].frames },
    })),
  }
}

// Initial-plan + analysis artifacts a finished processing run leaves in JOBS.
function seedProcessingOutputs(p, { aspect = '9:16', layout = 'fill' } = {}) {
  const name = `${aspect.replace(':', 'x')}_${layout}`
  s3.putJson(B.jobs, `${p}/plans/plans.json`, manifestFor(p, `${p}/plans`, [{ aspect, layout, canvas: { width: 1080, height: 1920 } }]))
  s3.putJson(B.jobs, `${p}/plans/${name}.plan.json`, fixture('9x16_split.plan.json'))
  s3.putJson(B.jobs, `${p}/decision.json`, fixture('decision.json'))
  s3.putJson(B.jobs, `${p}/media.json`, fixture('media.json'))
  s3.putBytes(B.jobs, `${p}/audio_mfcc.npy`, 10)
  s3.putBytes(B.jobs, `${p}/analysis.npz`, 10)
}

// ─── project builders ───────────────────────────────────────────────────────

const iso = (msFromNow = 0) => new Date(Date.now() + msFromNow).toISOString()
const DURATION_MS = 63000

function baseProject(over = {}) {
  const projectId = over.projectId || newProjectId()
  return {
    projectId,
    listPk: 'P',
    title: 'Podcast EP12',
    status: 'UPLOADING',
    createdAt: iso(),
    updatedAt: iso(),
    source: {
      key: `${projectId}/source.mp4`, ext: 'mp4', fileName: 'Podcast EP12.mp4', contentType: 'video/mp4', sizeBytes: 10582938,
      durationMs: null, width: null, height: null, fps: null, hasAudio: null, videoCodec: null,
    },
    upload: { s3UploadId: 'up-x', partSizeBytes: 16777216, partCount: 1, expiresAt: iso(24 * 3600e3), completedAt: null },
    initial: { aspect: '9:16', layout: 'fill' },
    processing: null,
    edit: null,
    analysis: null,
    lastRenderId: null,
    lastSyncedAt: null,
    ...over,
  }
}

const probedSource = (projectId) => ({
  key: `${projectId}/source.mp4`, ext: 'mp4', fileName: 'Podcast EP12.mp4', contentType: 'video/mp4', sizeBytes: 10582938,
  durationMs: DURATION_MS, width: 1280, height: 720, fps: 25, hasAudio: true, videoCodec: 'h264',
})

const execArn = (name) => `arn:aws:states:us-east-1:123456789012:execution:smartcrop:${name}`

function processingProject(over = {}) {
  const projectId = over.projectId || newProjectId()
  return baseProject({
    projectId,
    status: 'PROCESSING',
    source: probedSource(projectId),
    upload: { s3UploadId: 'up-x', partSizeBytes: 16777216, partCount: 1, expiresAt: iso(24 * 3600e3), completedAt: iso(-1000) },
    processing: { executionArn: execArn(`${projectId}-process-1`), attempt: 1, stage: 'QUEUED', startedAt: iso(-60000), finishedAt: null, error: null },
    ...over,
  })
}

function readyProject(over = {}) {
  const projectId = over.projectId || newProjectId()
  const p = processingProject({ projectId })
  return {
    ...p,
    status: 'READY',
    processing: { ...p.processing, stage: null, finishedAt: iso(-1000) },
    analysis: { snapPointsMs: [0, 23880], peopleCount: 47 },
    edit: { version: 1, updatedAt: iso(-1000), document: identityEdit({ aspect: '9:16', layout: 'fill', durationMs: DURATION_MS }) },
    ...over,
  }
}

function failedProject(over = {}) {
  const projectId = over.projectId || newProjectId()
  const p = processingProject({ projectId })
  return {
    ...p,
    status: 'FAILED',
    processing: {
      ...p.processing, stage: null, finishedAt: iso(-1000),
      error: { code: 'ANALYZE_FAILED', message: 'x', failedStage: 'ANALYZE' },
      ...(over.processing || {}),
    },
    ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'processing')),
  }
}

function render(projectId, over = {}) {
  const renderId = over.renderId || newRenderId()
  return {
    projectId,
    renderId,
    status: 'QUEUED',
    stage: 'PLANNING',
    editVersion: 1,
    aspect: '9:16',
    defaultLayout: 'fill',
    layouts: ['fill'],
    outputDurationMs: DURATION_MS,
    executionArn: execArn(`${renderId}-render`),
    createdAt: iso(-5000),
    startedAt: iso(-5000),
    finishedAt: null,
    lastSyncedAt: null,
    output: null,
    error: null,
    ...over,
  }
}

const putProject = (item) => { ddb.put(T.projects, item); return item }
const getProject = (projectId) => ddb.get(T.projects, { projectId })
const putRender = (item) => { ddb.put(T.renders, item); return item }
const getRender = (projectId, renderId) => ddb.get(T.renders, { projectId, renderId })

// ─── Step Functions helpers ─────────────────────────────────────────────────

function describeAs(status, extra = {}) {
  sfnMock.on(DescribeExecutionCommand).callsFake((i) => ({ executionArn: i.executionArn, status, startDate: new Date(Date.now() - 60000), stopDate: status === 'RUNNING' ? undefined : new Date(), ...extra }))
}
function historyState(name) {
  sfnMock.on(GetExecutionHistoryCommand).resolves({
    events: name ? [{ type: 'TaskStateEntered', stateEnteredEventDetails: { name } }, { type: 'ExecutionStarted' }] : [{ type: 'ExecutionStarted' }],
  })
}
function startOk() {
  sfnMock.on(StartExecutionCommand).callsFake((i) => ({ executionArn: execArn(i.name), startDate: new Date() }))
}
const startCalls = () => sfnMock.commandCalls(StartExecutionCommand).map(c => ({ name: c.args[0].input.name, input: JSON.parse(c.args[0].input.input) }))
const stopCalls = () => sfnMock.commandCalls(StopExecutionCommand).map(c => c.args[0].input)

// ─── Lambda helpers ─────────────────────────────────────────────────────────

const lambdaPayload = (obj) => ({ StatusCode: 200, Payload: Buffer.from(JSON.stringify(obj)) })
const invokeCalls = () => lambdaMock.commandCalls(InvokeCommand).map(c => JSON.parse(Buffer.from(c.args[0].input.Payload).toString()))

// Make the Plan Lambda "succeed" by writing a manifest + plan into the preview dir it was given.
function planLambdaWrites({ layoutFrames, frames = 1501, delayMs = 0 } = {}) {
  lambdaMock.on(InvokeCommand).callsFake(async (input) => {
    const event = JSON.parse(Buffer.from(input.Payload).toString())
    const args = event.args
    const outDir = args[args.lastIndexOf('--out-dir') + 1].replace(`s3://${B.jobs}/`, '')
    const aspect = args[args.indexOf('--aspect') + 1]
    const layout = args[args.indexOf('--layout') + 1]
    const p = outDir.split('/')[0]
    if (delayMs) await new Promise(r => setTimeout(r, delayMs))
    const manifest = manifestFor(p, outDir, [{ aspect, layout, frames, layout_frames: layoutFrames || { [layout]: frames } }])
    s3.putJson(B.jobs, `${outDir}/plans.json`, manifest)
    s3.putJson(B.jobs, `${outDir}/${aspect.replace(':', 'x')}_${layout}.plan.json`, fixture('9x16_split.plan.json'))
    return lambdaPayload({ stage: 'plan', manifest: `s3://${B.jobs}/${outDir}/plans.json`, plans: manifest.plans.map(pl => ({ name: pl.name, path: pl.path, aspect, layout })), skipped: [] })
  })
}

// ─── probe stub ─────────────────────────────────────────────────────────────

const realProbe = ffmpeg.probe
function probeReturns(json) { ffmpeg.probe = async () => json }
function probeThrows(code = 'PROBE_FAILED') { ffmpeg.probe = async () => { const e = new Error('probe'); e.code = code; throw e } }

function ffprobeJson({ width = 1920, height = 1080, duration = '63.0', format = 'mov,mp4,m4a,3gp,3g2,mj2', rotation, rotateTag, avg = '25/1', r = '25/1', audio = true, attachedPicOnly = false } = {}) {
  const video = {
    codec_type: 'video', codec_name: 'h264', width, height, avg_frame_rate: avg, r_frame_rate: r,
    disposition: { attached_pic: attachedPicOnly ? 1 : 0 },
    ...(rotation != null ? { side_data_list: [{ side_data_type: 'Display Matrix', rotation }] } : {}),
    ...(rotateTag != null ? { tags: { rotate: String(rotateTag) } } : {}),
  }
  return {
    format: { format_name: format, duration },
    streams: [video, ...(audio ? [{ codec_type: 'audio', codec_name: 'aac' }] : [])],
  }
}

// ─── reset ──────────────────────────────────────────────────────────────────

function reset() {
  ddb.reset()
  s3.reset()
  sfnMock.reset()
  lambdaMock.reset()
  startOk()
  describeAs('RUNNING')
  historyState(null)
  sfnMock.on(StopExecutionCommand).resolves({ stopDate: new Date() })
  ffmpeg.probe = realProbe
  statusSync._inflight.clear()
  previewService._inflight.clear()
}

// Assert the error envelope; returns details.
function expectError(assert, res, status, code) {
  assert.equal(res.status, status, `expected ${status} ${code}, got ${res.status} ${JSON.stringify(res.body)}`)
  assert.equal(res.body?.error?.code, code)
  assert.equal(typeof res.body.error.message, 'string')
  assert.ok('details' in res.body.error)
  return res.body.error.details
}

module.exports = {
  api, BASE, app, ddb, s3, sfnMock, lambdaMock, sc, store, T, B, DURATION_MS,
  fixture, manifestFor, seedProcessingOutputs,
  baseProject, processingProject, readyProject, failedProject, render, probedSource, execArn,
  putProject, getProject, putRender, getRender,
  describeAs, historyState, startOk, startCalls, stopCalls,
  lambdaPayload, invokeCalls, planLambdaWrites,
  probeReturns, probeThrows, ffprobeJson,
  reset, expectError, iso,
  Commands: { StartExecutionCommand, DescribeExecutionCommand, GetExecutionHistoryCommand, StopExecutionCommand, InvokeCommand },
}
