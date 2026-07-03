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
  shadow: 0,                // px drop shadow (0 = none)
  letterSpacing: 0,         // px extra tracking (ASS Spacing)
  textTransform: 'none',    // 'none' | 'uppercase'
  karaokeStyle: 'word-highlight', // 'word-highlight' | 'fill-left-to-right' | 'color-sweep' | 'pop-on'
  activeWordScale: 100,     // 100 = off; >100 pops the spoken word (≤110 recommended)
  animationIn: 'none',      // 'none' | 'fade'
  animationOut: 'none',     // 'none' | 'fade'
  wordTimingOffset: 0,
  maxLines: 2,
  wordsPerLine: 0,          // 0 = auto (fit by width); >0 = force N words per line
  speakerColorsEnabled: false,
  speakerColors: {},        // { [speakerId]: '#hex' } — per-speaker fill colour
  outputFormat: 'mp4',      // 'mp4' | 'webm'
  quality: 23,              // CRF value (lower = better)
}

// One-click style templates (Submagic/Choppity-inspired). Each is a PARTIAL
// style merged over the current style (so unrelated tweaks like position/margin
// are preserved). Keep every field a valid DEFAULT_STYLE key. Order = display
// order. Only shipped fonts (FONT_FAMILIES) are used.
export const PRESETS = [
  {
    id: 'clean', label: 'Clean',
    style: {
      fontFamily: 'Liberation Sans', fontWeight: 600, textTransform: 'none',
      primaryColor: '#FFFFFF', karaokeColor: '#FFD700', outlineColor: '#000000',
      outlineThickness: 2, backgroundBox: 'off', shadow: 0,
      karaokeStyle: 'word-highlight', activeWordScale: 100, animationIn: 'none',
    },
  },
  {
    id: 'hormozi', label: 'Hormozi',
    style: {
      fontFamily: 'Anton', fontWeight: 700, textTransform: 'uppercase',
      primaryColor: '#FFFFFF', karaokeColor: '#FFEE33', outlineColor: '#000000',
      outlineThickness: 4, backgroundBox: 'off', shadow: 2,
      karaokeStyle: 'pop-on', activeWordScale: 112, animationIn: 'none',
      maxLines: 1, wordsPerLine: 3,
    },
  },
  {
    id: 'beast', label: 'Beast',
    style: {
      fontFamily: 'Anton', fontWeight: 700, textTransform: 'uppercase',
      primaryColor: '#FFFFFF', karaokeColor: '#39FF14', outlineColor: '#000000',
      outlineThickness: 4, backgroundBox: 'off', shadow: 2,
      karaokeStyle: 'word-highlight', activeWordScale: 112, animationIn: 'none',
      maxLines: 1, wordsPerLine: 4,
    },
  },
  {
    id: 'karaoke', label: 'Karaoke',
    style: {
      fontFamily: 'Roboto', fontWeight: 700, textTransform: 'none',
      primaryColor: '#FFFFFF', karaokeColor: '#22D3EE', outlineColor: '#000000',
      outlineThickness: 2, backgroundBox: 'off', shadow: 1,
      karaokeStyle: 'fill-left-to-right', activeWordScale: 100, animationIn: 'fade',
    },
  },
  {
    id: 'neon', label: 'Neon Sweep',
    style: {
      fontFamily: 'Roboto', fontWeight: 700, textTransform: 'none',
      primaryColor: '#FFFFFF', karaokeColor: '#FF3CAC', outlineColor: '#1A0033',
      outlineThickness: 3, backgroundBox: 'off', shadow: 3,
      karaokeStyle: 'color-sweep', activeWordScale: 100, animationIn: 'fade',
    },
  },
  {
    id: 'boxed', label: 'Boxed',
    style: {
      fontFamily: 'Source Sans 3', fontWeight: 600, textTransform: 'none',
      primaryColor: '#FFFFFF', karaokeColor: '#FFD700',
      backgroundBox: 'solid', backgroundOpacity: 80, boxPadding: 24, shadow: 0,
      karaokeStyle: 'word-highlight', activeWordScale: 100, animationIn: 'fade',
    },
  },
  {
    id: 'popbox', label: 'Pop Box',
    style: {
      fontFamily: 'Source Sans 3', fontWeight: 700, textTransform: 'uppercase',
      primaryColor: '#FFFFFF', karaokeColor: '#FFD700',
      backgroundBox: 'solid', backgroundOpacity: 85, boxPadding: 20, shadow: 0,
      karaokeStyle: 'pop-on', activeWordScale: 110, animationIn: 'none',
      maxLines: 1, wordsPerLine: 4,
    },
  },
  {
    id: 'bold-yellow', label: 'Bold Yellow',
    style: {
      fontFamily: 'Anton', fontWeight: 700, textTransform: 'uppercase',
      primaryColor: '#FFEE33', karaokeColor: '#FFFFFF', outlineColor: '#000000',
      outlineThickness: 4, backgroundBox: 'off', shadow: 2,
      karaokeStyle: 'word-highlight', activeWordScale: 100, animationIn: 'none',
    },
  },
  {
    id: 'tiktok', label: 'TikTok',
    style: {
      fontFamily: 'Liberation Sans', fontWeight: 700, textTransform: 'uppercase',
      primaryColor: '#FFFFFF', karaokeColor: '#FE2C55', outlineColor: '#000000',
      outlineThickness: 3, backgroundBox: 'off', shadow: 1,
      karaokeStyle: 'pop-on', activeWordScale: 108, animationIn: 'none',
      maxLines: 1, wordsPerLine: 4,
    },
  },
  {
    id: 'minimal', label: 'Minimal',
    style: {
      fontFamily: 'Source Sans 3', fontWeight: 400, textTransform: 'none',
      primaryColor: '#FFFFFF', karaokeColor: '#FFFFFF', outlineColor: '#000000',
      outlineThickness: 1, backgroundBox: 'off', shadow: 0,
      karaokeStyle: 'word-highlight', activeWordScale: 100, animationIn: 'fade',
    },
  },
]

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
