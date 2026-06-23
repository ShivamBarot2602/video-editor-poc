// Canonical subtitle-style schema + transcription export formats.
// (Previously defined in and exported from pages/EditorPage.jsx.)

export const DEFAULT_STYLE = {
  fontFamily: 'Arial',
  fontSize: 48,
  fontWeight: 600,          // 400 Regular | 600 SemiBold | 700 Bold
  primaryColor: '#FFFFFF',
  karaokeColor: '#FFD700',
  outlineColor: '#000000',
  outlineThickness: 2,
  italic: false,
  position: 'bottom-center',
  verticalMargin: 30,
  backgroundBox: 'off',     // 'off' | 'solid' | 'blur'
  backgroundOpacity: 70,
  karaokeStyle: 'word-highlight',
  animationIn: 'none',      // 'none' | 'fade'
  wordTimingOffset: 0,
  maxLines: 2,
  outputFormat: 'mp4',      // 'mp4' | 'webm'
  quality: 23,              // CRF value
}

// Transcription export formats shown in the Export menu.
// `kind: 'json'` is rendered client-side; `kind: 'subtitle'` downloads the
// server-rendered file at /api/transcription/:id/:provider/:id (kept in sync
// with edits). Add VTT/ASS later by registering it here AND in the server's
// lib/subtitleFormats.js — no other client changes needed.
export const EXPORT_FORMATS = [
  { id: 'json', label: 'JSON', description: 'Full transcript and metadata', kind: 'json' },
  { id: 'srt',  label: 'SRT',  description: 'SubRip subtitles',           kind: 'subtitle' },
]
