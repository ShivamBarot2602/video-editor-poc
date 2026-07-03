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
 * Karaoke / word effects (see buildBody):
 *   Word Highlight — \k<cs>   hard colour switch at word start
 *   Fill L→R       — \kf<cs>  fill left-to-right during word
 *   Color Sweep    — \1c + \t a single lit word travels the line, then reverts
 *   Pop-on         — \alpha   each word starts invisible, appears when spoken
 *   Active-word scale + ALL-CAPS + per-speaker colour layer on top of these.
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

// Separator before word index `i`: force a line break (\N) every wordsPerLine
// words so libass renders exactly the requested number of lines (Max Lines);
// otherwise a plain space. No separator before the first word.
function wordSep(i, wordsPerLine) {
  if (i === 0) return ''
  return (wordsPerLine > 0 && i % wordsPerLine === 0) ? '\\N' : ' '
}

// Escape a word and apply ALL-CAPS if requested. Uppercasing before escape is
// safe (escape only adds '\N' for newlines, which is already upper-case).
function fmtWord(text, transform) {
  const t = escapeAssText(transform === 'uppercase' ? String(text ?? '').toUpperCase() : text)
  return t
}

// Plain (non-karaoke) text broken into lines every wordsPerLine words.
function breakPlainText(text, wordsPerLine, transform) {
  const parts = fmtWord(text, transform).split(' ')
  return parts.map((p, i) => wordSep(i, wordsPerLine) + p).join('')
}

// Unified word-timed body builder. One code path for every karaoke effect plus
// the shared line-break, ALL-CAPS, and active-word scale-up behaviour. Falls
// back to plain broken text when the segment has no per-word timings.
//
//   word-highlight → \k       hard colour switch (spoken = PrimaryColour)
//   fill-left→right → \kf      smooth fill over the word's duration
//   color-sweep     → \1c + \t a single lit word travels the line, then reverts
//   pop-on          → \alpha   each word starts invisible, appears at spoken time
//
// activeScale (>100) wraps every word in a quick scale-up-and-settle at its
// spoken moment (\fscx/\fscy via \t) — the subtle "pop" of modern captions.
// baseColor is the resting fill for sweep/pop-on (per-speaker colour or the
// style's primary/unspoken colour); flashColor is the highlight (karaoke) colour.
// All \t times are milliseconds relative to the event (line) start.
function buildBody(seg, ctx) {
  const { karaokeStyle, wordsPerLine, transform, activeScale, baseColor, flashColor } = ctx
  const words = seg.words || []
  if (words.length === 0) return breakPlainText(seg.text, wordsPerLine, transform)

  const scaleOn = activeScale > 100
  const lineStart = seg.start
  const body = words.map((w, i) => {
    const nextStart = words[i + 1]?.start ?? seg.end
    const t0 = Math.max(0, Math.round((w.start - lineStart) * 1000))
    const t2 = Math.max(t0 + 1, Math.round((nextStart - lineStart) * 1000))
    const durCs = Math.max(1, Math.round((nextStart - w.start) * 100))
    const tMid = Math.min(t0 + 100, t2)

    let tag
    if (karaokeStyle === 'fill-left-to-right') tag = `\\kf${durCs}`
    else if (karaokeStyle === 'color-sweep') tag = `\\1c${baseColor}&\\t(${t0},${t0 + 120},\\1c${flashColor}&)\\t(${t0 + 120},${t2},\\1c${baseColor}&)`
    else if (karaokeStyle === 'pop-on') {
      // Reveal at spoken time. With active-word emphasis on, also flash to the
      // highlight colour and settle back — so pop-on gets scale AND colour
      // (the "combo"); the other modes already recolour the spoken word.
      tag = scaleOn
        ? `\\1c${baseColor}&\\alpha&HFF&\\t(${t0},${t0 + 1},\\alpha&H00&)\\t(${t0},${tMid},\\1c${flashColor}&)\\t(${tMid},${t2},\\1c${baseColor}&)`
        : `\\1c${baseColor}&\\alpha&HFF&\\t(${t0},${t0 + 1},\\alpha&H00&)`
    }
    else tag = `\\k${durCs}` // word-highlight (default)

    if (scaleOn) {
      // Quick scale-up-and-settle on the spoken word. Vertical bounce it would
      // cause is neutralised by the line-height anchor appended below.
      tag += `\\t(${t0},${tMid},\\fscx${activeScale}\\fscy${activeScale})\\t(${tMid},${t2},\\fscx100\\fscy100)`
    }
    return `${wordSep(i, wordsPerLine)}{${tag}}${fmtWord(w.word, transform)}`
  }).join('')

  // Scaling a word grows the whole line's bounding box, so libass re-lays the
  // line every time a new word scales → the line "bounces" vertically. Pin the
  // box to a constant (max-scale) height with an invisible, zero-width anchor at
  // the line end: it always renders at the largest fscy, so the box height never
  // changes as words scale. \r resets to the Default style first; ​ adds no
  // horizontal advance. (A small horizontal re-centre from the wider active word
  // is inherent to centred flowing text and can't be removed in libass.)
  return scaleOn ? `${body}{\\r\\fscy${activeScale}\\alpha&HFF&}​` : body
}

