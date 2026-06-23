/**
 * videoStore — the single, centralized file-I/O layer for session data.
 *
 * Every read/write of an artifact under VIDEOS_DIR goes through here. Callers
 * pass a videoId (+ provider/clipId/etc) and never construct a path or touch
 * `fs` directly. Filenames/dirs come from config/paths.js.
 *
 * Semantics are byte-for-byte what the routes did inline:
 *   - JSON writes use JSON.stringify(obj, null, 2) + 'utf8'.
 *   - "read with fallback" helpers (readMeta/readSavedClips/readThumbnailState/
 *     readFrameStats) swallow parse errors and return the documented fallback.
 *   - "read" helpers that the routes wrapped in try/catch (readTranscription/
 *     readClipSuggestions/readBurnTranscription) THROW on a parse error so the
 *     caller's existing catch still produces the same status code.
 *   - find/exists helpers return null/false (never throw) when a dir is missing.
 *
 * Path-getters are PURE (no mkdir). Writers that need a directory call the
 * matching ensure* helper first — so a GET that only builds a path can never
 * create a directory as a side effect.
 */

const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const P = require('../config/paths')
const { pathFor, writeFormat, writeAll } = require('../lib/subtitleFormats')

const { VIDEOS_DIR, FILES, PREFIXES, DIRS } = P

// ─── internal helpers ────────────────────────────────────────────────────────

function joinDirs(base, segs) {
  return Array.isArray(segs) ? path.join(base, ...segs) : path.join(base, segs)
}

// Parse JSON at an absolute path. Missing file → returns `missing`. On a parse
// error: throw when `safe` is false (caller has a try/catch), else return `bad`.
function readJsonAt(absPath, { missing = null, bad = null, safe = false } = {}) {
  if (!fs.existsSync(absPath)) return missing
  if (safe) {
    try { return JSON.parse(fs.readFileSync(absPath, 'utf8')) } catch (_) { return bad }
  }
  return JSON.parse(fs.readFileSync(absPath, 'utf8'))
}

function writeJsonAt(absPath, obj) {
  fs.writeFileSync(absPath, JSON.stringify(obj, null, 2), 'utf8')
}

// ─── boot / directory ────────────────────────────────────────────────────────

function init() {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true })
}

function videoDir(id) {
  return path.join(VIDEOS_DIR, id)
}

function videoExists(id) {
  return fs.existsSync(videoDir(id))
}

// Directory entries under VIDEOS_DIR (session ids). Mirrors the /api/videos
// loop: statSync.isDirectory() with no swallow, so a stat error propagates.
function listSessionIds() {
  if (!fs.existsSync(VIDEOS_DIR)) return []
  return fs.readdirSync(VIDEOS_DIR).filter(id => fs.statSync(path.join(VIDEOS_DIR, id)).isDirectory())
}

// uuid + mkdir; returns { id, dir }. (Available for upload; multer keeps its own.)
function createVideoDir() {
  const id = uuidv4()
  const dir = videoDir(id)
  fs.mkdirSync(dir, { recursive: true })
  return { id, dir }
}

// ─── original / derived media ────────────────────────────────────────────────

function findOriginalName(id) {
  const dir = videoDir(id)
  if (!fs.existsSync(dir)) return null
  return fs.readdirSync(dir).find(f => f.startsWith(PREFIXES.ORIGINAL)) || null
}

function findOriginalPath(id) {
  const name = findOriginalName(id)
  return name ? path.join(videoDir(id), name) : null
}

function statOriginal(id) {
  const p = findOriginalPath(id)
  return p ? fs.statSync(p) : null
}

function burnedPath(id, ext) {
  return path.join(videoDir(id), P.burnedName(ext))
}

function findBurnedPath(id) {
  const dir = videoDir(id)
  if (!fs.existsSync(dir)) return null
  const f = fs.readdirSync(dir).find(x => x.startsWith(PREFIXES.BURNED + '.'))
  return f ? path.join(dir, f) : null
}

