import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { RENDER_POLL_MS, createRenderTracker, isBusy } from '../../src/smartcrop/core/renderTracker.js'
import { deferred, makeTimers, settle } from './helpers/timers.js'

const render = (status, extra = {}) => ({ renderId: 'rnd_1', status, ...extra })
const apiError = (status, code, details = null) =>
  Object.assign(new Error(`${code} message`), { status, code, details })

let timers, states, errors, calls, responses, tracker

// `responses.get` is a queue of { render } | Error, consumed per poll.
beforeEach(() => {
  timers = makeTimers()
  states = []
  errors = []
  calls = { create: [], get: [], cancel: [] }
  responses = { create: { render: render('QUEUED') }, get: [], cancel: { render: render('CANCELLED') } }
  const reply = (r) => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r))
  tracker = createRenderTracker({
    api: {
      create: (v) => { calls.create.push(v); return reply(responses.create) },
      get: (id) => { calls.get.push(id); return reply(responses.get.shift() ?? { render: render('RENDERING') }) },
      cancel: (id) => { calls.cancel.push(id); return reply(responses.cancel) },
    },
    onChange: (s) => states.push(s),
    onError: (e) => errors.push(e),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })
})

const last = () => states.at(-1)

async function poll() {
  timers.advance(RENDER_POLL_MS)
  await settle()
}

describe('createRenderTracker', () => {
  it('start: POST with the edit version, then rendering', async () => {
    tracker.start(4)
    assert.equal(last().phase, 'starting')
    await settle()
    assert.deepEqual(calls.create, [4])
    assert.equal(last().phase, 'rendering')
    assert.equal(last().render.status, 'QUEUED')
  })

  it('polls every 5 s until the render finishes', async () => {
    responses.get = [{ render: render('RENDERING', { stage: 'ENCODING' }) }, { render: render('SUCCEEDED', { output: { url: 'u' } }) }]
    tracker.start(1)
    await settle()
    timers.advance(RENDER_POLL_MS - 1)
    await settle()
    assert.equal(calls.get.length, 0)

    await poll()
    assert.equal(last().render.stage, 'ENCODING')
    await poll()
    assert.equal(last().phase, 'succeeded')
    assert.equal(last().render.output.url, 'u')
    assert.equal(timers.pending, 0) // stopped
  })

  it('shows the render error message when it fails', async () => {
    responses.get = [{ render: render('FAILED', { error: { code: 'RENDER_FAILED', message: "We couldn't create the video." } }) }]
    tracker.start(1)
    await settle()
    await poll()
    assert.equal(last().phase, 'failed')
    assert.equal(last().error.message, "We couldn't create the video.")
  })

  it('attaches to the running render on 409 RENDER_IN_PROGRESS', async () => {
    responses.create = apiError(409, 'RENDER_IN_PROGRESS', { renderId: 'rnd_1' })
    tracker.start(1)
    await settle()
    assert.equal(last().phase, 'rendering')
    timers.advance(0)
    await settle()
    assert.deepEqual(calls.get, ['rnd_1'])
    assert.deepEqual(errors, [])
  })

  it('reports other start errors and ends failed', async () => {
    responses.create = apiError(409, 'EDIT_VERSION_CONFLICT', { currentVersion: 5 })
    tracker.start(4)
    await settle()
    assert.equal(last().phase, 'failed')
    assert.equal(last().error.message, 'EDIT_VERSION_CONFLICT message')
    assert.equal(errors[0].code, 'EDIT_VERSION_CONFLICT')
  })

  it('ignores Save while a render is starting or running', async () => {
    tracker.start(1)
    tracker.start(1)
    await settle()
    tracker.start(1)
    assert.deepEqual(calls.create, [1])
  })

  it('can start again after a render finished', async () => {
    responses.get = [{ render: render('SUCCEEDED') }]
    tracker.start(1)
    await settle()
    await poll()
    responses.create = { render: { renderId: 'rnd_2', status: 'QUEUED' } }
    tracker.start(2)
    await settle()
    assert.equal(last().render.renderId, 'rnd_2')
    assert.equal(last().phase, 'rendering')
  })

  it('attach() resumes a render after reload, polling at once', async () => {
    tracker.attach('rnd_1')
    assert.equal(last().phase, 'rendering')
    timers.advance(0)
    await settle()
    assert.deepEqual(calls.get, ['rnd_1'])
  })

  it('keeps polling through network errors', async () => {
    responses.get = [apiError(0, 'NETWORK_ERROR'), { render: render('SUCCEEDED') }]
    tracker.start(1)
    await settle()
    await poll()
    assert.equal(last().phase, 'rendering')
    await poll()
    assert.equal(last().phase, 'succeeded')
  })

  it('stops following a render that 404s', async () => {
    responses.get = [apiError(404, 'RENDER_NOT_FOUND')]
    tracker.attach('rnd_1')
    timers.advance(0)
    await settle()
    assert.equal(last().phase, 'idle')
    assert.equal(timers.pending, 0)
  })

  it('cancel() → CANCELLED and polling stops', async () => {
    tracker.start(1)
    await settle()
    await tracker.cancel()
    assert.deepEqual(calls.cancel, ['rnd_1'])
    assert.equal(last().phase, 'cancelled')
    assert.equal(timers.pending, 0)
  })

  it('cancel() racing a finish (409) polls to learn the outcome', async () => {
    responses.cancel = apiError(409, 'INVALID_STATE', { status: 'SUCCEEDED' })
    responses.get = [{ render: render('SUCCEEDED') }]
    tracker.start(1)
    await settle()
    await tracker.cancel()
    timers.advance(0)
    await settle()
    assert.equal(last().phase, 'succeeded')
    assert.deepEqual(errors, [])
  })

  it('a stale poll cannot undo a finished state', async () => {
    const slow = deferred()
    tracker.start(1)
    await settle()
    // Poll goes out, then cancel lands first.
    responses.get = [slow.promise]
    timers.advance(RENDER_POLL_MS)
    await tracker.cancel()
    slow.resolve({ render: render('RENDERING') })
    await settle()
    assert.equal(last().phase, 'cancelled')
  })

  it('refresh() re-fetches a finished render (fresh output URLs)', async () => {
    responses.get = [{ render: render('SUCCEEDED', { output: { url: 'old' } }) }, { render: render('SUCCEEDED', { output: { url: 'new' } }) }]
    tracker.start(1)
    await settle()
    await poll()
    await tracker.refresh()
    assert.equal(last().phase, 'succeeded')
    assert.equal(last().render.output.url, 'new')
    assert.equal(timers.pending, 0)
  })

  it('dispose() stops polling and updates', async () => {
    tracker.start(1)
    await settle()
    tracker.dispose()
    const count = states.length
    await poll()
    assert.equal(calls.get.length, 0)
    assert.equal(states.length, count)
  })

  it('isBusy covers starting and rendering only', () => {
    assert.equal(isBusy('starting'), true)
    assert.equal(isBusy('rendering'), true)
    for (const phase of ['idle', 'succeeded', 'failed', 'cancelled']) assert.equal(isBusy(phase), false)
  })
})
