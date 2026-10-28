import { Maximize, Minimize, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { formatMs } from '../core/time.js'

const SKIP_MS = 5000

function IconButton({ label, onClick, children }) {
  return (
    <button type="button" className="sc-icon-btn" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  )
}

// Transport (spec 05 §5): mute, time / duration, ±5 s, play/pause, fullscreen.
// Laid out like the reference: 🔊 00:00:12  ⏮ ▶ ⏭  00:10:12 ⛶
export default function TransportBar({ player, isFullscreen, onToggleFullscreen }) {
  const { currentMs, durationMs, playing, muted, ready } = player

  return (
    <div className="sc-transport">
      <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={() => player.setMuted(!muted)}>
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </IconButton>
      <span className="sc-time" aria-label="Current time">{formatMs(currentMs, { withHours: true })}</span>

      <IconButton label="Back 5 seconds" onClick={() => player.step(-SKIP_MS)}>
        <SkipBack size={20} />
      </IconButton>
      <button
        type="button"
        className="sc-play-btn"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={player.toggle}
        disabled={!ready}
      >
        {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
      </button>
      <IconButton label="Forward 5 seconds" onClick={() => player.step(SKIP_MS)}>
        <SkipForward size={20} />
      </IconButton>

      <span className="sc-time" aria-label="Duration">{formatMs(durationMs, { withHours: true })}</span>
      <IconButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={onToggleFullscreen}>
        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
      </IconButton>
    </div>
  )
}
