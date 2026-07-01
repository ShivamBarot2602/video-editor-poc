/**
 * videoStore — the single, centralized storage layer for session data, backed
 * by S3. Every artifact for a video lives under the key `<videoId>/<name>`
 * (plus the configured S3_KEY_PREFIX). Callers pass a videoId (+ provider /
 * clipId / etc) and never construct a key or touch the AWS SDK directly.
 *
 * Two families of API:
 *   1. Content I/O — small JSON/text/images read & written directly to S3.
 *      Fallback/throw semantics match the old on-disk layer:
 *        - readMeta / readSavedClips / readThumbnailState / readFrameStats
 *          swallow missing + parse errors and return the documented fallback.
 *        - readTranscription / readClipSuggestions / readBurnTranscription /
 *          readSavedClipsStrict THROW on a parse error (callers catch → 500).
 *        - exists / find helpers return false/null (never throw) when absent.
 *   2. Media materialization — binary blobs that ffmpeg / sharp / providers must
 *      see as real local files. `downloadX(id, destDir) → localPath` hydrates a
 *      temp file; `uploadX(id, localPath)` persists a temp result; `presignX(id)`
 *      returns a time-limited GET URL for the browser (media delivery).
 *
 * Everything that hits S3 is async. ffmpeg work happens in lib/tempWork temp dirs.
 */

const path = require('path')
const { v4: uuidv4 } = require('uuid')

const P = require('../config/paths')
const C = require('../config/storage')
const s3 = require('../lib/s3')
const { buildAll, buildFormat } = require('../lib/subtitleFormats')

const { FILES, PREFIXES, DIRS } = P

// ─── key helpers ──────────────────────────────────────────────────────────────

// Full object key for a video-relative path (segments joined with '/').
const vkey = (id, ...rel) => C.key(id, ...rel)

// Prefix that lists every object for a video.
const videoPrefix = (id) => C.key(id) + '/'

const CONTENT_TYPES = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.mpeg': 'video/mpeg',
  '.3gp': 'video/3gpp', '.flv': 'video/x-flv',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.json': 'application/json', '.ass': 'text/x-ssa; charset=utf-8',
}
const contentTypeFor = (name) => CONTENT_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream'

// Strip the bucket prefix + videoId, leaving the in-session relative path.
function relFromKey(id, key) {
  return key.slice(vkey(id).length + 1)
}

// ─── boot / id / session ───────────────────────────────────────────────────────

// No durable local dir to create (S3 is the store). Kept for index.js parity.
function init() {}

// Mint a new session id (replaces the old createVideoDir uuid+mkdir).
function newId() {
  return uuidv4()
}

// True if the session has any object under <id>/.
async function videoExists(id) {
  const keys = await s3.listKeys(videoPrefix(id))
  return keys.length > 0
}

// Distinct session ids — the first path segment of every key under the prefix.
async function listSessionIds() {
  const keys = await s3.listKeys(C.key(''))
  const ids = new Set()
  const base = C.key('')
  for (const k of keys) {
    const rest = k.slice(base.length)
    const seg = rest.split('/')[0]
    if (seg) ids.add(seg)
  }
  return [...ids]
}

// Raw object listing (key/size/lastModified) for a single session — ONE S3
// call, so callers can derive existence/providers/size/etc. without N more
// round trips. Keys come back relative to the session (prefix stripped).
async function listSessionObjects(id) {
  const objects = await s3.listObjects(videoPrefix(id))
  const base = videoPrefix(id)
  return objects.map(o => ({ ...o, rel: o.key.slice(base.length) }))
}

// Raw object listing across EVERY session in one S3 call, grouped by videoId.
// Same shape as listSessionObjects, keyed by id — avoids listing per-session
// when building something like the Recent Videos list.
async function listAllSessionObjects() {
  const objects = await s3.listObjects(C.key(''))
  const base = C.key('')
  const byId = new Map()
  for (const o of objects) {
    const rest = o.key.slice(base.length)
    const id = rest.split('/')[0]
    if (!id) continue
    const rel = rest.slice(id.length + 1)
    if (!byId.has(id)) byId.set(id, [])
    byId.get(id).push({ ...o, rel })
  }
  return byId
}

// ─── original / derived media ────────────────────────────────────────────────

