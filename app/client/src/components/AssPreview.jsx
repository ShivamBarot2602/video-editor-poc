import { useEffect, useRef } from 'react'
import JASSUB from 'jassub'
import liberationSansUrl from '@shared/fonts/LiberationSans-Regular.ttf?url'
import liberationSerifUrl from '@shared/fonts/LiberationSerif-Regular.ttf?url'
import liberationMonoUrl from '@shared/fonts/LiberationMono-Regular.ttf?url'
import antonUrl from '@shared/fonts/Anton-Regular.ttf?url'
import robotoUrl from '@shared/fonts/Roboto.ttf?url'
import sourceSans3Url from '@shared/fonts/SourceSans3.ttf?url'
import lohitDevanagariUrl from '@shared/fonts/Lohit-Devanagari.ttf?url'
import lohitBengaliUrl from '@shared/fonts/Lohit-Bengali.ttf?url'
import lohitGujaratiUrl from '@shared/fonts/Lohit-Gujarati.ttf?url'
import samyakGujaratiUrl from '@shared/fonts/Samyak-Gujarati.ttf?url'
import samyakTamilUrl from '@shared/fonts/Samyak-Tamil.ttf?url'
import samyakMalayalamUrl from '@shared/fonts/Samyak-Malayalam.ttf?url'
import garudaUrl from '@shared/fonts/Garuda.ttf?url'

// Drag emits far more often than this; debounce so setTrack (which re-parses
// the whole .ass) doesn't run on every pointermove.
const UPDATE_DEBOUNCE_MS = 120

// The JASSUB wasm has no OS fonts — every renderable family must be supplied
// as a file. Keys must be lowercase (jassub lowercases before lookup). Same
// TTFs are used by ffmpeg's fontsdir on the server, so preview and burn
// rasterize identical glyphs. jassub's own default `availableFonts` points at
// a ./default.woff2 the npm package doesn't ship (404 → "Error opening memory
// font"), so this map must always be passed explicitly.
const AVAILABLE_FONTS = {
  'liberation sans': liberationSansUrl,
  'liberation serif': liberationSerifUrl,
  'liberation mono': liberationMonoUrl,
  'anton': antonUrl,
  'roboto': robotoUrl,
  'source sans 3': sourceSans3Url,
  'lohit devanagari': lohitDevanagariUrl,
  'lohit bengali': lohitBengaliUrl,
  'lohit gujarati': lohitGujaratiUrl,
  'samyak gujarati': samyakGujaratiUrl,
  'samyak tamil': samyakTamilUrl,
  'samyak malayalam': samyakMalayalamUrl,
  'garuda': garudaUrl,
}

// Glyph-fallback pool for scripts the UI families don't cover (Devanagari,
// Bengali, Gujarati, Tamil, Malayalam, Thai) — transcripts are often Indic.
// ffmpeg's fontsdir scans the whole app/shared/fonts dir, so the same files
// back the burn; keeping this list in sync keeps preview === burn for
// non-Latin text. NotoColorEmoji is deliberately excluded here (9 MB download
// and libass color-emoji rendering is unreliable in the wasm build) — it only
// participates server-side.
const FALLBACK_FONTS = [
  lohitDevanagariUrl,
  lohitBengaliUrl,
  lohitGujaratiUrl,
  samyakGujaratiUrl,
  samyakTamilUrl,
  samyakMalayalamUrl,
  garudaUrl,
]

// Renders `assContent` (an .ass string built by @shared/assBuilder) onto a
// canvas overlaid on `videoRef.current` via libass/WASM — the same engine
// ffmpeg uses to burn subtitles, so the preview is pixel-accurate to the
// burned output. JASSUB owns canvas creation/sizing/letterboxing/resize
// internally; this component renders nothing itself.
export default function AssPreview({ videoRef, assContent }) {
  const instanceRef = useRef(null)
  const readyRef = useRef(null)
  const debounceRef = useRef(null)

  // One instance per mounted video element. Track content updates flow
  // through the effect below (setTrack), not by recreating the instance.
  useEffect(() => {
    const video = videoRef?.current
    if (!video) return

    const instance = new JASSUB({
      video,
      subContent: assContent || '\n',
      availableFonts: AVAILABLE_FONTS,
      fallbackFont: 'liberation sans',
      fonts: FALLBACK_FONTS,
    })
    instanceRef.current = instance
    readyRef.current = instance.ready

    return () => {
      clearTimeout(debounceRef.current)
      instance.destroy()
      instanceRef.current = null
      readyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef])

  useEffect(() => {
    const instance = instanceRef.current
    const ready = readyRef.current
    if (!instance || !ready) return

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      ready.then(() => {
        if (instanceRef.current !== instance) return // unmounted/recreated mid-flight
        if (assContent) instance.renderer.setTrack(assContent)
        else instance.renderer.freeTrack()
        // setTrack/freeTrack only swap the track in the wasm — jassub repaints
        // on video frame callbacks, which don't fire while paused. Without an
        // explicit render the edit only shows up on the next play/resize.
        const video = instance._video
        if (video?.paused && video.videoWidth) {
          instance.manualRender(
            { mediaTime: video.currentTime, width: video.videoWidth, height: video.videoHeight },
            true
          )
        }
      })
    }, UPDATE_DEBOUNCE_MS)

    return () => clearTimeout(debounceRef.current)
  }, [assContent])

  return null
}
