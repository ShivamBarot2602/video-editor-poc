import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { buildAss } from '@shared/assBuilder.mjs'
import AssPreview from './AssPreview'
import SubtitleDragLayer from './SubtitleDragLayer'

export default function VideoPlayer({ videoId, transcription, style, onStyleChange, videoRef: externalRef, onTimeChange, fillHeight = false }) {
  const internalRef = useRef(null)
  const containerRef = useRef(null)
  const videoRef = externalRef || internalRef

  const [currentTime, setCurrentTime] = useState(0)

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

  // Same .ass content the server burns — rendered through libass (JASSUB) so
  // the preview is WYSIWYG rather than an approximation.
  const assContent = useMemo(() => (
    transcription && style ? buildAss(transcription, style) : null
  ), [transcription, style])

  const handleDragPosition = useCallback((customPosition) => {
    onStyleChange?.(prev => ({ ...prev, position: 'custom', customPosition }))
  }, [onStyleChange])

  const videoUrl = `/api/video/${videoId}`

  return (
    <div style={fillHeight ? { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' } : null}>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          background: 'var(--video-bg)',
          borderRadius: 'var(--radius-frame)',
          overflow: 'hidden',
          ...(fillHeight ? { flex: 1, minHeight: 0 } : null),
        }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          // anonymous = cookies still sent same-origin (auth on /api/video/:id,
          // both dev proxy and the Vercel /api rewrite), omitted on the S3
          // presigned redirect (bucket CORS allows *). Untainted video lets
          // jassub read the frame color space instead of warning every frame.
          crossOrigin="anonymous"
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
        />
        {assContent && <AssPreview videoRef={videoRef} assContent={assContent} />}
        {style?.position === 'custom' && (
          <SubtitleDragLayer
            videoRef={videoRef}
            containerRef={containerRef}
            customPosition={style.customPosition}
            onChange={handleDragPosition}
          />
        )}
      </div>
    </div>
  )
}