// ─── Pagination ──────────────────────────────────────────────────────────────

// PlayResX=1920, maxWidth=90%; avgCharWidth ≈ fontSize × 0.55; avgWordLen ≈ 6 chars.
// Returns both the per-line word budget (used to inject \N breaks so Max Lines
// is honoured) and the per-page total (used to paginate long segments).
// `manualWordsPerLine` > 0 overrides the width-based estimate.
function calcLayout(fontSize, maxLines, manualWordsPerLine) {
  const usableWidth  = PLAY_RES_X * 0.9
  const avgWordWidth = fontSize * 0.55 * 6
  const autoPerLine  = Math.max(3, Math.floor(usableWidth / avgWordWidth))
  const wordsPerLine = manualWordsPerLine > 0 ? manualWordsPerLine : autoPerLine
  const lines = Math.max(1, maxLines || 2)
  return { wordsPerLine, wordsPerPage: wordsPerLine * lines }
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
    boxPadding = 20,
    karaokeStyle = 'word-highlight',
    animationIn = 'none',
    animationOut = 'none',
    wordTimingOffset = 0,
    maxLines = 2,
    wordsPerLine = 0,
    textTransform = 'none',
    shadow = 0,
    letterSpacing = 0,
    activeWordScale = 100,
    speakerColors = null,
    speakerColorsEnabled = false,
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
  const safeWordsPerLine = Math.round(numOr(wordsPerLine, 0, 30, 0))
  const safeBoxPadding = numOr(boxPadding, 0, 100, 20)
  const safeShadow = numOr(shadow, 0, 20, 0)
  const safeLetterSpacing = Math.round(numOr(letterSpacing, -20, 100, 0))
  const safeActiveScale = Math.round(numOr(activeWordScale, 100, 300, 100))
  const transform = textTransform === 'uppercase' ? 'uppercase' : 'none'
  // ms → seconds; shifts each event's start/end so the whole subtitle (and its
  // karaoke schedule, which is anchored to the event start) leads/lags the audio.
  const offsetSec = numOr(wordTimingOffset, -5000, 5000, 0) / 1000

  // Per-speaker fill colours. Validated to real 6-hex values so an invalid/empty
  // entry simply leaves that speaker on the default colour rather than injecting.
  const spkColors = {}
  if (speakerColorsEnabled && speakerColors && typeof speakerColors === 'object') {
    for (const [spk, hex] of Object.entries(speakerColors)) {
      if (/^#?[0-9a-fA-F]{6}$/.test(String(hex ?? '').replace('#', ''))) {
        spkColors[spk] = hexToAss(hex)
      }
    }
  }

  const useCustom = position === 'custom' && customPosition && typeof customPosition === 'object'
  const customX = numOr(customPosition?.x, 0, 1, 0.5)
  const customY = numOr(customPosition?.y, 0, 1, 0.9)
  const alignment = useCustom ? 5 : (POSITION_TO_ALIGNMENT[position] ?? 2)

  // Per-event override components: free-position tag + fade in/out. These are
  // the same for every event; the per-speaker colour (below) varies, so the
  // final brace is assembled per Dialogue in the loop.
  const posInner = useCustom
    ? `\\an5\\pos(${Math.round(customX * PLAY_RES_X)},${Math.round(customY * PLAY_RES_Y)})`
    : ''
  const fadeIn  = animationIn === 'fade' ? 200 : 0
  const fadeOut = animationOut === 'fade' ? 200 : 0
  const fadeInner = (fadeIn || fadeOut) ? `\\fad(${fadeIn},${fadeOut})` : ''

  // In ASS karaoke: SecondaryColour = upcoming/unspoken state, PrimaryColour = post-highlight state.
  // We want: upcoming words shown in primaryColor (white), highlighted/spoken in karaokeColor (yellow).
  // So: PrimaryColour ← karaokeColor, SecondaryColour ← primaryColor.
  const primaryAss   = hexToAss(karaokeColor, '#FFD700')  // color words transition TO (highlighted/spoken)
  const secondaryAss = hexToAss(primaryColor, '#FFFFFF')  // color words start as (upcoming/unspoken)
  const hasBox       = backgroundBox === 'solid' || backgroundBox === 'blur'
  // In box mode (BorderStyle=4) the Outline value both grows the box AND strokes
  // the glyphs in OutlineColour. We want the growth (= padding) but not the
  // stroke, so force a fully-transparent outline colour — the box still pads out
  // from the glyphs, but no visible stroke is drawn. Outside box mode it's the
  // real text outline colour.
  const outlineAss   = hasBox ? '&HFF000000' : hexToAss(outlineColor, '#000000')
  const isBold       = (safeFontWeight >= 600) || !!bold
  const boxAlpha     = opacityToAssAlpha(backgroundOpacity)
  const backAss      = hasBox ? `&H${boxAlpha}000000` : '&H00000000'
  const borderStyle  = hasBox ? 4 : 1
  // BorderStyle=4: libass uses the Outline value as box padding (text→box edge),
  // not as a text outline — so a solid box and a text outline can't coexist.
  const outline      = hasBox ? safeBoxPadding : safeOutlineThickness

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${PLAY_RES_X}
PlayResY: ${PLAY_RES_Y}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${safeFontFamily},${safeFontSize},${primaryAss},${secondaryAss},${outlineAss},${backAss},${isBold ? -1 : 0},${italic ? -1 : 0},0,0,100,100,${safeLetterSpacing},0,${borderStyle},${outline},${safeShadow},${alignment},10,10,${safeVerticalMargin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

  const { wordsPerLine: perLine, wordsPerPage } = calcLayout(safeFontSize, safeMaxLines, safeWordsPerLine)

  const events = []
  for (const seg of (transcription.segments || [])) {
    // When the user edited the text, per-word timings (seg.words) no longer
    // align with the new wording. Use the edited text and drop words so both
    // pagination and buildBody fall back to plain (non-karaoke) text — mirrors
    // the editor preview (TranscriptionPanel), which also disables karaoke for
    // edited segments.
    const effSeg = seg.text_edited
      ? { ...seg, text: seg.text_edited, words: [] }
      : seg

    // Per-speaker colour: overrides the primary fill. It's both the resting
    // colour for sweep/pop-on (baseColor) and, via the event prefix, the primary
    // fill for \k/\kf and plain text. Falls back to the style's colours.
    const spk = spkColors[seg.speaker]
    const baseColor = spk || secondaryAss
    const spkInner = spk ? `\\1c${spk}&` : ''
    const prefix = (posInner || fadeInner || spkInner)
      ? `{${posInner}${fadeInner}${spkInner}}`
      : ''
    const ctx = {
      karaokeStyle, wordsPerLine: perLine, transform,
      activeScale: safeActiveScale, baseColor, flashColor: primaryAss,
    }

    for (const page of paginateSegment(effSeg, wordsPerPage)) {
      const start = assTime(Math.max(0, page.start + offsetSec))
      const end   = assTime(Math.max(0, page.end + offsetSec))
      events.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${prefix}${buildBody(page, ctx)}`)
    }
  }

  return `${header}\n${events.join('\n')}\n`
}

export { buildAss }