function hasBurned(id) {
  const dir = videoDir(id)
  if (!fs.existsSync(dir)) return false
  return fs.readdirSync(dir).some(f => f.startsWith(PREFIXES.BURNED + '.'))
}

function audioPath(id) {
  return path.join(videoDir(id), FILES.AUDIO)
}

function audioExists(id) {
  return fs.existsSync(audioPath(id))
}

function assPath(id) {
  return path.join(videoDir(id), FILES.ASS)
}

function writeAss(id, content) {
  fs.writeFileSync(assPath(id), content, 'utf8')
}

function thumbnailV2Path(id) {
  return path.join(videoDir(id), FILES.THUMBNAIL_V2)
}

function thumbnailV2Exists(id) {
  return fs.existsSync(thumbnailV2Path(id))
}

// ─── meta ────────────────────────────────────────────────────────────────────

function readMeta(id) {
  return readJsonAt(path.join(videoDir(id), FILES.META), { missing: {}, bad: {}, safe: true })
}

function writeMeta(id, obj) {
  writeJsonAt(path.join(videoDir(id), FILES.META), obj)
}

// ─── transcription (provider-keyed) ──────────────────────────────────────────

function transcriptionPath(id, provider) {
  return path.join(videoDir(id), P.transcriptionName(provider))
}

function transcriptionExists(id, provider) {
  return fs.existsSync(transcriptionPath(id, provider))
}

// Parsed transcription, or null if the file is missing. THROWS on a parse error
// (callers wrap in try/catch and surface 500, exactly as before).
function readTranscription(id, provider) {
  return readJsonAt(transcriptionPath(id, provider), { missing: null })
}

function writeTranscription(id, provider, tx) {
  writeJsonAt(transcriptionPath(id, provider), tx)
}

function writeRaw(id, provider, raw) {
  writeJsonAt(path.join(videoDir(id), P.rawName(provider)), raw)
}

// Provider ids that have a transcription_<provider>.json on disk.
function listTranscriptionProviders(id) {
  const dir = videoDir(id)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(PREFIXES.TRANSCRIPTION) && f.endsWith('.json'))
    .map(f => f.slice(PREFIXES.TRANSCRIPTION.length, -'.json'.length))
}

function legacyTranscriptionPath(id) {
  return path.join(videoDir(id), FILES.LEGACY_TRANSCRIPTION)
}

// Burn input resolution: prefer transcription_<provider>.json, fall back to the
// legacy transcription.json. Returns the parsed transcription, or null when
// neither exists (caller → 400). THROWS on a parse error (matches today).
function readBurnTranscription(id, provider) {
  const dir = videoDir(id)
  const providerFile = provider ? path.join(dir, P.transcriptionName(provider)) : null
  const legacy = path.join(dir, FILES.LEGACY_TRANSCRIPTION)
  const file = (providerFile && fs.existsSync(providerFile))
    ? providerFile
    : fs.existsSync(legacy) ? legacy : null
  if (!file) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// Transcript hint for the thumbnail pipeline: pick by provider priority, else
// any; return the first `maxChars` of full_transcript, or null. Never throws.
function readTranscriptHint(id, priority, maxChars) {
  const dir = videoDir(id)
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(PREFIXES.TRANSCRIPTION) && f.endsWith('.json'))
    .map(f => ({ provider: f.slice(PREFIXES.TRANSCRIPTION.length, -'.json'.length), file: f }))
  if (files.length === 0) return null

  let chosen = null
  for (const pref of priority) {
    chosen = files.find(f => f.provider === pref)
    if (chosen) break
  }
  if (!chosen) chosen = files[0]

  try {
    const tx = JSON.parse(fs.readFileSync(path.join(dir, chosen.file), 'utf8'))
    const text = (tx.full_transcript || '').toString().trim()
    return text.slice(0, maxChars) || null
  } catch (_) { return null }
}

// ─── subtitle exports (delegate to lib/subtitleFormats) ──────────────────────

