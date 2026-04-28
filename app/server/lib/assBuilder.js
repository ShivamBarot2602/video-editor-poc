/**
 * Build an ASS (Advanced SubStation Alpha) subtitle file from a transcription
 * and style settings object.
 *
 * ASS colour format:  &HAABBGGRR  (AA = alpha: 00=opaque, FF=invisible)
 * ASS numpad alignment:
 *   7  8  9
 *   4  5  6
 *   1  2  3
 *
 * Karaoke tags:
 *   \k<cs>   — hard switch at word start (Word Highlight)
 *   \kf<cs>  — fill left-to-right during word (Fill L→R)
 *   \ko<cs>  — outline karaoke (Color Sweep; closest ASS equivalent)
 */

const POSITION_TO_ALIGNMENT = {
  'top-left': 7, 'top-center': 8, 'top-right': 9,
  'mid-left': 4, 'center': 5,    'mid-right': 6,
  'bottom-left': 1, 'bottom-center': 2, 'bottom-right': 3,
}

const KARAOKE_TAG = {
  'word-highlight': 'k',
  'fill-left-to-right': 'kf',
  'color-sweep': 'ko',
}

// #RRGGBB  →  &H00BBGGRR
function hexToAss(hex) {
  const h = hex.replace('#', '').padStart(6, '0')
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase()
}

// opacity 0–100 (%) → ASS alpha byte (00=opaque, FF=invisible)
function opacityToAssAlpha(opacity) {
  const alpha = Math.round((1 - opacity / 100) * 255)
  return alpha.toString(16).padStart(2, '0').toUpperCase()
}

function assTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

function buildKaraokeText(segment, karaokeStyle) {
  const words = segment.words || []
  const tag = KARAOKE_TAG[karaokeStyle] || 'k'

  if (words.length === 0) return segment.text

  return words.map((w, i) => {
    const nextStart = words[i + 1]?.start ?? segment.end
    const durationCs = Math.max(1, Math.round((nextStart - w.start) * 100))
    return `{\\${tag}${durationCs}}${w.word}`
  }).join(' ')
}

// ─── Pagination ──────────────────────────────────────────────────────────────

// PlayResX=1920, maxWidth=90%; avgCharWidth ≈ fontSize × 0.55; avgWordLen ≈ 6 chars.
function calcWordsPerPage(fontSize, maxLines) {
  const usableWidth  = 1920 * 0.9
  const avgWordWidth = fontSize * 0.55 * 6
  const wordsPerLine = Math.max(3, Math.floor(usableWidth / avgWordWidth))
  return wordsPerLine * Math.max(1, maxLines || 2)
}

/**
 * Split a segment into display pages so each page fits within maxLines rows.
 * Returns an array of segment-like objects, each covering one page of words.
 */
function paginateSegment(seg, wordsPerPage) {
  const words = seg.words || []

  // ── Has word timestamps ──────────────────────────────────────────────────
  if (words.length > 0) {
    if (words.length <= wordsPerPage) return [seg]

    const pages = []
    for (let i = 0; i < words.length; i += wordsPerPage) {
      const chunk = words.slice(i, i + wordsPerPage)
      pages.push({
        ...seg,
        start: chunk[0].start,
        end:   chunk[chunk.length - 1].end,
        text:  chunk.map(w => w.word).join(' '),
        words: chunk,
      })
    }
    return pages
  }

  // ── No word timestamps: split text evenly, distribute time proportionally ─
  const textWords = seg.text.split(/\s+/).filter(Boolean)
  if (textWords.length <= wordsPerPage) return [seg]

  const timePerWord = (seg.end - seg.start) / textWords.length
  const pages = []
  for (let i = 0; i < textWords.length; i += wordsPerPage) {
    const chunk = textWords.slice(i, i + wordsPerPage)
    pages.push({
      ...seg,
      start: seg.start + i * timePerWord,
      end:   seg.start + Math.min(i + wordsPerPage, textWords.length) * timePerWord,
      text:  chunk.join(' '),
      words: [],
    })
  }
  return pages
}

// ─────────────────────────────────────────────────────────────────────────────

function buildAss(transcription, style) {
  const {
    fontFamily = 'Arial',
    fontSize = 48,
    primaryColor = '#FFFFFF',
    karaokeColor = '#FFD700',
    outlineColor = '#000000',
    outlineThickness = 2,
    fontWeight = 400,
    bold = false,
    italic = false,
    position = 'bottom-center',
    verticalMargin = 30,
    backgroundBox = 'off',
    backgroundOpacity = 70,
    karaokeStyle = 'word-highlight',
    maxLines = 2,
  } = style

  const alignment = POSITION_TO_ALIGNMENT[position] ?? 2
  // In ASS karaoke: SecondaryColour = upcoming/unspoken state, PrimaryColour = post-highlight state.
  // We want: upcoming words shown in primaryColor (white), highlighted/spoken in karaokeColor (yellow).
  // So: PrimaryColour ← karaokeColor, SecondaryColour ← primaryColor.
  const primaryAss   = hexToAss(karaokeColor)    // color words transition TO (highlighted/spoken)
  const secondaryAss = hexToAss(primaryColor)    // color words start as (upcoming/unspoken)
  const outlineAss   = hexToAss(outlineColor)
  const hasBox       = backgroundBox === 'solid' || backgroundBox === 'blur'
  const isBold       = (fontWeight >= 600) || bold
  const boxAlpha     = opacityToAssAlpha(backgroundOpacity)
  const backAss      = hasBox ? `&H${boxAlpha}000000` : '&H00000000'
  const borderStyle  = hasBox ? 4 : 1
  const outline      = hasBox ? 0 : outlineThickness

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${primaryAss},${secondaryAss},${outlineAss},${backAss},${isBold ? -1 : 0},${italic ? -1 : 0},0,0,100,100,0,0,${borderStyle},${outline},0,${alignment},10,10,${verticalMargin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

  const wordsPerPage = calcWordsPerPage(fontSize, maxLines)

  const events = []
  for (const seg of (transcription.segments || [])) {
    for (const page of paginateSegment(seg, wordsPerPage)) {
      const start = assTime(page.start)
      const end   = assTime(page.end)
      const text  = buildKaraokeText(page, karaokeStyle)
      events.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`)
    }
  }

  return `${header}\n${events.join('\n')}\n`
}

module.exports = { buildAss }
