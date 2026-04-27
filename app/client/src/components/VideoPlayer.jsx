import { useRef, useEffect, useState } from 'react'
import SubtitleOverlay from './SubtitleOverlay'

export default function VideoPlayer({ videoId, transcription, style, videoRef: externalRef }) {
  const internalRef = useRef(null)
  const containerRef = useRef(null)
  const videoRef = externalRef || internalRef

  const [currentTime, setCurrentTime] = useState(0)
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 })

  // Track current playback time
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => setCurrentTime(video.currentTime)
    video.addEventListener('timeupdate', onTime)
    return () => video.removeEventListener('timeupdate', onTime)
  }, [videoRef])

  // Track rendered video size (accounts for letterboxing)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const obs = new ResizeObserver(() => {
      const video = videoRef.current
      if (!video) return
      setVideoDimensions({ width: video.clientWidth, height: video.clientHeight })
    })
    obs.observe(container)
    return () => obs.disconnect()
  }, [videoRef])

  const videoUrl = `/api/video/${videoId}`

  return (
    <div>
      <div
        ref={containerRef}
        style={{ position: 'relative', background: '#000', borderRadius: 10, overflow: 'hidden' }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          style={{ width: '100%', display: 'block', maxHeight: '60vh', objectFit: 'contain' }}
          onLoadedMetadata={() => {
            const v = videoRef.current
            if (v) setVideoDimensions({ width: v.clientWidth, height: v.clientHeight })
          }}
        />
        {transcription && (
          <SubtitleOverlay
            segments={transcription.segments}
            currentTime={currentTime}
            style={style}
            containerDimensions={videoDimensions}
          />
        )}
      </div>
    </div>
  )
}