// Existing export file, building it lazily from the saved transcription JSON if
// absent (older sessions). Returns the absolute file path.
function resolveSubtitleExport(id, provider, formatId) {
  const dir = videoDir(id)
  let filePath = pathFor(dir, provider, formatId)
  if (!fs.existsSync(filePath)) {
    const tx = JSON.parse(fs.readFileSync(transcriptionPath(id, provider), 'utf8'))
    filePath = writeFormat(dir, provider, formatId, tx)
  }
  return filePath
}

// Regenerate every registered export format for a provider (after transcribe / edit).
function writeSubtitleExports(id, provider, tx) {
  writeAll(videoDir(id), provider, tx)
}

// ─── thumbnail pipeline state + frames ───────────────────────────────────────

function readThumbnailState(id) {
  return readJsonAt(path.join(videoDir(id), FILES.THUMBNAIL_STATE), { missing: null, bad: null, safe: true })
}

function writeThumbnailState(id, state) {
  writeJsonAt(path.join(videoDir(id), FILES.THUMBNAIL_STATE), state)
}

function framesDirPath(id) {
  return joinDirs(videoDir(id), DIRS.FRAMES)
}

function framesExist(id) {
  return fs.existsSync(framesDirPath(id))
}

function frameStatsPath(id) {
  return path.join(videoDir(id), FILES.FRAME_STATS)
}

function frameStatsExist(id) {
  return fs.existsSync(frameStatsPath(id))
}

// Cached frame candidates + scores, or null on missing / parse error.
function readFrameStats(id) {
  return readJsonAt(frameStatsPath(id), { missing: null, bad: null, safe: true })
}

function writeFrameStats(id, scored) {
  writeJsonAt(frameStatsPath(id), scored)
}

function polishedDirPath(id) {
  return joinDirs(videoDir(id), DIRS.POLISHED)
}

function ensurePolishedDir(id) {
  const p = polishedDirPath(id)
  fs.mkdirSync(p, { recursive: true })
  return p
}

// Absolute path under the video dir for a thumbnail-pipeline file, guarded
// against traversal and restricted to the frames/ and thumbnails/ subtrees.
// Throws an Error with `.status` (400 / 403) on a bad path; caller handles 404.
function resolveThumbnailFile(id, rawRelpath) {
  const dir = videoDir(id)
  const rel = decodeURIComponent(rawRelpath)
  const target = path.normalize(path.join(dir, rel))
  if (!target.startsWith(dir + path.sep) && target !== dir) {
    const err = new Error('Invalid path'); err.status = 400; throw err
  }
  const ok = rel.startsWith(DIRS.FRAMES + '/') || rel.startsWith(DIRS.POLISHED[0] + '/')
  if (!ok) {
    const err = new Error('Forbidden'); err.status = 403; throw err
  }
  return target
}

// URL fragment for a polished/original file served via the thumbnails router.
function thumbnailFileUrl(id, absPath) {
  const rel = path.relative(videoDir(id), absPath).split(path.sep).join('/')
  return `/api/thumbnails/${id}/file/${encodeURIComponent(rel)}`
}

// ─── clips ───────────────────────────────────────────────────────────────────

function clipsSuggestionsPath(id, provider) {
  return path.join(videoDir(id), P.clipsName(provider))
}

function clipsSuggestionsExist(id, provider) {
  return fs.existsSync(clipsSuggestionsPath(id, provider))
}

// Parsed suggestions for a provider, or null if missing. THROWS on parse error.
function readClipSuggestions(id, provider) {
  return readJsonAt(clipsSuggestionsPath(id, provider), { missing: null })
}

function writeClipSuggestions(id, provider, obj) {
  writeJsonAt(clipsSuggestionsPath(id, provider), obj)
}

function listClipProviders(id) {
  const dir = videoDir(id)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(PREFIXES.CLIPS) && f.endsWith('.json'))
    .map(f => f.slice(PREFIXES.CLIPS.length, -'.json'.length))
}

function savedClipsPath(id) {
  return path.join(videoDir(id), FILES.SAVED_CLIPS)
}

