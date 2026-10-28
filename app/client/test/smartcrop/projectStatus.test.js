import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SCREENS, elapsedSince, failureInfo, screenFor, stageText } from '../../src/smartcrop/core/projectStatus.js'

describe('screenFor', () => {
  it('maps project status to a screen', () => {
    assert.equal(screenFor({ status: 'PROCESSING' }), SCREENS.PROCESSING)
    assert.equal(screenFor({ status: 'READY' }), SCREENS.EDITOR)
    for (const status of ['FAILED', 'REJECTED', 'UPLOADING', 'UPLOAD_ABORTED', 'UPLOAD_EXPIRED']) {
      assert.equal(screenFor({ status }), SCREENS.FAILED, status)
    }
  })
})

describe('stageText', () => {
  it('has the spec copy per stage, "Starting…" otherwise', () => {
    assert.equal(stageText('ANALYZING'), 'Finding faces and speakers')
    assert.equal(stageText('FINALIZING'), 'Almost done')
    assert.equal(stageText(null), 'Starting…')
  })
})

describe('failureInfo', () => {
  const error = { code: 'ANALYZE_FAILED', message: "We couldn't analyse this video.", failedStage: 'ANALYZE' }

  it('offers retry only when FAILED and the server says retryable', () => {
    const info = failureInfo({ status: 'FAILED', processing: { error, retryable: true } })
    assert.deepEqual(info, { title: 'Processing failed', message: error.message, retryable: true })
    assert.equal(failureInfo({ status: 'FAILED', processing: { error, retryable: false } }).retryable, false)
  })

  it('never retries a rejected file', () => {
    const info = failureInfo({ status: 'REJECTED', processing: { error, retryable: true } })
    assert.equal(info.retryable, false)
    assert.equal(info.title, "This video can't be used")
  })

  it('explains uploads that never finished', () => {
    for (const status of ['UPLOADING', 'UPLOAD_ABORTED', 'UPLOAD_EXPIRED']) {
      const info = failureInfo({ status, processing: null })
      assert.equal(info.retryable, false)
      assert.match(info.message, /upload/i)
    }
  })

  it('falls back to a generic message', () => {
    assert.match(failureInfo({ status: 'FAILED', processing: null }).message, /went wrong/)
  })
})

describe('elapsedSince', () => {
  it('adds local time since the response while running', () => {
    assert.equal(elapsedSince({ elapsedMs: 10000, finishedAt: null }, 1000, 4000), 13000)
  })

  it('stops counting once finished, and copes with missing data', () => {
    assert.equal(elapsedSince({ elapsedMs: 10000, finishedAt: '…' }, 1000, 4000), 10000)
    assert.equal(elapsedSince(null, 0, 4000), 0)
    assert.equal(elapsedSince({ elapsedMs: 5000, finishedAt: null }, 5000, 4000), 5000) // clock skew
  })
})
