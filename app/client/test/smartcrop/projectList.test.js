import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { lastRenderText, mergePage, statusBadge } from '../../src/smartcrop/core/projectList.js'

describe('statusBadge', () => {
  it('labels each status with a tone', () => {
    assert.deepEqual(statusBadge({ status: 'READY' }), { label: 'Ready', tone: 'ok' })
    assert.deepEqual(statusBadge({ status: 'FAILED' }), { label: 'Failed', tone: 'error' })
    assert.deepEqual(statusBadge({ status: 'REJECTED' }), { label: "Can't be used", tone: 'error' })
    assert.equal(statusBadge({ status: 'UPLOAD_EXPIRED' }).tone, 'muted')
  })

  it('shows the stage while processing', () => {
    const badge = statusBadge({ status: 'PROCESSING', processing: { stage: 'ANALYZING' } })
    assert.deepEqual(badge, { label: 'Finding faces and speakers', tone: 'busy' })
  })

  it('falls back to the raw status for anything new', () => {
    assert.deepEqual(statusBadge({ status: 'ARCHIVED' }), { label: 'ARCHIVED', tone: 'muted' })
  })
})

describe('lastRenderText', () => {
  it('describes the last render with its aspect', () => {
    assert.equal(lastRenderText({ lastRender: { status: 'SUCCEEDED', aspect: '9:16' } }), 'Rendered · 9:16')
    assert.equal(lastRenderText({ lastRender: { status: 'RENDERING', aspect: '1:1' } }), 'Rendering… · 1:1')
  })

  it('is null when nothing was rendered', () => {
    assert.equal(lastRenderText({ lastRender: null }), null)
  })
})

describe('mergePage', () => {
  it('appends a page without duplicates', () => {
    const a = { projectId: 'a' }
    const b = { projectId: 'b' }
    const c = { projectId: 'c' }
    assert.deepEqual(mergePage([a, b], [b, c]), [a, b, c])
    assert.deepEqual(mergePage([], [a]), [a])
  })
})
