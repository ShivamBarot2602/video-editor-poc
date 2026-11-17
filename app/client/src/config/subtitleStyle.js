// Canonical subtitle-style schema + transcription export formats.
// (Previously defined in and exported from pages/EditorPage.jsx.)

// Families the app can actually render identically in preview (JASSUB) and
// burn (ffmpeg fontsdir) — each maps to a TTF shipped in app/shared/fonts.
// Proprietary names (Arial, Impact, …) were dropped: neither the wasm nor the
// Linux deploy has them, so they silently substituted anyway.
export const FONT_FAMILIES = [
  'Liberation Sans',   // Arial-metric-compatible
  'Roboto',
  'Source Sans 3',
  'Anton',             // Impact-alike display face
  'Liberation Serif',  // Times-metric-compatible
  'Liberation Mono',   // Courier-metric-compatible
  // Script-specific families (names must match the font's internal family
  // name — libass looks Fontname up by that, not by filename)
  'Lohit Devanagari',  // Hindi/Marathi
  'Lohit Bengali',
  'Lohit Gujarati',
  'Samyak Gujarati',
  'Samyak Tamil',
  'Samyak Malayalam',
  'Garuda',            // Thai
]

// Styles saved before the font swap (localStorage) reference proprietary
// names; map them onto the closest shipped family instead of falling back.
export const LEGACY_FONT_MAP = {
  'Arial': 'Liberation Sans',
  'Source Sans Pro': 'Source Sans 3',
  'Impact': 'Anton',
  'Times New Roman': 'Liberation Serif',
  'Courier New': 'Liberation Mono',
}

export function migrateStyleFonts(style) {
  if (!style || typeof style !== 'object') return style
  const mapped = LEGACY_FONT_MAP[style.fontFamily]
  return mapped ? { ...style, fontFamily: mapped } : style
}

export const DEFAULT_STYLE = {
  fontFamily: 'Liberation Sans',
  fontSize: 48,
  fontWeight: 600,          // 400 Regular | 600 SemiBold | 700 Bold
  primaryColor: '#FFFFFF',
  karaokeColor: '#FFD700',
  outlineColor: '#000000',
  outlineThickness: 2,
  italic: false,
  position: 'bottom-center',
  customPosition: null,     // { x, y } normalized 0-1, center of block — set when position === 'custom'
  verticalMargin: 30,
  backgroundBox: 'off',     // 'off' | 'solid'
  backgroundOpacity: 70,
  boxPadding: 20,           // px padding text→box edge (only when box is solid)
  karaokeStyle: 'word-highlight',
  animationIn: 'none',      // 'none' | 'fade'
  wordTimingOffset: 0,
  maxLines: 2,
  wordsPerLine: 0,          // 0 = auto (fit by width); >0 = force N words per line
  outputFormat: 'mp4',      // 'mp4' | 'webm'
  quality: 23,              // CRF value
}

// Transcription export formats shown in the Export menu.
// `kind: 'json'` is rendered client-side; `kind: 'subtitle'` downloads the
// server-rendered file at /api/transcription/:id/:provider/:id (kept in sync
// with edits). Add VTT/ASS later by registering it here AND in the server's
// lib/subtitleFormats.js — no other client changes needed.
export const EXPORT_FORMATS = [
  { id: 'json', label: 'JSON', description: 'Full transcript and metadata',                       kind: 'json' },
  { id: 'srt',  label: 'SRT',  description: 'SubRip subtitles',                                   kind: 'subtitle' },
  { id: 'ass',  label: 'ASS',  description: 'Advanced SubStation Alpha — with current editor style', kind: 'ass' },
]

// One-click looks shown above the style controls. Each preset sets only the
// "look" fields; position, timing offset and output settings are left alone.
// The preset whose fields all match the current style is shown as selected.
// `sample` is the tile text; with two words the second shows the highlight color.
export const STYLE_PRESETS = [
  {
    id: 'clean', label: 'Clean', sample: 'Clean',
    style: {
      fontFamily: 'Source Sans 3', fontSize: 52, fontWeight: 600, italic: false,
      primaryColor: '#FFFFFF', karaokeColor: '#FFFFFF', outlineColor: '#000000', outlineThickness: 2,
      backgroundBox: 'off', karaokeStyle: 'word-highlight', animationIn: 'fade', maxLines: 2, wordsPerLine: 0,
    },
  },
  {
    id: 'pop', label: 'Bold pop', sample: 'Bold pop',
    style: {
      fontFamily: 'Roboto', fontSize: 64, fontWeight: 700, italic: false,
      primaryColor: '#FFFFFF', karaokeColor: '#FFD43B', outlineColor: '#000000', outlineThickness: 4,
      backgroundBox: 'off', karaokeStyle: 'word-highlight', animationIn: 'none', maxLines: 2, wordsPerLine: 0,
    },
  },
  {
    id: 'boxed', label: 'Boxed', sample: 'Boxed',
    style: {
      fontFamily: 'Liberation Sans', fontSize: 46, fontWeight: 600, italic: false,
      primaryColor: '#FFFFFF', karaokeColor: '#FFD43B', outlineColor: '#000000', outlineThickness: 0,
      backgroundBox: 'solid', backgroundOpacity: 75, boxPadding: 18,
      karaokeStyle: 'word-highlight', animationIn: 'none', maxLines: 2, wordsPerLine: 0,
    },
  },
  {
    id: 'loud', label: 'Loud', sample: 'LOUD',
    style: {
      fontFamily: 'Anton', fontSize: 88, fontWeight: 400, italic: false,
      primaryColor: '#FFFFFF', karaokeColor: '#FFD43B', outlineColor: '#000000', outlineThickness: 5,
      backgroundBox: 'off', karaokeStyle: 'color-sweep', animationIn: 'none', maxLines: 1, wordsPerLine: 3,
    },
  },
]
