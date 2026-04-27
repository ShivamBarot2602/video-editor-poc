import { useMemo } from 'react'

const POSITION_STYLE = {
  'top-left':      { top: 0,    left: 0,    transform: 'none',               textAlign: 'left' },
  'top-center':    { top: 0,    left: '50%', transform: 'translateX(-50%)',  textAlign: 'center' },
  'top-right':     { top: 0,    right: 0,   transform: 'none',               textAlign: 'right' },
  'mid-left':      { top: '50%', left: 0,   transform: 'translateY(-50%)',   textAlign: 'left' },
  'center':        { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' },
  'mid-right':     { top: '50%', right: 0,  transform: 'translateY(-50%)',   textAlign: 'right' },
  'bottom-left':   { bottom: 0, left: 0,    transform: 'none',               textAlign: 'left' },
  'bottom-center': { bottom: 0, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' },
  'bottom-right':  { bottom: 0, right: 0,   transform: 'none',               textAlign: 'right' },
}

// Estimate words per line from font size and available width.
// avgCharWidth ≈ fontSize × 0.55, avg word length ≈ 6 chars incl. trailing space.
function calcWordsPerPage(scaledFontSize, containerWidth, maxLines) {
  const usableWidth  = (containerWidth || 800) * 0.9
  const avgWordWidth = scaledFontSize * 0.55 * 6
  const wordsPerLine = Math.max(3, Math.floor(usableWidth / avgWordWidth))
  return wordsPerLine * Math.max(1, maxLines || 2)
}

// Given word-timestamp array, return only the words that belong to the current
// "page" (the page whose window contains the most-recently-active word).
function getPagedWords(words, wordsPerPage, currentTime) {
  if (words.length === 0) return words

  // Find the latest word that has already started
  let activeIdx = 0
  for (let i = 0; i < words.length; i++) {
    if (currentTime >= words[i].start) activeIdx = i
  }

  const pageIdx  = Math.floor(activeIdx / wordsPerPage)
  return words.slice(pageIdx * wordsPerPage, (pageIdx + 1) * wordsPerPage)
}

// For segments without word timestamps, paginate plain text evenly by time.
function getPagedText(text, wordsPerPage, currentTime, segStart, segEnd) {
  const allWords = text.split(/\s+/).filter(Boolean)
  if (allWords.length <= wordsPerPage) return text

  const numPages    = Math.ceil(allWords.length / wordsPerPage)
  const duration    = Math.max(0.001, segEnd - segStart)
  const progress    = Math.min(1, (currentTime - segStart) / duration)
  const pageIdx     = Math.min(numPages - 1, Math.floor(progress * numPages))

  return allWords.slice(pageIdx * wordsPerPage, (pageIdx + 1) * wordsPerPage).join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────

function KaraokeWord({ word, currentTime, primaryColor, karaokeColor, karaokeStyle, outlineShadow }) {
  const isActive = currentTime >= word.start && currentTime < word.end
  const isPast   = currentTime >= word.end

  if (karaokeStyle === 'fill-left-to-right') {
    // Past words: plain color avoids background-clip + inherited textShadow artifacts
    if (isPast) return <span style={{ color: karaokeColor }}>{word.word}</span>

    if (isActive) {
      const progress = Math.max(0, Math.min(1,
        (currentTime - word.start) / Math.max(0.01, word.end - word.start)
      ))
      return (
        <span style={{
          display: 'inline-block',
          backgroundImage: `linear-gradient(to right, ${karaokeColor} ${progress * 100}%, ${primaryColor} ${progress * 100}%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: outlineShadow,
        }}>
          {word.word}
        </span>
      )
    }
    return <span style={{ color: `${primaryColor}99` }}>{word.word}</span>
  }

  if (karaokeStyle === 'color-sweep') {
    if (isActive) {
      const progress = Math.max(0, Math.min(1,
        (currentTime - word.start) / Math.max(0.01, word.end - word.start)
      ))
      return (
        <span style={{
          display: 'inline-block',
          backgroundImage: `linear-gradient(to right, ${karaokeColor} ${progress * 100 - 5}%, ${primaryColor} ${progress * 100 + 5}%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: outlineShadow,
        }}>
          {word.word}
        </span>
      )
    }
    const color = isPast ? primaryColor : `${primaryColor}99`
    return <span style={{ color }}>{word.word}</span>
  }

  // word-highlight (default): snap color switch at word boundary
  const color = isActive ? karaokeColor : isPast ? primaryColor : `${primaryColor}99`
  return <span style={{ color, transition: 'color 80ms linear' }}>{word.word}</span>
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SubtitleOverlay({ segments, currentTime, style, containerDimensions }) {
  const {
    fontFamily, fontSize, primaryColor, karaokeColor,
    outlineColor, outlineThickness, bold, italic,
    position, verticalMargin, backgroundBox, backgroundOpacity,
    karaokeStyle, maxLines = 2,
  } = style

  // Find the currently active segment
  const activeSegment = useMemo(() => {
    if (!segments) return null
    return segments.find(seg => currentTime >= seg.start && currentTime <= seg.end) || null
  }, [segments, currentTime])

  if (!activeSegment) return null

  // Scale font size relative to container width (reference: PlayResX = 1920)
  const scaledFontSize = Math.max(12, Math.round(fontSize * (containerDimensions.width || 800) / 1920))
  const wordsPerPage   = calcWordsPerPage(scaledFontSize, containerDimensions.width, maxLines)

  const pos      = POSITION_STYLE[position] || POSITION_STYLE['bottom-center']
  const isBottom = position.startsWith('bottom')
  const isTop    = position.startsWith('top')

  const containerStyle = {
    position: 'absolute',
    ...pos,
    ...(isBottom ? { bottom: verticalMargin } : isTop ? { top: verticalMargin } : {}),
    padding: backgroundBox ? `${Math.round(scaledFontSize * 0.25)}px ${Math.round(scaledFontSize * 0.5)}px` : 0,
    background: backgroundBox ? `rgba(0,0,0,${backgroundOpacity / 100})` : 'transparent',
    borderRadius: backgroundBox ? 4 : 0,
    maxWidth: '90%',
    pointerEvents: 'none',
    zIndex: 10,
  }

  const outlineShadow = outlineThickness > 0
    ? `${outlineColor} ${outlineThickness}px ${outlineThickness}px 0,
       ${outlineColor} -${outlineThickness}px ${outlineThickness}px 0,
       ${outlineColor} ${outlineThickness}px -${outlineThickness}px 0,
       ${outlineColor} -${outlineThickness}px -${outlineThickness}px 0`
    : 'none'

  const textStyle = {
    fontFamily,
    fontSize: scaledFontSize,
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? 'italic' : 'normal',
    color: primaryColor,
    textShadow: outlineShadow,
    lineHeight: 1.3,
    wordBreak: 'break-word',
  }

  const allWords         = activeSegment.words || []
  const hasWordTimestamps = allWords.length > 0

  return (
    <div style={containerStyle}>
      <div style={textStyle}>
        {hasWordTimestamps ? (() => {
          const pageWords = getPagedWords(allWords, wordsPerPage, currentTime)
          return pageWords.map((w, i) => (
            <span key={`${w.start}-${i}`}>
              <KaraokeWord
                word={w}
                currentTime={currentTime}
                primaryColor={primaryColor}
                karaokeColor={karaokeColor}
                karaokeStyle={karaokeStyle}
                outlineShadow={outlineShadow}
              />
              {i < pageWords.length - 1 && ' '}
            </span>
          ))
        })() : (
          <span>
            {getPagedText(activeSegment.text, wordsPerPage, currentTime, activeSegment.start, activeSegment.end)}
          </span>
        )}
      </div>
    </div>
  )
}
