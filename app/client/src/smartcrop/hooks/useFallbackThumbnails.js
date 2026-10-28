import { useEffect, useState } from 'react'
import { fallbackThumbTimes } from '../core/timeline.js'

// Client-side thumbnail strip when the pipeline gave no sprite (spec 05 §5):
// a second hidden <video> seeks to `count` evenly spaced times and draws each
// frame onto a small canvas. Results arrive one by one so the strip fills in
// progressively. → array of image URLs by slot (undefined = not ready yet).

export const THUMB_HEIGHT_PX = 90
const STEP_TIMEOUT_MS = 15000

// Resolve on `event`, reject on error or after a timeout (a stuck seek must
// not hang the strip forever).
function waitFor(video, event) {
  return new Promise((resolve, reject) => {
    const done = (fn) => (arg) => {
      clearTimeout(timer)
      video.removeEventListener(event, onEvent)
      video.removeEventListener('error', onError)
      fn(arg)
    }
    const onEvent = done(resolve)
    const onError = done(() => reject(new Error('Thumbnail video failed to load.')))
    const timer = setTimeout(() => onError(), STEP_TIMEOUT_MS)
    video.addEventListener(event, onEvent)
    video.addEventListener('error', onError)
  })
}

export function useFallbackThumbnails({ url, durationMs, count, enabled = true }) {
  const [thumbs, setThumbs] = useState([])

  useEffect(() => {
    setThumbs([])
    if (!enabled || !url || !(durationMs > 0) || !(count > 0)) return

    let cancelled = false
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous' // the canvas must stay readable (toDataURL)
    video.muted = true
    video.preload = 'auto'
    video.src = url
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    async function capture() {
      await waitFor(video, 'loadeddata')
      canvas.height = THUMB_HEIGHT_PX
      canvas.width = Math.round((THUMB_HEIGHT_PX * video.videoWidth) / video.videoHeight)

      for (const [slot, ms] of fallbackThumbTimes(durationMs, count).entries()) {
        if (cancelled) return
        video.currentTime = ms / 1000
        await waitFor(video, 'seeked')
        if (cancelled) return
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const src = canvas.toDataURL('image/jpeg', 0.7)
        setThumbs((prev) => {
          const next = prev.slice()
          next[slot] = src
          return next
        })
      }
    }

    // A failed strip only costs the pictures; the clip bar still works.
    capture().catch(() => {})

    return () => {
      cancelled = true
      video.removeAttribute('src')
      video.load()
    }
  }, [url, durationMs, count, enabled])

  return thumbs
}
