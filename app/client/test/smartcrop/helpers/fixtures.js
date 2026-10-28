// Small hand-built plan in the shape of a stage-4 plan file (spec 03 §4):
// 1920×1080 source → 1080×1920 canvas, 25 fps, 10 frames (400 ms).
//
//   frames 0–3  fill  (blur bg)    one full-canvas panel, crop pans 100 px/frame
//   frames 4–9  split (#112233 bg) top panel (1 crop → held), bottom panel (6 crops)
export function makePlan(overrides = {}) {
  return {
    canvas: { width: 1080, height: 1920 },
    analysis_fps: 25,
    frames: 10,
    source: { width: 1920, height: 1080 },
    segments: [
      {
        start: 0,
        end: 4,
        layout: 'fill',
        background: 'blur',
        panels: [{
          rect: [0, 0, 1080, 1920],
          person: 0,
          crop: [0, 1, 2, 3].map((i) => [i * 100, 0, 600, 1080]),
        }],
      },
      {
        start: 4,
        end: 10,
        layout: 'split',
        background: '#112233',
        panels: [
          { rect: [0, 0, 1080, 960], person: 0, crop: [[0, 0, 960, 540]] },
          { rect: [0, 960, 1080, 960], person: 1, crop: [0, 1, 2, 3, 4, 5].map((i) => [960, 540 - i * 10, 960, 540]) },
        ],
      },
    ],
    ...overrides,
  }
}

// Records every 2D-context call, plus the `filter` active at each drawImage.
export function makeFakeContext(width = 1080, height = 1920) {
  const calls = []
  return {
    calls,
    canvas: { width, height },
    filter: 'none',
    fillStyle: '#000000',
    save() { calls.push({ op: 'save' }) },
    restore() { this.filter = 'none'; calls.push({ op: 'restore' }) },
    fillRect(...args) { calls.push({ op: 'fillRect', fillStyle: this.fillStyle, args }) },
    drawImage(...args) { calls.push({ op: 'drawImage', filter: this.filter, args: args.slice(1) }) },
  }
}

// A proxy at half the source resolution, as the editor would play.
export const proxyVideo = () => ({ videoWidth: 960, videoHeight: 540 })
