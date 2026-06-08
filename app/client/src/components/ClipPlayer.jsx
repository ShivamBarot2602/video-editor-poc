import { useRef, useEffect, useState, useCallback } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'

// Small epsilon to beat frame-time granularity at the window boundary.
const EPS = 0.03

function fmtClock(s) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

/**
 * A video player clamped to a [start, end] window of the full source video.
 *
 * The element streams the whole original (`/api/video/:id`, Range-backed) but
 * the user can only ever play/scrub inside the clip window — native controls
 * are omitted (their scrub bar would escape the window) and replaced with a
 * custom row whose scrubber maps 0..clipDuration onto [start, end].
 *
 * Defaults to LOOP (short snippets are re-watched repeatedly during review).
 * Never autoplays — so a grid of cards doesn't all blare audio at once.
 */
export default function ClipPlayer({ videoId, start, end, loop = true, aspectRatio = '16 / 9' }) {
  const videoRef = useRef(null)
  const wantPlayRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [relTime, setRelTime] = useState(0)

  const clipDuration = Math.max(0.1, end - start)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const seekToStart = () => {
      const realEnd = Math.min(end, v.duration || end)
      const s = Math.max(0, Math.min(start, realEnd - 0.1))
      try { v.currentTime = s } catch (_) {}
    }

    const onMeta = () => {
      setReady(true)
      seekToStart()
      if (wantPlayRef.current) {
        wantPlayRef.current = false
        v.play().then(() => setPlaying(true)).catch(() => {})
      }
    }

    const onTime = () => {
      const t = v.currentTime
      if (t >= end - EPS) {
        if (loop) {
          v.currentTime = start // seamless loop — keep playing
        } else {
          v.pause()
          v.currentTime = end
          setPlaying(false)
        }
      } else if (t < start - EPS) {
        v.currentTime = start
      }
      setRelTime(Math.max(0, Math.min(t - start, clipDuration)))
    }

    // Safety net: any seek (keyboard, programmatic) that lands outside the
    // window is pulled back in.
    const onSeeking = () => {
      if (v.currentTime > end) v.currentTime = end
      else if (v.currentTime < start) v.currentTime = start
    }

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      if (loop) { v.currentTime = start; v.play().catch(() => {}) }
      else setPlaying(false)
    }

    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('seeking', onSeeking)
    v.addEventListener('seeked', onSeeking)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnded)

    // Metadata may already be loaded (StrictMode double-mount / cached) — seek now.
    if (v.readyState >= 1) onMeta()

    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('seeking', onSeeking)
      v.removeEventListener('seeked', onSeeking)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnded)
      v.pause() // stop background audio/network when the card unmounts
    }
  }, [start, end, loop, clipDuration])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (!ready) { wantPlayRef.current = true; return }
    if (v.paused) {
      if (v.currentTime < start || v.currentTime >= end - EPS) v.currentTime = start
      v.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      v.pause()
    }
  }, [ready, start, end])

  const onScrub = (e) => {
    const v = videoRef.current
    if (!v) return
    const target = start + Number(e.target.value)
    v.currentTime = Math.max(start, Math.min(target, end - EPS))
    setRelTime(Math.max(0, Math.min(target - start, clipDuration)))
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          position: 'relative', width: '100%', aspectRatio,
          background: '#000', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={`/api/video/${videoId}`}
          preload="metadata"
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
        {/* Big center play affordance while paused */}
        {!playing && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}
          >
            <Play size={22} color="#fff" style={{ marginLeft: 2 }} />
          </span>
        )}
      </div>

      {/* Custom control row — replaces native controls so seeking can't escape. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px', background: 'var(--surface-dark)',
        borderTop: '1px solid var(--border-sub)',
      }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={togglePlay}
          aria-label={playing ? 'Pause clip' : 'Play clip'}
          style={{ padding: '4px 6px', flexShrink: 0 }}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>

        <input
          type="range"
          min={0}
          max={clipDuration}
          step={0.01}
          value={relTime}
          onChange={onScrub}
          aria-label="Clip position"
          style={{ flex: 1 }}
        />

        <span style={{
          fontSize: 10, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums',
          flexShrink: 0, minWidth: 64, textAlign: 'right',
        }}>
          {fmtClock(relTime)} / {fmtClock(clipDuration)}
        </span>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          style={{ padding: '4px 6px', flexShrink: 0 }}
        >
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
      </div>
    </div>
  )
}
