import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLUR_FILTER,
  clipToBounds,
  coverRect,
  drawFrame,
  findSegmentIndex,
  frameDurationMs,
  frameIndex,
  getFrameLayout,
  parseBackground,
} from '../../src/smartcrop/core/frameLayout.js'
import { makeFakeContext, makePlan, proxyVideo } from './helpers/fixtures.js'

const ops = (ctx) => ctx.calls.map((c) => c.op)

describe('frameIndex', () => {
  const plan = makePlan()

  it('maps time to 40 ms frames', () => {
    assert.equal(frameIndex(plan, 0), 0)
    assert.equal(frameIndex(plan, 39.999), 0)
    assert.equal(frameIndex(plan, 40), 1)
    assert.equal(frameIndex(plan, 359), 8)
  })

  it('absorbs float error from currentTime × 1000', () => {
    // 0.12 * 1000 === 120 here, but division can still land just under 3.
    assert.equal(frameIndex(plan, 0.12 * 1000), 3)
    assert.equal(frameIndex(plan, 119.99999999999999), 3)
  })

  it('clamps to [0, frames − 1]', () => {
    assert.equal(frameIndex(plan, -500), 0)
    assert.equal(frameIndex(plan, 400), 9)
    assert.equal(frameIndex(plan, 1e9), 9)
  })

  it('treats non-numeric time as 0', () => {
    assert.equal(frameIndex(plan, NaN), 0)
    assert.equal(frameIndex(plan, undefined), 0)
  })

  it('uses analysis_fps when present, 25 otherwise', () => {
    assert.equal(frameDurationMs(makePlan({ analysis_fps: 50 })), 20)
    assert.equal(frameIndex(makePlan({ analysis_fps: 50 }), 40), 2)
    assert.equal(frameDurationMs(makePlan({ analysis_fps: undefined })), 40)
    assert.equal(frameDurationMs(makePlan({ analysis_fps: 0 })), 40)
  })
})

describe('findSegmentIndex', () => {
  const segments = [{ start: 0, end: 4 }, { start: 4, end: 7 }, { start: 7, end: 10 }]

  it('finds the segment with start ≤ f < end', () => {
    assert.equal(findSegmentIndex(segments, 0), 0)
    assert.equal(findSegmentIndex(segments, 3), 0)
    assert.equal(findSegmentIndex(segments, 4), 1) // end is exclusive
    assert.equal(findSegmentIndex(segments, 6), 1)
    assert.equal(findSegmentIndex(segments, 9), 2)
  })

  it('returns -1 outside every segment or in a gap', () => {
    assert.equal(findSegmentIndex(segments, 10), -1)
    assert.equal(findSegmentIndex(segments, -1), -1)
    assert.equal(findSegmentIndex([{ start: 0, end: 2 }, { start: 3, end: 5 }], 2), -1)
    assert.equal(findSegmentIndex([], 0), -1)
    assert.equal(findSegmentIndex(undefined, 0), -1)
  })

  it('works across many segments', () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ start: i * 3, end: i * 3 + 3 }))
    assert.equal(findSegmentIndex(many, 0), 0)
    assert.equal(findSegmentIndex(many, 1500), 500)
    assert.equal(findSegmentIndex(many, 2999), 999)
  })
})

describe('parseBackground', () => {
  it('parses blur, hex colours and falls back to black', () => {
    assert.deepEqual(parseBackground('blur'), { type: 'blur' })
    assert.deepEqual(parseBackground('#A1b2C3'), { type: 'color', color: '#A1b2C3' })
    assert.deepEqual(parseBackground('black'), { type: 'color', color: '#000000' })
    assert.deepEqual(parseBackground('#12345'), { type: 'color', color: '#000000' })
    assert.deepEqual(parseBackground(null), { type: 'color', color: '#000000' })
  })
})

describe('coverRect', () => {
  it('covers a tall canvas with a wide video, centred', () => {
    // 960×540 into 1080×1920 → scale 1920/540, width 3413.3, centred horizontally.
    const [x, y, w, h] = coverRect(960, 540, 1080, 1920)
    assert.equal(y, 0)
    assert.equal(h, 1920)
    assert.ok(Math.abs(w - 3413.333) < 0.001)
    assert.ok(Math.abs(x - (1080 - w) / 2) < 1e-9)
  })

  it('is the identity for matching sizes', () => {
    assert.deepEqual(coverRect(1080, 1920, 1080, 1920), [0, 0, 1080, 1920])
  })
})

