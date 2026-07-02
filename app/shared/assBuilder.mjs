/**
 * Build an ASS (Advanced SubStation Alpha) subtitle file from a transcription
 * and style settings object.
 *
 * Shared between server (burn/export, via a CJS shim in
 * app/server/lib/assBuilder.js) and client (live WYSIWYG preview via JASSUB)
 * so both render from byte-identical .ass content — this file is the single
 * source of truth for style → ASS mapping.
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
 *
 * Free positioning (style.position === 'custom'):
 *   style.customPosition = { x, y } — center of the subtitle block, normalized
 *   0–1 over the PlayResX/PlayResY (1920×1080) design space. Emitted as
 *   \an5\pos(x*1920, y*1080) per event, which overrides the style's Alignment
 *   and MarginV — verticalMargin is inert in custom mode.
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

const PLAY_RES_X = 1920
const PLAY_RES_Y = 1080

// #RRGGBB  →  &H00BBGGRR. Anything not exactly 6 hex digits (after stripping
// '#') falls back to `fallback` — this is a hard whitelist, not just clamping:
// unvalidated input here can otherwise land a literal comma/newline inside the
// [V4+ Styles] line (e.g. padStart only pads short strings, it doesn't strip
// bad characters already present), breaking out into arbitrary injected ASS.
function hexToAss(hex, fallback = '#FFFFFF') {
  const raw = String(hex ?? '').replace('#', '')
  const h = /^[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback.replace('#', '')
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase()
}

// opacity 0–100 (%) → ASS alpha byte (00=opaque, FF=invisible). Non-numeric or
// out-of-range input falls back to 70 rather than propagating NaN into the file.
function opacityToAssAlpha(opacity) {
  const n = Number(opacity)
  const clamped = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 70
  const alpha = Math.round((1 - clamped / 100) * 255)
  return alpha.toString(16).padStart(2, '0').toUpperCase()
}

// Coerce to a finite number within [min, max], else `fallback`. Guards every
// numeric style field that gets string-interpolated straight into the .ass —
// an unvalidated string (e.g. a JSON body sending fontSize as "1,\ninjected")
// would otherwise inject a newline/comma into the header line.
function numOr(value, min, max, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

// Strips characters that are structurally meaningful in the ASS Style line
// (comma = field separator, braces/backslash = override-tag syntax, newline =
// new line) — a font name doesn't legitimately need any of these.
function sanitizeFontFamily(name) {
  const cleaned = String(name ?? '').replace(/[,{}\\\r\n]/g, '').trim().slice(0, 100)
  return cleaned || 'Liberation Sans'
}

// Escapes user-controlled subtitle text before it lands in a Dialogue line:
//   - real newlines → ASS's own forced-break sequence \N (safe, two chars)
//   - literal { or } stripped — prevents transcript text from opening an ASS
//     override-tag block (e.g. a typed "{\move(...)}" would otherwise be
//     interpreted as an animation command by libass, not shown as text)
// Apply to raw words/segment text BEFORE wrapping in our own {\k..} tags, so
// the tags we deliberately emit are never touched by this.
function escapeAssText(text) {
  return String(text ?? '').replace(/\r\n|\r|\n/g, '\\N').replace(/[{}]/g, '')
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

  if (words.length === 0) return escapeAssText(segment.text)

  return words.map((w, i) => {
    const nextStart = words[i + 1]?.start ?? segment.end
    const durationCs = Math.max(1, Math.round((nextStart - w.start) * 100))
    return `{\\${tag}${durationCs}}${escapeAssText(w.word)}`
  }).join(' ')
}

// ─── Pagination ──────────────────────────────────────────────────────────────

// PlayResX=1920, maxWidth=90%; avgCharWidth ≈ fontSize × 0.55; avgWordLen ≈ 6 chars.
function calcWordsPerPage(fontSize, maxLines) {
  const usableWidth  = PLAY_RES_X * 0.9
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
    fontFamily = 'Liberation Sans',
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
    customPosition = null,
  } = style || {}

  // Every field below is attacker-controlled (POST /api/burn body) and gets
  // string-interpolated straight into the .ass file ffmpeg/libass parses —
  // validate types/ranges here, once, rather than trusting the caller.
  const safeFontFamily = sanitizeFontFamily(fontFamily)
  const safeFontSize = numOr(fontSize, 1, 500, 48)
  const safeOutlineThickness = numOr(outlineThickness, 0, 50, 2)
  const safeFontWeight = numOr(fontWeight, 100, 900, 400)
  const safeVerticalMargin = Math.round(numOr(verticalMargin, 0, 2000, 30))
  const safeMaxLines = Math.round(numOr(maxLines, 1, 10, 2))

  const useCustom = position === 'custom' && customPosition && typeof customPosition === 'object'
  const customX = numOr(customPosition?.x, 0, 1, 0.5)
  const customY = numOr(customPosition?.y, 0, 1, 0.9)
  const posTag = useCustom
    ? `{\\an5\\pos(${Math.round(customX * PLAY_RES_X)},${Math.round(customY * PLAY_RES_Y)})}`
    : ''
  const alignment = useCustom ? 5 : (POSITION_TO_ALIGNMENT[position] ?? 2)

  // In ASS karaoke: SecondaryColour = upcoming/unspoken state, PrimaryColour = post-highlight state.
  // We want: upcoming words shown in primaryColor (white), highlighted/spoken in karaokeColor (yellow).
  // So: PrimaryColour ← karaokeColor, SecondaryColour ← primaryColor.
  const primaryAss   = hexToAss(karaokeColor, '#FFD700')  // color words transition TO (highlighted/spoken)
  const secondaryAss = hexToAss(primaryColor, '#FFFFFF')  // color words start as (upcoming/unspoken)
  const outlineAss   = hexToAss(outlineColor, '#000000')
  const hasBox       = backgroundBox === 'solid' || backgroundBox === 'blur'
  const isBold       = (safeFontWeight >= 600) || !!bold
  const boxAlpha     = opacityToAssAlpha(backgroundOpacity)
  const backAss      = hasBox ? `&H${boxAlpha}000000` : '&H00000000'
  const borderStyle  = hasBox ? 4 : 1
  const outline      = hasBox ? 0 : safeOutlineThickness

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${PLAY_RES_X}
PlayResY: ${PLAY_RES_Y}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${safeFontFamily},${safeFontSize},${primaryAss},${secondaryAss},${outlineAss},${backAss},${isBold ? -1 : 0},${italic ? -1 : 0},0,0,100,100,0,0,${borderStyle},${outline},0,${alignment},10,10,${safeVerticalMargin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

  const wordsPerPage = calcWordsPerPage(safeFontSize, safeMaxLines)

  const events = []
  for (const seg of (transcription.segments || [])) {
    // When the user edited the text, per-word timings (seg.words) no longer
    // align with the new wording. Use the edited text and drop words so both
    // pagination and buildKaraokeText fall back to plain (non-karaoke) text —
    // mirrors the editor preview (TranscriptionPanel), which also disables
    // karaoke for edited segments.
    const effSeg = seg.text_edited
      ? { ...seg, text: seg.text_edited, words: [] }
      : seg
    for (const page of paginateSegment(effSeg, wordsPerPage)) {
      const start = assTime(page.start)
      const end   = assTime(page.end)
      const text  = posTag + buildKaraokeText(page, karaokeStyle)
      events.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`)
    }
  }

  return `${header}\n${events.join('\n')}\n`
}

export { buildAss }