// Basename (e.g. "original.mp4") of the uploaded source, or null.
async function findOriginalName(id) {
  const keys = await s3.listKeys(vkey(id, PREFIXES.ORIGINAL))
  if (!keys.length) return null
  return path.posix.basename(keys[0])
}

async function originalExists(id) {
  return (await findOriginalName(id)) !== null
}

// Key of the uploaded source, or null.
async function originalKey(id) {
  const name = await findOriginalName(id)
  return name ? vkey(id, name) : null
}

// HEAD the original → { size, mtime: Date } or null.
async function statOriginal(id) {
  const key = await originalKey(id)
  if (!key) return null
  const h = await s3.head(key)
  return h ? { size: h.size, mtime: h.lastModified } : null
}

// Download the source video into destDir; returns the local path (keeps ext).
async function downloadOriginal(id, destDir) {
  const name = await findOriginalName(id)
  if (!name) throw new Error('Original video not found')
  const local = path.join(destDir, name)
  await s3.downloadToFile(vkey(id, name), local)
  return local
}

// Public GET URL for the source (inline playback, Range-capable). Null if missing.
async function publicUrlOriginal(id) {
  const name = await findOriginalName(id)
  if (!name) return null
  return C.publicUrl(vkey(id, name))
}

// burned.<ext>
const burnedKey = (id, ext) => vkey(id, P.burnedName(ext))

async function findBurnedName(id) {
  const keys = await s3.listKeys(vkey(id, PREFIXES.BURNED + '.'))
  return keys.length ? path.posix.basename(keys[0]) : null
}

async function hasBurned(id) {
  return (await findBurnedName(id)) !== null
}

async function uploadBurned(id, ext, localPath) {
  const key = burnedKey(id, ext)
  // Burned video is a download link in the UI. Objects are public (no per-request
  // response-content-disposition override on unsigned GETs), so bake the
  // attachment disposition into the object metadata at upload time.
  await s3.uploadFile(key, localPath, contentTypeFor(key), `attachment; filename="${P.burnedName(ext)}"`)
}

async function publicUrlBurned(id) {
  const name = await findBurnedName(id)
  if (!name) return null
  return C.publicUrl(vkey(id, name))
}

// audio.wav
const audioKey = (id) => vkey(id, FILES.AUDIO)

async function audioExists(id) {
  return s3.exists(audioKey(id))
}

async function downloadAudio(id, destDir) {
  const local = path.join(destDir, FILES.AUDIO)
  await s3.downloadToFile(audioKey(id), local)
  return local
}

// Public GET URL for audio.wav — passed directly to STT providers that accept
// a URL instead of an uploaded file, so bytes never round-trip through us.
function publicUrlAudio(id) {
  return C.publicUrl(audioKey(id))
}

async function uploadAudio(id, localPath) {
  await s3.uploadFile(audioKey(id), localPath, contentTypeFor(FILES.AUDIO))
}

// subtitles.ass — written to S3 for the record; burn also keeps a temp copy.
async function writeAss(id, content) {
  await s3.putObject(vkey(id, FILES.ASS), content, contentTypeFor(FILES.ASS))
}

// thumbnail_v2.jpg
const thumbnailV2Key = (id) => vkey(id, FILES.THUMBNAIL_V2)

async function thumbnailV2Exists(id) {
  return s3.exists(thumbnailV2Key(id))
}

async function uploadThumbnailV2(id, localPath) {
  await s3.uploadFile(thumbnailV2Key(id), localPath, 'image/jpeg')
}

function publicUrlThumbnailV2(id) {
  return C.publicUrl(thumbnailV2Key(id))
}

// ─── meta ────────────────────────────────────────────────────────────────────

async function readMeta(id) {
  const txt = await s3.getText(vkey(id, FILES.META))
  if (txt == null) return {}
  try { return JSON.parse(txt) } catch (_) { return {} }
}

async function writeMeta(id, obj) {
  await s3.putObject(vkey(id, FILES.META), JSON.stringify(obj, null, 2), 'application/json')
}

// ─── transcription (provider-keyed) ──────────────────────────────────────────

const transcriptionKey = (id, provider) => vkey(id, P.transcriptionName(provider))

async function transcriptionExists(id, provider) {
  return s3.exists(transcriptionKey(id, provider))
}

// Parsed transcription, or null if missing. THROWS on a parse error.
async function readTranscription(id, provider) {
  const txt = await s3.getText(transcriptionKey(id, provider))
  return txt == null ? null : JSON.parse(txt)
}

