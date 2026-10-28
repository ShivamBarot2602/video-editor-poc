import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_PART_RETRIES,
  completeParts,
  contentTypeFor,
  createByteProgress,
  isSupportedFile,
  partRange,
  uploadParts,
} from '../../src/smartcrop/core/upload.js'

const MB = 1024 * 1024

// File stand-in: slice() returns the byte range so tests can check it.
const fakeFile = (name, size, type = '') => ({ name, size, type, slice: (start, end) => ({ start, end }) })

const httpError = (status, extra = {}) => Object.assign(new Error(`HTTP ${status}`), { status, ...extra })

const partsFor = (count) =>
  Array.from({ length: count }, (_, i) => ({ partNumber: i + 1, url: `https://s3/part-${i + 1}?sig=1` }))

// Fake S3 + API. `failures[partNumber]` = errors to throw before succeeding.
function fakeApi({ failures = {} } = {}) {
  const calls = { put: [], refresh: [], complete: [] }
  let inFlight = 0
  let maxInFlight = 0
  const api = {
    calls,
    get maxInFlight() { return maxInFlight },
    async putPart(url, blob, { onProgress }) {
      const partNumber = Number(url.match(/part-(\d+)/)[1])
      calls.put.push({ partNumber, url, blob })
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setImmediate(resolve))
      inFlight--
      const pending = failures[partNumber]
      if (pending?.length) throw pending.shift()
      onProgress?.(blob.end - blob.start)
      return `"etag-${partNumber}"`
    },
    async refreshParts(projectId, partNumbers) {
      calls.refresh.push(partNumbers)
      return { parts: partNumbers.map((n) => ({ partNumber: n, url: `https://s3/part-${n}?sig=2` })) }
    },
    async complete(projectId, etags) {
      calls.complete.push(etags)
      return { project: { projectId, status: 'PROCESSING' } }
    },
  }
  return api
}

function uploadArgs(api, { size = 3 * MB, partSizeBytes = MB, count = 3 } = {}) {
  return { file: fakeFile('a.mp4', size), projectId: 'prj_1', parts: partsFor(count), partSizeBytes, api }
}

describe('file checks', () => {
  it('accepts the four video extensions, any case', () => {
    assert.equal(isSupportedFile(fakeFile('CLIP.MOV', 1)), true)
    assert.equal(isSupportedFile(fakeFile('a.webm', 1)), true)
    assert.equal(isSupportedFile(fakeFile('a.mkv', 1)), false)
    assert.equal(isSupportedFile(fakeFile('mp4', 1)), false)
  })

  it('sends the browser type when allowed, else the canonical one', () => {
    assert.equal(contentTypeFor(fakeFile('a.m4v', 1, 'video/mp4')), 'video/mp4')
    assert.equal(contentTypeFor(fakeFile('a.m4v', 1, '')), 'video/x-m4v')
    assert.equal(contentTypeFor(fakeFile('a.mov', 1, 'video/mp4')), 'video/quicktime')
    assert.equal(contentTypeFor(fakeFile('a.avi', 1, 'video/x-msvideo')), 'video/x-msvideo')
  })
})

describe('partRange', () => {
  it('splits into part-size ranges with a short last part', () => {
    assert.deepEqual(partRange(1, 10, 25), [0, 10])
    assert.deepEqual(partRange(3, 10, 25), [20, 25])
    assert.deepEqual(partRange(2, 10, 20), [10, 20]) // exact multiple: no empty part
    assert.deepEqual(partRange(1, 10, 1), [0, 1])
  })
})

describe('createByteProgress', () => {
  it('sums parts and lets a retried part start over', () => {
    const seen = []
    const progress = createByteProgress(100, (sent) => seen.push(sent))
    progress.set(1, 40)
    progress.set(2, 30)
    progress.set(1, 0) // retry
    progress.set(1, 50)
    assert.deepEqual(seen, [40, 70, 30, 80])
  })
})

