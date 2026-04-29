import { useRef, useEffect, useState } from 'react'
import SubtitleOverlay from './SubtitleOverlay'

export default function VideoPlayer({ videoId, transcription, style, videoRef: externalRef, onTimeChange, fillHeight = false }) {
  const internalRef = useRef(null)
  const containerRef = useRef(null)
  const videoRef = externalRef || internalRef

  const [currentTime, setCurrentTime] = useState(0)
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 })

  // Track current playback time
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => {
      const t = video.currentTime
      setCurrentTime(t)
      onTimeChange?.(t)
    }
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('seeked', onTime)
    video.addEventListener('loadedmetadata', onTime)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('seeked', onTime)
      video.removeEventListener('loadedmetadata', onTime)
    }
  }, [videoRef, onTimeChange])

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
    <div style={fillHeight ? { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' } : null}>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          background: '#000',
          borderRadius: 10,
          overflow: 'hidden',
          ...(fillHeight ? { flex: 1, minHeight: 0 } : null),
        }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          style={{
            width: '100%',
            display: 'block',
            objectFit: 'contain',
            ...(fillHeight
              ? { height: '100%', maxHeight: '100%' }
              : { maxHeight: '60vh' }
            ),
          }}
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
