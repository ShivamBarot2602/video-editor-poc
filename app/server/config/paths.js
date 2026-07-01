/**
 * Single source of truth for what every artifact inside a video's namespace is
 * named. Nothing else in the codebase should hardcode a filename, prefix, or
 * subdirectory — import from here (or, better, use storage/videoStore.js which
 * builds S3 object keys on top of these).
 *
 * Layout of a session namespace (<S3_KEY_PREFIX><videoId>/):
 *   original.<ext>                uploaded source video
 *   meta.json                     { filename, size, uploadedAt }
 *   audio.wav                     extracted mono 16kHz WAV
 *   transcription_<provider>.json normalized transcription
 *   transcription_<provider>.<ext> export formats (srt, …) — see lib/subtitleFormats
 *   raw_<provider>.json           raw provider API response (debug)
 *   subtitles.ass                 generated ASS for the burn
 *   burned<ext>                   subtitle-burned video
 *   transcription.json            legacy (pre-provider) transcription fallback
 *   thumbnail_v2.jpg              cached list/grid thumbnail
 *   thumbnails.json               thumbnail-pipeline state
 *   frame_stats.json              cached frame candidates + CV scores
 *   frames/                       extracted candidate frames
 *   thumbnails/polished/          image-gen polished thumbnails
 *   clips/<clipId>.mp4            exported clips
 *   clips/thumbs/<clipId>-<n>.jpg clip suggestion thumbnail frames
 *   saved_clips.json              user clip library
 *   clips_<provider>.json         clip suggestions for a provider
 *   clip_debug_<provider>.log     LLM prompt/response debug log
 */

// Fixed (non-templated) filenames, relative to a video's namespace.
const FILES = {
  META: 'meta.json',
  AUDIO: 'audio.wav',
  ASS: 'subtitles.ass',
  THUMBNAIL_V2: 'thumbnail_v2.jpg',
  THUMBNAIL_STATE: 'thumbnails.json',
  FRAME_STATS: 'frame_stats.json',
  SAVED_CLIPS: 'saved_clips.json',
  LEGACY_TRANSCRIPTION: 'transcription.json',
}

// Filename prefixes for the "find a file by readdir + startsWith" patterns.
const PREFIXES = {
  ORIGINAL: 'original.',
  TRANSCRIPTION: 'transcription_',
  RAW: 'raw_',
  BURNED: 'burned',
  CLIPS: 'clips_',
  CLIP_DEBUG: 'clip_debug_',
}

// Subdirectory names, relative to a video's directory. Array form is joined.
const DIRS = {
  FRAMES: 'frames',
  POLISHED: ['thumbnails', 'polished'],
  CLIPS: 'clips',
  CLIP_THUMBS: ['clips', 'thumbs'],
}

// Per-provider / per-id filename builders.
const transcriptionName = (provider) => `${PREFIXES.TRANSCRIPTION}${provider}.json`
const rawName = (provider) => `${PREFIXES.RAW}${provider}.json`
const clipsName = (provider) => `${PREFIXES.CLIPS}${provider}.json`
const clipDebugName = (provider) => `${PREFIXES.CLIP_DEBUG}${provider}.log`
const burnedName = (ext) => `${PREFIXES.BURNED}${ext}`
const clipOutputName = (clipId) => `${clipId}.mp4`
const clipThumbName = (clipId, n) => `${clipId}-${n}.jpg`
const polishedName = (idx, providerId, ext) => `${idx}_${providerId}.${ext}`

module.exports = {
  FILES,
  PREFIXES,
  DIRS,
  transcriptionName,
  rawName,
  clipsName,
  clipDebugName,
  burnedName,
  clipOutputName,
  clipThumbName,
  polishedName,
}
