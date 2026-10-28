import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_PX_PER_MS,
  clampMs,
  fitPxPerMs,
  formatMs,
  pickTickStep,
  ticks,
  zoomPxPerMs,
} from '../../src/smartcrop/core/time.js'

describe('formatMs', () => {
  it('formats mm:ss, flooring to the second', () => {
    assert.equal(formatMs(0), '00:00')
    assert.equal(formatMs(999), '00:00')
    assert.equal(formatMs(59999), '00:59')
    assert.equal(formatMs(612480), '10:12')
  })

  it('switches to hh:mm:ss from one hour, or when asked', () => {
    assert.equal(formatMs(3600000), '01:00:00')
    assert.equal(formatMs(3723000), '01:02:03')
    assert.equal(formatMs(12000, { withHours: true }), '00:00:12')
  })

  it('treats negative and non-finite input as 0', () => {
    assert.equal(formatMs(-5000), '00:00')
    assert.equal(formatMs(NaN), '00:00')
    assert.equal(formatMs(Infinity), '00:00')
  })
})

describe('clampMs', () => {
  it('clamps into [0, duration]', () => {
    assert.equal(clampMs(-1, 1000), 0)
    assert.equal(clampMs(500, 1000), 500)
    assert.equal(clampMs(1500, 1000), 1000)
    assert.equal(clampMs(10, -5), 0)
  })
})

describe('fitPxPerMs / zoomPxPerMs', () => {
  it('fits the whole video into the width', () => {
    assert.equal(fitPxPerMs(1000, 100000), 0.01)
    assert.equal(fitPxPerMs(0, 100000), 0)
    assert.equal(fitPxPerMs(1000, 0), 0)
  })

  it('zooms by the factor within [fit, 200 px/s]', () => {
    const fit = 0.01
    assert.equal(zoomPxPerMs(fit, 2, fit), 0.02)
    assert.equal(zoomPxPerMs(fit, 0.5, fit), fit) // can't zoom out past fit
    assert.equal(zoomPxPerMs(0.15, 2, fit), MAX_PX_PER_MS) // capped at 200 px/s
  })

  it('lets fit win for a video shorter than the max scale', () => {
    const fit = 0.5 // 2 s video in 1000 px
    assert.equal(zoomPxPerMs(fit, 2, fit), fit)
    assert.equal(zoomPxPerMs(fit, 0.5, fit), fit)
  })
})

describe('pickTickStep', () => {
  it('picks the smallest step that keeps labels ≥ 60 px apart', () => {
    assert.equal(pickTickStep(0.2), 1000) // 200 px/s → 1 s
    assert.equal(pickTickStep(0.05), 5000) // 50 px/s → 5 s = 250 px (1 s = 50 px, too close)
    assert.equal(pickTickStep(0.004), 30000) // 4 px/s → 30 s = 120 px
    assert.equal(pickTickStep(1000 / 1800000), 120000) // 30 min in 1000 px → 2 min
  })

  it('falls back to the largest step', () => {
    assert.equal(pickTickStep(1e-9), 3600000)
  })
})

describe('ticks', () => {
  it('lists ticks with x positions and labels over the whole video', () => {
    const out = ticks(3500, 0.1) // 100 px/s → 1 s step
    assert.deepEqual(out, [
      { ms: 0, x: 0, label: '00:00' },
      { ms: 1000, x: 100, label: '00:01' },
      { ms: 2000, x: 200, label: '00:02' },
      { ms: 3000, x: 300, label: '00:03' },
    ])
  })

  it('includes a tick exactly at the end', () => {
    assert.deepEqual(ticks(3000, 0.1).map((t) => t.ms), [0, 1000, 2000, 3000])
  })

  it('limits to a visible window, starting on a step boundary', () => {
    assert.deepEqual(ticks(60000, 0.1, { fromMs: 2500, toMs: 5200 }).map((t) => t.ms), [3000, 4000, 5000])
  })

  it('labels every tick hh:mm:ss on videos of an hour or more', () => {
    const out = ticks(3600000, 1000 / 3600000)
    assert.equal(out[0].label, '00:00:00')
    assert.equal(out.at(-1).label, '01:00:00')
  })

  it('returns nothing until duration and scale are known', () => {
    assert.deepEqual(ticks(0, 0.1), [])
    assert.deepEqual(ticks(1000, 0), [])
  })
})