async function writeTranscription(id, provider, tx) {
  await s3.putObject(transcriptionKey(id, provider), JSON.stringify(tx, null, 2), 'application/json')
}

async function writeRaw(id, provider, raw) {
  await s3.putObject(vkey(id, P.rawName(provider)), JSON.stringify(raw, null, 2), 'application/json')
}

// Provider ids that have a transcription_<provider>.json in S3.
async function listTranscriptionProviders(id) {
  const keys = await s3.listKeys(vkey(id, PREFIXES.TRANSCRIPTION))
  return keys
    .map(k => path.posix.basename(k))
    .filter(f => f.startsWith(PREFIXES.TRANSCRIPTION) && f.endsWith('.json'))
    .map(f => f.slice(PREFIXES.TRANSCRIPTION.length, -'.json'.length))
}

// Burn input: prefer transcription_<provider>.json, fall back to legacy
// transcription.json. null when neither exists. THROWS on a parse error.
async function readBurnTranscription(id, provider) {
  if (provider) {
    const txt = await s3.getText(transcriptionKey(id, provider))
    if (txt != null) return JSON.parse(txt)
  }
  const legacy = await s3.getText(vkey(id, FILES.LEGACY_TRANSCRIPTION))
  if (legacy != null) return JSON.parse(legacy)
  return null
}

// Transcript hint for the thumbnail pipeline: pick by provider priority, else
// any; return the first `maxChars` of full_transcript, or null. Never throws.
async function readTranscriptHint(id, priority, maxChars) {
  const providers = await listTranscriptionProviders(id)
  if (!providers.length) return null
  let chosen = null
  for (const pref of priority) {
    if (providers.includes(pref)) { chosen = pref; break }
  }
  if (!chosen) chosen = providers[0]
  try {
    const txt = await s3.getText(transcriptionKey(id, chosen))
    const tx = JSON.parse(txt)
    const text = (tx.full_transcript || '').toString().trim()
    return text.slice(0, maxChars) || null
  } catch (_) { return null }
}

// ─── subtitle exports ─────────────────────────────────────────────────────────

// Build + store every registered export format for a provider (after transcribe / edit).
async function writeSubtitleExports(id, provider, tx) {
  for (const fmt of buildAll(provider, tx)) {
    if (!fmt) continue
    await s3.putObject(vkey(id, fmt.fileName), fmt.content, fmt.contentType)
  }
}

// Return a downloadable export's { content, contentType, fileName }, building it
// from the saved transcription on the fly (no separate fetch; subtitle text is
// tiny). THROWS on a missing/corrupt transcription (caller → 500).
async function resolveSubtitleExport(id, provider, formatId) {
  const tx = await readTranscription(id, provider)
  if (!tx) throw new Error('Transcription not found')
  return buildFormat(provider, formatId, tx)
}

// ─── thumbnail pipeline state + frames ───────────────────────────────────────

async function readThumbnailState(id) {
  const txt = await s3.getText(vkey(id, FILES.THUMBNAIL_STATE))
  if (txt == null) return null
  try { return JSON.parse(txt) } catch (_) { return null }
}

async function writeThumbnailState(id, state) {
  await s3.putObject(vkey(id, FILES.THUMBNAIL_STATE), JSON.stringify(state, null, 2), 'application/json')
}

async function framesExist(id) {
  const keys = await s3.listKeys(vkey(id, DIRS.FRAMES) + '/')
  return keys.length > 0
}

async function frameStatsExist(id) {
  return s3.exists(vkey(id, FILES.FRAME_STATS))
}

// Cached frame candidates + scores, or null on missing / parse error.
async function readFrameStats(id) {
  const txt = await s3.getText(vkey(id, FILES.FRAME_STATS))
  if (txt == null) return null
  try { return JSON.parse(txt) } catch (_) { return null }
}

async function writeFrameStats(id, scored) {
  await s3.putObject(vkey(id, FILES.FRAME_STATS), JSON.stringify(scored, null, 2), 'application/json')
}

// Download every frame under <id>/frames/ into destDir; returns basenames.
async function downloadFrames(id, destDir) {
  const prefix = vkey(id, DIRS.FRAMES) + '/'
  const keys = await s3.listKeys(prefix)
  const names = []
  for (const k of keys) {
    const name = path.posix.basename(k)
    await s3.downloadToFile(k, path.join(destDir, name))
    names.push(name)
  }
  return names
}