describe('clipToBounds', () => {
  it('leaves a crop inside the frame untouched', () => {
    assert.deepEqual(
      clipToBounds([10, 20, 100, 200], [0, 0, 50, 100], 960, 540),
      { src: [10, 20, 100, 200], dst: [0, 0, 50, 100] },
    )
  })

  it('trims a crop hanging off the left/top and shrinks dst proportionally', () => {
    // Source 200×200 drawn at 2× → the off-frame 50 px become 100 px of dst.
    assert.deepEqual(
      clipToBounds([-50, -50, 200, 200], [0, 0, 400, 400], 960, 540),
      { src: [0, 0, 150, 150], dst: [100, 100, 300, 300] },
    )
  })

  it('trims a crop hanging off the right/bottom', () => {
    assert.deepEqual(
      clipToBounds([900, 500, 100, 100], [0, 0, 100, 100], 960, 540),
      { src: [900, 500, 60, 40], dst: [0, 0, 60, 40] },
    )
  })

  it('returns null when the crop is fully outside or degenerate', () => {
    assert.equal(clipToBounds([1000, 0, 100, 100], [0, 0, 100, 100], 960, 540), null)
    assert.equal(clipToBounds([0, 0, 0, 100], [0, 0, 100, 100], 960, 540), null)
    assert.equal(clipToBounds([0, 0, 100, 100], [0, 0, 100, 0], 960, 540), null)
  })
})

describe('getFrameLayout', () => {
  it('returns null for an empty plan or a time with no segment', () => {
    assert.equal(getFrameLayout(null, 0), null)
    assert.equal(getFrameLayout(makePlan({ segments: [] }), 0), null)
    const gappy = makePlan({ segments: [{ start: 0, end: 2, panels: [] }, { start: 3, end: 10, panels: [] }] })
    assert.equal(getFrameLayout(gappy, 80), null)
  })

  it('picks the segment and the crop for the frame within it', () => {
    const layout = getFrameLayout(makePlan(), 120) // frame 3 → segment 0, index 3
    assert.equal(layout.frame, 3)
    assert.equal(layout.segmentIndex, 0)
    assert.equal(layout.index, 3)
    assert.equal(layout.layout, 'fill')
    assert.deepEqual(layout.canvas, { width: 1080, height: 1920 })
    assert.deepEqual(layout.background, { type: 'blur' })
    assert.deepEqual(layout.panels[0].src, [300, 0, 600, 1080])
    assert.deepEqual(layout.panels[0].dst, [0, 0, 1080, 1920])
  })

  it('restarts the crop index at each segment start', () => {
    const layout = getFrameLayout(makePlan(), 160) // frame 4 → segment 1, index 0
    assert.equal(layout.segmentIndex, 1)
    assert.equal(layout.index, 0)
    assert.deepEqual(layout.background, { type: 'color', color: '#112233' })
    assert.deepEqual(layout.panels.map((p) => p.person), [0, 1])
    assert.deepEqual(layout.panels[1].src, [960, 540, 960, 540])
  })

  it('holds the last crop when the crop array is shorter than the segment', () => {
    const layout = getFrameLayout(makePlan(), 360) // frame 9 → index 5
    assert.deepEqual(layout.panels[0].src, [0, 0, 960, 540]) // only 1 crop
    assert.deepEqual(layout.panels[1].src, [960, 490, 960, 540]) // crop #5
  })

  it('scales crops from plan source pixels to the playing video size', () => {
    const layout = getFrameLayout(makePlan(), 120, { width: 960, height: 540 })
    assert.deepEqual(layout.panels[0].src, [150, 0, 300, 540])
    assert.deepEqual(layout.panels[0].dst, [0, 0, 1080, 1920])
  })

  it('clips crops to the video once scaled', () => {
    const plan = makePlan()
    plan.segments[0].panels[0].crop = [[1600, 0, 640, 1080]] // 320 px past the right edge
    const [panel] = getFrameLayout(plan, 0, { width: 960, height: 540 }).panels
    assert.deepEqual(panel.src, [800, 0, 160, 540])
    assert.deepEqual(panel.dst, [0, 0, 540, 1920])
  })

  it('marks panels without a usable crop as not drawable', () => {
    const plan = makePlan()
    plan.segments[1].panels[0].crop = []
    plan.segments[1].panels[1].crop = [null]
    const layout = getFrameLayout(plan, 160, { width: 960, height: 540 })
    for (const panel of layout.panels) {
      assert.equal(panel.src, null)
      assert.equal(panel.dst, null)
    }
  })

  it('falls back to the video size when the plan has no source size', () => {
    const layout = getFrameLayout(makePlan({ source: undefined }), 0, { width: 960, height: 540 })
    assert.deepEqual(layout.panels[0].src, [0, 0, 600, 540]) // scale 1, clipped to 540 high
  })
})