// Saved-clip library; missing / parse error → { clips: [] }.
function readSavedClips(id) {
  return readJsonAt(savedClipsPath(id), { missing: { clips: [] }, bad: { clips: [] }, safe: true })
}

function writeSavedClips(id, data) {
  writeJsonAt(savedClipsPath(id), data)
}

function clipsDirPath(id) {
  return joinDirs(videoDir(id), DIRS.CLIPS)
}

function ensureClipsDir(id) {
  const p = clipsDirPath(id)
  fs.mkdirSync(p, { recursive: true })
  return p
}

function clipOutputPath(id, clipId) {
  return path.join(clipsDirPath(id), P.clipOutputName(clipId))
}

function clipOutputExists(id, clipId) {
  return fs.existsSync(clipOutputPath(id, clipId))
}

function deleteClipOutput(id, clipId) {
  const p = clipOutputPath(id, clipId)
  if (fs.existsSync(p)) { try { fs.unlinkSync(p) } catch (_) {} }
}

function clipThumbsDirPath(id) {
  return joinDirs(videoDir(id), DIRS.CLIP_THUMBS)
}

function ensureClipThumbsDir(id) {
  const p = clipThumbsDirPath(id)
  fs.mkdirSync(p, { recursive: true })
  return p
}

function clipThumbPath(id, clipId, n) {
  return path.join(clipThumbsDirPath(id), P.clipThumbName(clipId, n))
}

function clipThumbExists(id, clipId, n) {
  return fs.existsSync(clipThumbPath(id, clipId, n))
}

function clipDebugPath(id, provider) {
  return path.join(videoDir(id), P.clipDebugName(provider))
}

// Delete a previous suggestion run's exported clips + thumbnail frames for this
// provider so a re-suggest can't serve a stale cut. Saved files are never matched.
function cleanStaleSuggestionFiles(id, provider) {
  try {
    const cdir = clipsDirPath(id)
    if (fs.existsSync(cdir)) {
      for (const f of fs.readdirSync(cdir)) {
        if (f.startsWith(`${provider}-clip-`) && f.endsWith('.mp4')) {
          fs.unlinkSync(path.join(cdir, f))
        }
      }
    }
    const tdir = clipThumbsDirPath(id)
    if (fs.existsSync(tdir)) {
      for (const f of fs.readdirSync(tdir)) {
        if (f.startsWith(`${provider}-clip-`)) fs.unlinkSync(path.join(tdir, f))
      }
    }
  } catch (_) {}
}

module.exports = {
  // boot / dir
  init, videoDir, videoExists, listSessionIds, createVideoDir,
  // original / media
  findOriginalName, findOriginalPath, statOriginal,
  burnedPath, findBurnedPath, hasBurned,
  audioPath, audioExists, assPath, writeAss, thumbnailV2Path, thumbnailV2Exists,
  // meta
  readMeta, writeMeta,
  // transcription
  transcriptionPath, transcriptionExists, readTranscription, writeTranscription,
  writeRaw, listTranscriptionProviders, legacyTranscriptionPath,
  readBurnTranscription, readTranscriptHint,
  // subtitle exports
  resolveSubtitleExport, writeSubtitleExports,
  // thumbnails
  readThumbnailState, writeThumbnailState,
  framesDirPath, framesExist, frameStatsPath, frameStatsExist,
  readFrameStats, writeFrameStats,
  polishedDirPath, ensurePolishedDir, resolveThumbnailFile, thumbnailFileUrl,
  // clips
  clipsSuggestionsPath, clipsSuggestionsExist, readClipSuggestions, writeClipSuggestions,
  listClipProviders, savedClipsPath, readSavedClips, writeSavedClips,
  clipsDirPath, ensureClipsDir, clipOutputPath, clipOutputExists, deleteClipOutput,
  clipThumbsDirPath, ensureClipThumbsDir, clipThumbPath, clipThumbExists,
  clipDebugPath, cleanStaleSuggestionFiles,
}
