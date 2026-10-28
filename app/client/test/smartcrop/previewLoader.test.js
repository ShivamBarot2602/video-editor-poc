import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PREVIEW_CACHE_SIZE, createPreviewLoader, previewKey } from '../../src/smartcrop/core/previewLoader.js'
import { identityEdit } from '../../src/smartcrop/core/editList.js'
import { deferred, makeTimers, settle } from './helpers/timers.js'

const DURATION = 60000
const doc = (aspect, layout = 'fill') => identityEdit(DURATION, aspect, layout)

const previewFor = (d) => ({ previewId: `${d.aspect}-${d.defaultLayout}`, plan: { url: `https://s3/${d.aspect}-${d.defaultLayout}.json` }, warnings: [] })
const planFor = (url) => ({ url })

const busy = (retryAfterMs) => Object.assign(new Error('busy'), { code: 'PREVIEW_BUSY', details: { retryAfterMs } })
const failed = () => Object.assign(new Error("We couldn't build a preview for this edit."), { code: 'PREVIEW_FAILED' })

let timers, calls, states, errors, api, loader

beforeEach(() => {
  timers = makeTimers()
  calls = { preview: [], plan: [] }
  states = []
  errors = []
  api = {
    requestPreview: async (d) => { calls.preview.push(d.aspect); return previewFor(d) },
    fetchPlan: async (url) => { calls.plan.push(url); return planFor(url) },
  }
  loader = createPreviewLoader({
    api: { requestPreview: (...a) => api.requestPreview(...a), fetchPlan: (...a) => api.fetchPlan(...a) },
    onChange: (s) => states.push(s),
    onError: (e) => errors.push(e),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })
})

const last = () => states.at(-1)

describe('previewKey', () => {
  it('ignores clip ids but not ranges, layouts or options', () => {
    const a = doc('9:16')
    const renamed = { ...a, clips: [{ ...a.clips[0], id: 'other' }] }
    assert.equal(previewKey(a), previewKey(renamed))
    assert.notEqual(previewKey(a), previewKey(doc('9:16', 'split')))
    assert.notEqual(previewKey(a), previewKey({ ...a, options: { ...a.options, background: 'black' } }))
  })
})

describe('createPreviewLoader', () => {
  it('debounces 400 ms, then requests the preview and its plan', async () => {
    loader.load(doc('1:1'))
    assert.equal(last().pending, true)
    timers.advance(399)
    assert.deepEqual(calls.preview, [])

    timers.advance(1)
    await settle()
    assert.deepEqual(calls.preview, ['1:1'])
    assert.deepEqual(last(), { preview: previewFor(doc('1:1')), plan: planFor('https://s3/1:1-fill.json'), pending: false })
  })

  it('collapses rapid changes into one request for the last one', async () => {
    loader.load(doc('1:1'))
    timers.advance(200)
    loader.load(doc('4:5'))
    timers.advance(200)
    loader.load(doc('16:9'))
    timers.advance(400)
    await settle()
    assert.deepEqual(calls.preview, ['16:9'])
  })

  it('loads immediately when asked (editor opened without a preview)', async () => {
    loader.load(doc('9:16'), { immediate: true })
    timers.advance(0)
    await settle()
    assert.deepEqual(calls.preview, ['9:16'])
  })

  it('drops a late result once a newer change has started', async () => {
    const slow = deferred()
    api.requestPreview = async (d, { signal }) => {
      calls.preview.push(d.aspect)
      if (d.aspect === '1:1') return slow.promise
      return previewFor(d)
    }

    loader.load(doc('1:1'))
    timers.advance(400)
    await settle()
    loader.load(doc('16:9'))
    timers.advance(400)
    await settle()
    slow.resolve(previewFor(doc('1:1'))) // arrives last

    await settle()
    assert.equal(last().preview.previewId, '16:9-fill')
  })

  it('aborts the superseded request', async () => {
    let signal
    api.requestPreview = (d, opts) => { signal = opts.signal; return deferred().promise }
    loader.load(doc('1:1'))
    timers.advance(400)
    loader.load(doc('16:9'))
    assert.equal(signal.aborted, true)
  })

  it('retries after retryAfterMs on PREVIEW_BUSY', async () => {
    let attempts = 0
    api.requestPreview = async (d) => {
      attempts++
      if (attempts === 1) throw busy(1000)
      return previewFor(d)
    }
    loader.load(doc('1:1'))
    timers.advance(400)
    await settle()
    assert.equal(attempts, 1)
    assert.equal(last().pending, true) // still waiting
    assert.deepEqual(errors, [])

    timers.advance(1000)
    await settle()
    assert.equal(attempts, 2)
    assert.equal(last().preview.previewId, '1:1-fill')
  })

  it('keeps the current plan and reports other errors', async () => {
    loader.load(doc('9:16'), { immediate: true })
    timers.advance(0)
    await settle()
    const shown = last().plan

    api.requestPreview = async () => { throw failed() }
    loader.load(doc('1:1'))
    timers.advance(400)
    await settle()
    assert.equal(last().plan, shown)
    assert.equal(last().pending, false)
    assert.equal(errors[0].code, 'PREVIEW_FAILED')
  })

  it('reports a failed plan download the same way', async () => {
    api.fetchPlan = async () => { throw Object.assign(new Error('403'), { status: 403 }) }
    loader.load(doc('1:1'), { immediate: true })
    timers.advance(0)
    await settle()
    assert.equal(errors.length, 1)
    assert.equal(last().pending, false)
  })

  it('serves a previously loaded preview from cache, instantly', async () => {
    loader.load(doc('9:16'), { immediate: true })
    timers.advance(0)
    await settle()
    loader.load(doc('1:1'), { immediate: true })
    timers.advance(0)
    await settle()

    loader.load(doc('9:16'))
    assert.equal(last().pending, false)
    assert.equal(last().preview.previewId, '9:16-fill')
    assert.equal(timers.pending, 0)
    assert.deepEqual(calls.preview, ['9:16', '1:1'])
  })

  it('a cache hit cancels a debounced request still waiting', async () => {
    loader.load(doc('9:16'), { immediate: true })
    timers.advance(0)
    await settle()
    loader.load(doc('1:1')) // debounce running
    loader.load(doc('9:16')) // back before it fires
    timers.advance(400)
    await settle()
    assert.deepEqual(calls.preview, ['9:16'])
    assert.equal(last().preview.previewId, '9:16-fill')
  })

  it(`keeps at most ${PREVIEW_CACHE_SIZE} plans`, async () => {
    const layouts = ['fill', 'fit', 'split', 'three', 'four']
    const docs = [...layouts.map((l) => doc('9:16', l)), doc('1:1'), doc('16:9')]
    for (const d of docs) {
      loader.load(d, { immediate: true })
      timers.advance(0)
      await settle()
    }
    loader.load(docs[0]) // evicted (oldest)
    assert.equal(last().pending, true)
    loader.load(docs[1]) // still cached
    assert.equal(last().pending, false)
  })

  it('show() uses a preview the server already returned, without POST', async () => {
    const d = doc('9:16')
    loader.show({ ...previewFor(d), previewId: 'initial' }, d)
    await settle()
    assert.deepEqual(calls.preview, [])
    assert.deepEqual(calls.plan, ['https://s3/9:16-fill.json'])
    assert.equal(last().preview.previewId, 'initial')
  })

  it('dispose() stops pending work', async () => {
    loader.load(doc('1:1'))
    loader.dispose()
    timers.advance(400)
    await settle()
    assert.deepEqual(calls.preview, [])
  })
})