describe('drawFrame', () => {
  it('fills black and returns null before the video has a frame', () => {
    const ctx = makeFakeContext()
    assert.equal(drawFrame(ctx, { videoWidth: 0, videoHeight: 0 }, makePlan(), 0), null)
    assert.deepEqual(ops(ctx), ['fillRect'])
    assert.equal(ctx.calls[0].fillStyle, '#000000')
  })

  it('fills black and returns null when the time has no segment', () => {
    const ctx = makeFakeContext()
    assert.equal(drawFrame(ctx, proxyVideo(), makePlan({ segments: [] }), 0), null)
    assert.deepEqual(ops(ctx), ['fillRect'])
  })

  it('draws a blurred cover background behind panels that leave it visible', () => {
    const plan = makePlan()
    plan.segments[0].panels[0].rect = [0, 420, 1080, 1080] // `fit`-like: bars above/below
    const ctx = makeFakeContext()
    drawFrame(ctx, proxyVideo(), plan, 0)

    assert.deepEqual(ops(ctx), ['save', 'drawImage', 'restore', 'drawImage'])
    const [background, panel] = ctx.calls.filter((c) => c.op === 'drawImage')
    assert.equal(background.filter, BLUR_FILTER)
    assert.deepEqual(background.args.slice(0, 4), [0, 0, 960, 540])
    assert.deepEqual(background.args.slice(4), coverRect(960, 540, 1080, 1920))
    assert.equal(panel.filter, 'none') // filter reset before the panels
    assert.deepEqual(panel.args, [0, 0, 300, 540, 0, 420, 1080, 1080])
  })

  it('skips the blur when a panel covers the whole canvas', () => {
    const ctx = makeFakeContext()
    const layout = drawFrame(ctx, proxyVideo(), makePlan(), 40)
    assert.equal(layout.frame, 1)
    assert.deepEqual(ops(ctx), ['fillRect', 'drawImage'])
    assert.deepEqual(ctx.calls[1].args, [50, 0, 300, 540, 0, 0, 1080, 1920])
  })

  it('fills a colour background, then draws each panel into its rect', () => {
    const ctx = makeFakeContext()
    drawFrame(ctx, proxyVideo(), makePlan(), 200) // frame 5 → split, index 1
    assert.deepEqual(ops(ctx), ['fillRect', 'drawImage', 'drawImage'])
    assert.equal(ctx.calls[0].fillStyle, '#112233')
    assert.deepEqual(ctx.calls[0].args, [0, 0, 1080, 1920])
    assert.deepEqual(ctx.calls[1].args, [0, 0, 480, 270, 0, 0, 1080, 960])
    assert.deepEqual(ctx.calls[2].args, [480, 265, 480, 270, 0, 960, 1080, 960])
  })

  it('skips panels without a crop and keeps drawing the rest', () => {
    const plan = makePlan()
    plan.segments[1].panels[0].crop = []
    const ctx = makeFakeContext()
    drawFrame(ctx, proxyVideo(), plan, 160)
    assert.deepEqual(ops(ctx), ['fillRect', 'drawImage'])
    assert.deepEqual(ctx.calls[1].args.slice(4), [0, 960, 1080, 960])
  })
})
