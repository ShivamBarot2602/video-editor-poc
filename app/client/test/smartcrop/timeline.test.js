import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  FOLLOW_MARGIN_PX,
  TIMELINE_PAD,
  contentWidth,
  fallbackSlot,
  fallbackThumbCount,
  fallbackThumbTimes,
  followScroll,
  isTypingTarget,
  keyAction,
  msToX,
  scrollAfterZoom,
  spriteTile,
  visibleTiles,
  xToMs,
} from '../../src/smartcrop/core/timeline.js'

const PAD = TIMELINE_PAD

describe('msToX / xToMs', () => {
  it('round-trips with the left padding', () => {
    assert.equal(msToX(0, 0.1), PAD)
    assert.equal(msToX(5000, 0.1), PAD + 500)
    assert.equal(xToMs(PAD + 500, 0.1, 60000), 5000)
  })

  it('clamps pointer positions outside the clip', () => {
    assert.equal(xToMs(0, 0.1, 60000), 0)
    assert.equal(xToMs(1e9, 0.1, 60000), 60000)
    assert.equal(xToMs(100, 0, 60000), 0)
  })

  it('content width = clip + padding both sides', () => {
    assert.equal(contentWidth(60000, 0.01), 600 + 2 * PAD)
  })
})

describe('followScroll', () => {
  it('leaves the view alone while the playhead is visible', () => {
    assert.equal(followScroll({ playheadX: 500, scrollLeft: 0, viewWidth: 1000 }), null)
  })

  it('jumps forward when the playhead nears the right edge', () => {
    assert.equal(followScroll({ playheadX: 990, scrollLeft: 0, viewWidth: 1000 }), 990 - FOLLOW_MARGIN_PX)
  })

  it('jumps back when the playhead is left of the view (e.g. Home)', () => {
    assert.equal(followScroll({ playheadX: PAD, scrollLeft: 4000, viewWidth: 1000 }), 0)
  })
})

describe('scrollAfterZoom', () => {
  it('keeps the anchor time at the same screen position', () => {
    // 30 s at 0.01 px/ms is x = 316; scrolled 0 → on screen at 316.
    // At 0.02 px/ms it's x = 616 → scroll 300 keeps it at 316.
    const scroll = scrollAfterZoom({ anchorMs: 30000, oldPxPerMs: 0.01, newPxPerMs: 0.02, scrollLeft: 0, viewWidth: 632, durationMs: 60000 })
    assert.equal(scroll, 300)
  })

  it('clamps to the scrollable range', () => {
    const args = { oldPxPerMs: 0.02, newPxPerMs: 0.01, scrollLeft: 600, viewWidth: 632, durationMs: 60000 }
    assert.equal(scrollAfterZoom({ ...args, anchorMs: 60000 }), 0) // zoomed out to fit: no scroll
    assert.equal(scrollAfterZoom({ ...args, anchorMs: 0, scrollLeft: 0, newPxPerMs: 0.04 }), 0)
  })
})

describe('visibleTiles', () => {
  it('covers the clip, cutting the last tile at the clip end', () => {
    const tiles = visibleTiles({ durationMs: 10000, pxPerMs: 0.025, tileWidth: 100 }) // 250 px clip
    assert.deepEqual(tiles.map((t) => [t.index, t.left, t.width]), [[0, 0, 100], [1, 100, 100], [2, 200, 50]])
    assert.deepEqual(tiles.map((t) => t.ms), [2000, 6000, 9000])
  })

  it('returns only tiles intersecting the visible range', () => {
    const tiles = visibleTiles({ durationMs: 1800000, pxPerMs: 0.2, tileWidth: 120, fromX: 12000, toX: 13000 })
    assert.equal(tiles[0].index, Math.floor((12000 - PAD) / 120))
    assert.ok(tiles.length <= 10)
    assert.ok(tiles.every((t) => t.left + PAD + t.width >= 12000 && t.left + PAD <= 13000))
  })

  it('is empty for an unknown duration or scale', () => {
    assert.deepEqual(visibleTiles({ durationMs: 0, pxPerMs: 0.1, tileWidth: 100 }), [])
    assert.deepEqual(visibleTiles({ durationMs: 1000, pxPerMs: 0, tileWidth: 100 }), [])
  })
})

describe('spriteTile', () => {
  const thumbs = { intervalMs: 2000, tileWidth: 160, tileHeight: 90, columns: 10, count: 25 }

  it('picks the tile by floor(t / intervalMs) and scales it', () => {
    const tile = spriteTile(thumbs, 25000, 45) // index 12 → col 2, row 1; scale 0.5
    assert.equal(tile.width, 80)
    assert.equal(tile.backgroundPosition, '-160px -45px')
    assert.equal(tile.backgroundSize, '800px auto')
  })

  it('clamps to the first and last tile', () => {
    assert.equal(spriteTile(thumbs, -5, 90).backgroundPosition, '0px 0px')
    assert.equal(spriteTile(thumbs, 1e9, 90).backgroundPosition, '-640px -180px') // index 24
  })
})

describe('fallback thumbnails', () => {
  it('one per 120 px of visible width, between 1 and 40', () => {
    assert.equal(fallbackThumbCount(1200), 10)
    assert.equal(fallbackThumbCount(1250), 11)
    assert.equal(fallbackThumbCount(10), 1)
    assert.equal(fallbackThumbCount(100000), 40)
  })

  it('captures at the centre of equal slots and maps times back to slots', () => {
    assert.deepEqual(fallbackThumbTimes(60000, 4), [7500, 22500, 37500, 52500])
    assert.equal(fallbackSlot(0, 60000, 4), 0)
    assert.equal(fallbackSlot(14999, 60000, 4), 0)
    assert.equal(fallbackSlot(15000, 60000, 4), 1)
    assert.equal(fallbackSlot(60000, 60000, 4), 3)
  })
})

describe('keyAction', () => {
  const key = (k, mods = {}) => keyAction({ key: k, ...mods }, 60000)

  it('maps the spec shortcuts', () => {
    assert.deepEqual(key(' '), { type: 'toggle' })
    assert.deepEqual(key('ArrowLeft'), { type: 'step', ms: -1000 })
    assert.deepEqual(key('ArrowRight'), { type: 'step', ms: 1000 })
    assert.deepEqual(key('ArrowLeft', { shiftKey: true }), { type: 'step', ms: -40 })
    assert.deepEqual(key('ArrowRight', { shiftKey: true }), { type: 'step', ms: 40 })
    assert.deepEqual(key('Home'), { type: 'seek', ms: 0 })
    assert.deepEqual(key('End'), { type: 'seek', ms: 60000 })
  })

  it('leaves other keys and browser shortcuts alone', () => {
    assert.equal(key('a'), null)
    assert.equal(key('ArrowLeft', { metaKey: true }), null) // browser back
    assert.equal(key(' ', { ctrlKey: true }), null)
  })

  it('knows when the user is typing', () => {
    assert.equal(isTypingTarget({ tagName: 'INPUT' }), true)
    assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true)
    assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false)
    assert.equal(isTypingTarget(null), false)
  })
})
