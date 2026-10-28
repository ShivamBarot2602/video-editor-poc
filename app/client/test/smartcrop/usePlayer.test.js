import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createPlayerController } from '../../src/smartcrop/hooks/usePlayer.js'

// Minimal <video>. Events are fired by the test (`emit`), as a browser would
// after the matching operation completes. Every seek is recorded in `seeks`
// as ['exact' | 'fast', seconds]; `playTo` moves time without seeking.
class FakeVideo extends EventTarget {
  #time = 0

  constructor({ duration = 10, frameCallbacks = true, fastSeek = false } = {}) {
    super()
    this.duration = duration
    this.paused = true
    this.muted = false
    this.error = null
    this.seeks = []
    this.srcSets = []
    this.playResult = () => Promise.resolve()
    this.frameCallbacks = new Map()
    this.nextFrameId = 1
    // Own `undefined` shadows the prototype method → "not supported".
    if (!frameCallbacks) this.requestVideoFrameCallback = undefined
    if (!fastSeek) this.fastSeek = undefined
  }

  get currentTime() { return this.#time }
  set currentTime(s) { this.#time = s; this.seeks.push(['exact', s]) }
  fastSeek(s) { this.#time = s; this.seeks.push(['fast', s]) }
  playTo(s) { this.#time = s }

  set src(value) { this.srcSets.push(value) }
  getAttribute(name) { return name === 'src' ? this.srcSets.at(-1) ?? null : null }

  emit(type) { this.dispatchEvent(new Event(type)) }

  play() {
    const result = this.playResult()
    result.then(() => { this.paused = false; this.emit('play') }, () => {})
    return result
  }

  pause() {
    if (this.paused) return
    this.paused = true
    this.emit('pause')
  }

  requestVideoFrameCallback(cb) {
    const id = this.nextFrameId++
    this.frameCallbacks.set(id, cb)
    return id
  }

  cancelVideoFrameCallback(id) { this.frameCallbacks.delete(id) }

  // Present a frame at `seconds` to every waiting frame callback.
  presentFrame(seconds) {
    this.playTo(seconds)
    const callbacks = [...this.frameCallbacks.values()]
    this.frameCallbacks.clear()
    callbacks.forEach((cb) => cb(0, { mediaTime: seconds }))
  }
}

// Manual animation-frame queue.
function makeFrames() {
  const queue = new Map()
  let nextId = 1
  return {
    requestFrame: (cb) => { const id = nextId++; queue.set(id, cb); return id },
    cancelFrame: (id) => queue.delete(id),
    get pending() { return queue.size },
    flush() {
      const callbacks = [...queue.values()]
      queue.clear()
      callbacks.forEach((cb) => cb(0))
    },
  }
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

let video, frames, player

function setup(videoOptions) {
  video = new FakeVideo(videoOptions)
  frames = makeFrames()
  player = createPlayerController(video, frames)
  player.attach()
}

describe('createPlayerController', () => {
  beforeEach(() => setup())

  describe('state', () => {
    it('starts paused at 0 with the video duration', () => {
      assert.deepEqual(player.getState(), {
        currentMs: 0, durationMs: 10000, playing: false, muted: false, ready: false, error: null,
      })
    })

    it('prefers the API duration over the element duration', () => {
      player.setDuration(9876)
      assert.equal(player.getState().durationMs, 9876)
      player.setDuration(undefined)
      assert.equal(player.getState().durationMs, 10000)
    })

    it('notifies subscribers only when something changed', () => {
      let calls = 0
      player.subscribe(() => calls++)
      player.seek(1000)
      player.seek(1000)
      assert.equal(calls, 1)
    })

    it('becomes ready on loadeddata and reports load errors', () => {
      video.emit('loadeddata')
      assert.equal(player.getState().ready, true)
      video.error = { message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' }
      video.emit('error')
      assert.equal(player.getState().error, 'MEDIA_ERR_SRC_NOT_SUPPORTED')
    })

    it('tracks mute through volumechange', () => {
      player.setMuted(true)
      video.emit('volumechange')
      assert.equal(player.getState().muted, true)
    })
  })

  describe('play / pause', () => {
    it('follows the element events', async () => {
      player.play()
      await flushPromises()
      assert.equal(player.getState().playing, true)
      player.pause()
      assert.equal(player.getState().playing, false)
    })

    it('stays paused when play() is rejected (autoplay policy)', async () => {
      video.playResult = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))
      player.play()
      await flushPromises()
      assert.equal(player.getState().playing, false)
    })

    it('toggle switches between the two', async () => {
      player.toggle()
      await flushPromises()
      assert.equal(player.getState().playing, true)
      player.toggle()
      assert.equal(player.getState().playing, false)
    })

    it('treats ended like pause', async () => {
      player.play()
      await flushPromises()
      video.paused = true
      video.emit('ended')
      assert.equal(player.getState().playing, false)
    })
  })

  describe('frame loop', () => {
    it('emits each presented frame while playing (requestVideoFrameCallback)', async () => {
      const seen = []
      player.onFrame((ms) => seen.push(ms))
      player.play()
      await flushPromises()

      video.presentFrame(0.04)
      video.presentFrame(0.08)
      assert.deepEqual(seen, [40, 80])
      assert.equal(player.getState().currentMs, 80)

      player.pause()
      video.presentFrame(0.12) // loop stopped: nothing waiting
      assert.equal(video.frameCallbacks.size, 0)
      assert.deepEqual(seen, [40, 80, 80]) // + the pause frame
    })

    it('falls back to animation frames without requestVideoFrameCallback', async () => {
      setup({ frameCallbacks: false })
      const seen = []
      player.onFrame((ms) => seen.push(ms))
      player.play()
      await flushPromises()

      video.playTo(1.5)
      frames.flush()
      assert.deepEqual(seen, [1500])
      assert.equal(frames.pending, 1) // next tick scheduled

      player.pause()
      assert.equal(frames.pending, 0)
    })

    it('emits on seeked and loadeddata so a paused canvas redraws', () => {
      const seen = []
      player.onFrame((ms) => seen.push(ms))
      video.playTo(2)
      video.emit('seeked')
      video.emit('loadeddata')
      assert.deepEqual(seen, [2000, 2000])
    })

    it('a paused seek also emits when its frame is presented (stale frame at seeked)', () => {
      const seen = []
      player.onFrame((ms) => seen.push(ms))
      player.seek(4000)
      assert.equal(video.frameCallbacks.size, 1) // registered when the seek is issued
      video.presentFrame(4) // Chrome can present before `seeked`…
      video.emit('seeked') // …or after; either way both emit
      assert.deepEqual(seen, [4000, 4000])
    })

    it('scrub seeks register it too, even before the pause event lands', async () => {
      player.play()
      await flushPromises()
      player.scrubStart() // element paused; state.playing not updated yet
      player.scrubTo(2000)
      frames.flush()
      assert.equal(video.frameCallbacks.size, 1)
    })

    it('keeps one pending presented-frame callback across rapid seeks', () => {
      player.seek(1000)
      player.seek(2000)
      player.seek(3000)
      assert.equal(video.frameCallbacks.size, 1)
    })

    it('does not register while playing (the playback loop draws)', async () => {
      player.play()
      await flushPromises()
      const loopCallbacks = video.frameCallbacks.size
      player.seek(1000)
      assert.equal(video.frameCallbacks.size, loopCallbacks)
    })

    it('stops emitting after unsubscribe and after detach', () => {
      const seen = []
      const off = player.onFrame((ms) => seen.push(ms))
      off()
      video.emit('seeked')
      assert.deepEqual(seen, [])

      player.onFrame((ms) => seen.push(ms))
      player.detach()
      video.emit('seeked')
      assert.deepEqual(seen, [])
    })
  })

  describe('seek / step', () => {
    it('seeks in seconds and updates currentMs immediately', () => {
      player.seek(2500)
      assert.equal(video.currentTime, 2.5)
      assert.equal(player.getState().currentMs, 2500)
    })

    it('clamps to [0, duration]', () => {
      player.seek(-100)
      assert.equal(video.currentTime, 0)
      player.seek(99999)
      assert.equal(video.currentTime, 10)
    })

    it('steps relative to the current time', () => {
      player.seek(1000)
      player.step(40)
      assert.equal(player.getState().currentMs, 1040)
      player.step(-5000)
      assert.equal(player.getState().currentMs, 0)
    })
  })

  describe('scrubbing', () => {
    it('pauses, then seeks at most once per animation frame', async () => {
      player.play()
      await flushPromises()
      video.seeks.length = 0

      player.scrubStart()
      assert.equal(video.paused, true)
      player.scrubTo(1000)
      player.scrubTo(2000)
      player.scrubTo(3000)
      assert.equal(player.getState().currentMs, 3000) // playhead follows the pointer now
      assert.equal(video.seeks.length, 0) // …but no seek until the frame

      frames.flush()
      assert.deepEqual(video.seeks, [['exact', 3]])
    })

    it('uses fastSeek while dragging when available', () => {
      setup({ fastSeek: true })
      player.scrubTo(4000) // implicit scrubStart
      frames.flush()
      assert.deepEqual(video.seeks, [['fast', 4]])
    })

    it('does not let a late seeked pull the playhead back mid-drag', () => {
      player.scrubTo(5000)
      video.playTo(1) // an older seek finishing
      video.emit('seeked')
      assert.equal(player.getState().currentMs, 5000)
    })

    it('ends with an exact seek and restores playback', async () => {
      setup({ fastSeek: true })
      player.play()
      await flushPromises()

      player.scrubStart()
      player.scrubTo(6000)
      player.scrubEnd(6200)
      assert.equal(frames.pending, 0) // pending fast seek cancelled
      assert.deepEqual(video.seeks.at(-1), ['exact', 6.2])
      await flushPromises()
      assert.equal(player.getState().playing, true)
    })

    it('stays paused after the drag if it was paused before', async () => {
      player.scrubStart()
      player.scrubTo(1000)
      player.scrubEnd()
      await flushPromises()
      assert.equal(player.getState().playing, false)
      assert.equal(player.getState().currentMs, 1000)
    })

    it('ignores scrubEnd without a drag', () => {
      player.scrubEnd(3000)
      assert.equal(video.seeks.length, 0)
    })
  })

  describe('setSource', () => {
    it('sets src and resets ready/error', () => {
      video.emit('loadeddata')
      player.setSource('https://s3/a.mp4')
      assert.deepEqual(video.srcSets, ['https://s3/a.mp4'])
      assert.equal(player.getState().ready, false)
    })

    it('does not reload the same URL', () => {
      player.setSource('https://s3/a.mp4')
      player.setSource('https://s3/a.mp4')
      assert.equal(video.srcSets.length, 1)
    })

    it('ignores an empty src', () => {
      player.setSource(undefined)
      assert.deepEqual(video.srcSets, [])
    })

    it('keeps position and play state across a URL swap', async () => {
      player.setSource('https://s3/a.mp4?sig=1')
      player.play()
      await flushPromises()
      player.seek(4000)

      player.setSource('https://s3/a.mp4?sig=2')
      video.paused = true // a new src resets the element
      video.emit('loadedmetadata')
      await flushPromises()
      assert.deepEqual(video.seeks.at(-1), ['exact', 4])
      assert.equal(player.getState().playing, true)
    })
  })
})