describe('uploadParts', () => {
  it('uploads every part with its byte range and returns sorted ETags', async () => {
    const api = fakeApi()
    const etags = await uploadParts(uploadArgs(api, { size: 2.5 * MB }))
    assert.deepEqual(etags.map((e) => e.partNumber), [1, 2, 3])
    assert.equal(etags[0].etag, '"etag-1"')
    const last = api.calls.put.find((c) => c.partNumber === 3)
    assert.deepEqual(last.blob, { start: 2 * MB, end: 2.5 * MB })
  })

  it('keeps at most 4 parts in flight', async () => {
    const api = fakeApi()
    await uploadParts(uploadArgs(api, { size: 10 * MB, count: 10 }))
    assert.equal(api.maxInFlight, 4)
    assert.equal(api.calls.put.length, 10)
  })

  it('reports total bytes sent', async () => {
    const api = fakeApi()
    const seen = []
    await uploadParts({ ...uploadArgs(api), progress: createByteProgress(3 * MB, (s) => seen.push(s)) })
    assert.equal(seen.at(-1), 3 * MB)
  })

  it('refreshes the URL on 403 and retries just that part', async () => {
    const api = fakeApi({ failures: { 2: [httpError(403)] } })
    await uploadParts(uploadArgs(api))
    assert.deepEqual(api.calls.refresh, [[2]])
    const part2 = api.calls.put.filter((c) => c.partNumber === 2).map((c) => c.url)
    assert.deepEqual(part2, ['https://s3/part-2?sig=1', 'https://s3/part-2?sig=2'])
  })

  it('retries network / 5xx errors after a delay without refreshing', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const api = fakeApi({ failures: { 1: [httpError(0), httpError(503)] } })
    const done = uploadParts(uploadArgs(api, { size: MB, count: 1 }))
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setImmediate(resolve))
      t.mock.timers.tick(5000)
    }
    await done
    assert.equal(api.calls.put.length, 3)
    assert.deepEqual(api.calls.refresh, [])
  })

  it(`gives up after ${MAX_PART_RETRIES} retries`, async () => {
    const api = fakeApi({ failures: { 1: Array.from({ length: 5 }, () => httpError(403)) } })
    await assert.rejects(uploadParts(uploadArgs(api, { size: MB, count: 1 })), { status: 403 })
    assert.equal(api.calls.put.length, 1 + MAX_PART_RETRIES)
  })

  it('does not retry other client errors', async () => {
    const api = fakeApi({ failures: { 1: [httpError(400)] } })
    await assert.rejects(uploadParts(uploadArgs(api, { size: MB, count: 1 })), { status: 400 })
    assert.equal(api.calls.put.length, 1)
  })

  it('does not retry an abort', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    const api = fakeApi({ failures: { 1: [abort] } })
    await assert.rejects(uploadParts(uploadArgs(api, { size: MB, count: 1 })), { name: 'AbortError' })
    assert.equal(api.calls.put.length, 1)
  })

  it('stops starting new parts after a part fails', async () => {
    const api = fakeApi({ failures: { 1: [httpError(400)] } })
    await assert.rejects(uploadParts(uploadArgs(api, { size: 10 * MB, count: 10 })))
    assert.ok(api.calls.put.length < 10)
  })
})

describe('completeParts', () => {
  it('completes with the ETags', async () => {
    const api = fakeApi()
    const etags = [{ partNumber: 1, etag: '"a"' }]
    const result = await completeParts({ ...uploadArgs(api), etags })
    assert.equal(result.project.status, 'PROCESSING')
    assert.deepEqual(api.calls.complete, [etags])
  })

  it('re-uploads missing parts once on UPLOAD_INCOMPLETE', async () => {
    const api = fakeApi()
    const incomplete = httpError(422, { code: 'UPLOAD_INCOMPLETE', details: { missingParts: [2] } })
    api.complete = mock.fn(async (projectId, etags) => {
      if (api.complete.mock.callCount() === 0) throw incomplete
      return { project: { projectId, etags } }
    })
    const etags = [1, 2, 3].map((n) => ({ partNumber: n, etag: `"old-${n}"` }))

    const result = await completeParts({ ...uploadArgs(api), etags })

    assert.deepEqual(api.calls.refresh, [[2]])
    assert.deepEqual(api.calls.put.map((c) => c.partNumber), [2])
    assert.deepEqual(result.project.etags.map((e) => e.etag), ['"old-1"', '"etag-2"', '"old-3"'])
  })

  it('passes other errors through', async () => {
    const api = fakeApi()
    api.complete = async () => { throw httpError(422, { code: 'VIDEO_TOO_LONG' }) }
    await assert.rejects(completeParts({ ...uploadArgs(api), etags: [] }), { code: 'VIDEO_TOO_LONG' })
  })
})