// Upload every file in localFramesDir to <id>/frames/<name>.
async function uploadFrames(id, localFramesDir) {
  await uploadLocalDir(localFramesDir, (name) => vkey(id, DIRS.FRAMES, name))
}

// Store a polished image buffer at <id>/thumbnails/polished/<idx>_<provider>.<ext>.
// Returns the in-session relative path (used to build the file-serve URL).
async function writePolishedImage(id, idx, providerId, ext, buffer) {
  const name = P.polishedName(idx, providerId, ext)
  const rel = DIRS.POLISHED.concat(name)            // ['thumbnails','polished', name]
  await s3.putObject(vkey(id, ...rel), buffer, contentTypeFor(name))
  return rel.join('/')
}

// Traversal-guarded resolution of a thumbnail-subtree relative path. Throws an
// Error with `.status` (400/403). Returns the validated relative path.
function resolveThumbnailRelpath(id, rawRelpath) {
  const rel = decodeURIComponent(rawRelpath)
  const norm = path.posix.normalize(rel)
  if (norm.startsWith('..') || norm.startsWith('/') || norm.includes('/../')) {
    const err = new Error('Invalid path'); err.status = 400; throw err
  }
  const ok = norm.startsWith(DIRS.FRAMES + '/') || norm.startsWith(DIRS.POLISHED.join('/') + '/')
  if (!ok) {
    const err = new Error('Forbidden'); err.status = 403; throw err
  }
  return norm
}

async function thumbnailFileExists(id, rel) {
  return s3.exists(vkey(id, rel))
}

function publicUrlThumbnailFile(id, rel) {
  return C.publicUrl(vkey(id, rel))
}

// Raw bytes of a thumbnail-subtree file, or null if missing. Used to proxy a
// same-origin download (Content-Disposition: attachment) instead of redirecting
// to the public S3 URL, which would open inline rather than download.
async function readThumbnailFileBuffer(id, rel) {
  return s3.getBuffer(vkey(id, rel))
}

// ─── clips ───────────────────────────────────────────────────────────────────

const clipsSuggestionsKey = (id, provider) => vkey(id, P.clipsName(provider))

async function clipsSuggestionsExist(id, provider) {
  return s3.exists(clipsSuggestionsKey(id, provider))
}

// Parsed suggestions for a provider, or null if missing. THROWS on parse error.
async function readClipSuggestions(id, provider) {
  const txt = await s3.getText(clipsSuggestionsKey(id, provider))
  return txt == null ? null : JSON.parse(txt)
}

async function writeClipSuggestions(id, provider, obj) {
  await s3.putObject(clipsSuggestionsKey(id, provider), JSON.stringify(obj, null, 2), 'application/json')
}

async function listClipProviders(id) {
  const keys = await s3.listKeys(vkey(id, PREFIXES.CLIPS))
  return keys
    .map(k => path.posix.basename(k))
    .filter(f => f.startsWith(PREFIXES.CLIPS) && f.endsWith('.json'))
    .map(f => f.slice(PREFIXES.CLIPS.length, -'.json'.length))
}

const savedClipsKey = (id) => vkey(id, FILES.SAVED_CLIPS)

async function savedClipsExist(id) {
  return s3.exists(savedClipsKey(id))
}

// Saved-clip library; missing / parse error → { clips: [] }.
async function readSavedClips(id) {
  const txt = await s3.getText(savedClipsKey(id))
  if (txt == null) return { clips: [] }
  try { return JSON.parse(txt) } catch (_) { return { clips: [] } }
}

// Strict variant: THROWS on a parse error. Caller checks savedClipsExist first.
async function readSavedClipsStrict(id) {
  const txt = await s3.getText(savedClipsKey(id))
  return JSON.parse(txt)
}

async function writeSavedClips(id, data) {
  await s3.putObject(savedClipsKey(id), JSON.stringify(data, null, 2), 'application/json')
}

// clips/<clipId>.mp4
const clipOutputKey = (id, clipId) => vkey(id, DIRS.CLIPS, P.clipOutputName(clipId))

async function clipOutputExists(id, clipId) {
  return s3.exists(clipOutputKey(id, clipId))
}

