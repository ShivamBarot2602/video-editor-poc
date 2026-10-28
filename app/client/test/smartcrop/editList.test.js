import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ASPECTS,
  LAYOUTS_BY_ASPECT,
  identityEdit,
  isIdentityEdit,
  isLayoutSupported,
  outputDurationMs,
  supportedLayouts,
  withAspect,
  withLayout,
} from '../../src/smartcrop/core/editList.js'

const DURATION = 612480

describe('constants', () => {
  it('match the spec table (00 §3)', () => {
    assert.deepEqual(ASPECTS, ['9:16', '4:5', '1:1', '16:9'])
    assert.deepEqual(LAYOUTS_BY_ASPECT['9:16'], ['fill', 'fit', 'split', 'three', 'four'])
    for (const aspect of ['4:5', '1:1', '16:9']) {
      assert.deepEqual(LAYOUTS_BY_ASPECT[aspect], ['fill', 'fit', 'split'])
    }
  })
})

describe('supportedLayouts / isLayoutSupported', () => {
  it('reads the given capabilities map, defaulting to the spec table', () => {
    assert.equal(isLayoutSupported('9:16', 'four'), true)
    assert.equal(isLayoutSupported('1:1', 'four'), false)
    assert.deepEqual(supportedLayouts('2:3'), [])
    assert.equal(isLayoutSupported('1:1', 'fit', { '1:1': ['fill'] }), false)
  })
})

describe('identityEdit', () => {
  it('builds one full-length clip with default options', () => {
    assert.deepEqual(identityEdit(DURATION, '9:16', 'split'), {
      schemaVersion: 1,
      aspect: '9:16',
      defaultLayout: 'split',
      options: { background: 'blur', fallbackLayout: 'fill' },
      clips: [{ id: 'c_1', sourceStartMs: 0, sourceEndMs: DURATION, layout: null }],
    })
  })

  it('merges partial options over the defaults and rounds the duration', () => {
    const doc = identityEdit(1000.6, '1:1', 'fill', { background: '#112233' })
    assert.deepEqual(doc.options, { background: '#112233', fallbackLayout: 'fill' })
    assert.equal(doc.clips[0].sourceEndMs, 1001)
  })
})

describe('isIdentityEdit', () => {
  it('accepts one full clip with a null or default layout', () => {
    const doc = identityEdit(DURATION, '9:16', 'fill')
    assert.equal(isIdentityEdit(doc, DURATION), true)
    doc.clips[0].layout = 'fill'
    assert.equal(isIdentityEdit(doc, DURATION), true)
  })

  it('rejects a per-clip layout, a trim, several clips, or no document', () => {
    const doc = identityEdit(DURATION, '9:16', 'fill')
    assert.equal(isIdentityEdit({ ...doc, clips: [{ ...doc.clips[0], layout: 'split' }] }, DURATION), false)
    assert.equal(isIdentityEdit({ ...doc, clips: [{ ...doc.clips[0], sourceEndMs: DURATION - 1 }] }, DURATION), false)
    assert.equal(isIdentityEdit({ ...doc, clips: [doc.clips[0], doc.clips[0]] }, DURATION), false)
    assert.equal(isIdentityEdit(null, DURATION), false)
  })
})

describe('withAspect', () => {
  it('keeps the layout when the new aspect supports it', () => {
    const doc = withAspect(identityEdit(DURATION, '9:16', 'split'), '1:1', DURATION)
    assert.equal(doc.aspect, '1:1')
    assert.equal(doc.defaultLayout, 'split')
  })

  it('switches to fill when the new aspect does not support the layout', () => {
    const doc = withAspect(identityEdit(DURATION, '9:16', 'four'), '16:9', DURATION)
    assert.equal(doc.aspect, '16:9')
    assert.equal(doc.defaultLayout, 'fill')
  })

  it('carries options over and resets clips to the identity edit', () => {
    const before = identityEdit(DURATION, '9:16', 'fit', { background: 'black' })
    const doc = withAspect(before, '4:5', DURATION)
    assert.deepEqual(doc.options, { background: 'black', fallbackLayout: 'fill' })
    assert.equal(isIdentityEdit(doc, DURATION), true)
  })

  it('honours a capabilities map from the server', () => {
    const doc = withAspect(identityEdit(DURATION, '9:16', 'split'), '1:1', DURATION, { '1:1': ['fill', 'fit'] })
    assert.equal(doc.defaultLayout, 'fill')
  })
})

describe('withLayout', () => {
  it('sets a supported layout', () => {
    const doc = withLayout(identityEdit(DURATION, '9:16', 'fill'), 'three', DURATION)
    assert.equal(doc.defaultLayout, 'three')
    assert.equal(doc.aspect, '9:16')
  })

  it('returns the same document for an unsupported layout', () => {
    const before = identityEdit(DURATION, '1:1', 'fill')
    assert.equal(withLayout(before, 'four', DURATION), before)
  })
})

describe('outputDurationMs', () => {
  it('sums clip durations', () => {
    const doc = {
      clips: [
        { sourceStartMs: 35000, sourceEndMs: 50000 },
        { sourceStartMs: 0, sourceEndMs: 12000 },
      ],
    }
    assert.equal(outputDurationMs(doc), 27000)
    assert.equal(outputDurationMs(null), 0)
  })
})