async function uploadClipOutput(id, clipId, localPath) {
  await s3.uploadFile(clipOutputKey(id, clipId), localPath, 'video/mp4')
}

async function publicUrlClipOutput(id, clipId) {
  if (!(await clipOutputExists(id, clipId))) return null
  return C.publicUrl(clipOutputKey(id, clipId))
}

async function deleteClipOutput(id, clipId) {
  try { await s3.deleteObject(clipOutputKey(id, clipId)) } catch (_) {}
}

// clips/thumbs/<clipId>-<n>.jpg
const clipThumbKey = (id, clipId, n) => vkey(id, ...DIRS.CLIP_THUMBS, P.clipThumbName(clipId, n))

async function clipThumbExists(id, clipId, n) {
  return s3.exists(clipThumbKey(id, clipId, n))
}

async function uploadClipThumb(id, clipId, n, localPath) {
  await s3.uploadFile(clipThumbKey(id, clipId, n), localPath, 'image/jpeg')
}

async function publicUrlClipThumb(id, clipId, n) {
  if (!(await clipThumbExists(id, clipId, n))) return null
  return C.publicUrl(clipThumbKey(id, clipId, n))
}

// clip_debug_<provider>.log — best-effort persistence of the LLM debug log.
async function writeClipDebug(id, provider, content) {
  try { await s3.putObject(vkey(id, P.clipDebugName(provider)), content, 'text/plain; charset=utf-8') } catch (_) {}
}

// Delete a previous suggestion run's exported clips + thumbnail frames for this
// provider so a re-suggest can't serve a stale cut. Saved files never match the
// "<provider>-clip-" prefix, so they're untouched.
async function cleanStaleSuggestionFiles(id, provider) {
  try {
    const clipKeys = await s3.listKeys(vkey(id, DIRS.CLIPS) + '/')
    const thumbKeys = await s3.listKeys(vkey(id, ...DIRS.CLIP_THUMBS) + '/')
    const stale = [...clipKeys, ...thumbKeys].filter(k => {
      const base = path.posix.basename(k)
      return base.startsWith(`${provider}-clip-`)
    })
    for (const k of stale) { try { await s3.deleteObject(k) } catch (_) {} }
  } catch (_) {}
}

// ─── internal: bulk local→S3 ───────────────────────────────────────────────────

const fs = require('fs')
async function uploadLocalDir(localDir, keyFor) {
  let entries = []
  try { entries = fs.readdirSync(localDir) } catch (_) { return }
  for (const name of entries) {
    const full = path.join(localDir, name)
    if (!fs.statSync(full).isFile()) continue
    await s3.uploadFile(keyFor(name), full, contentTypeFor(name))
  }
}

module.exports = {
  // boot / session
  init, newId, videoExists, listSessionIds, listSessionObjects, listAllSessionObjects,
  // original / media
  findOriginalName, originalExists, originalKey, statOriginal,
  downloadOriginal, publicUrlOriginal,
  burnedKey, findBurnedName, hasBurned, uploadBurned, publicUrlBurned,
  audioKey, audioExists, downloadAudio, uploadAudio, publicUrlAudio,
  writeAss, thumbnailV2Exists, uploadThumbnailV2, publicUrlThumbnailV2,
  // meta
  readMeta, writeMeta,
  // transcription
  transcriptionKey, transcriptionExists, readTranscription, writeTranscription,
  writeRaw, listTranscriptionProviders, readBurnTranscription, readTranscriptHint,
  // subtitle exports
  resolveSubtitleExport, writeSubtitleExports,
  // thumbnails
  readThumbnailState, writeThumbnailState,
  framesExist, frameStatsExist, readFrameStats, writeFrameStats,
  downloadFrames, uploadFrames, writePolishedImage,
  resolveThumbnailRelpath, thumbnailFileExists, publicUrlThumbnailFile, readThumbnailFileBuffer,
  // clips
  clipsSuggestionsExist, readClipSuggestions, writeClipSuggestions, listClipProviders,
  savedClipsExist, readSavedClips, readSavedClipsStrict, writeSavedClips,
  clipOutputExists, uploadClipOutput, publicUrlClipOutput, deleteClipOutput,
  clipThumbExists, uploadClipThumb, publicUrlClipThumb,
  writeClipDebug, cleanStaleSuggestionFiles,
}
