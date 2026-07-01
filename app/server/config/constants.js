/**
 * Magic numbers and policy values pulled out of the route handlers, grouped by
 * domain. Values are byte-for-byte what the routes used inline — moving them
 * here changes nothing at runtime, it just gives them one home.
 */

// ─── Upload (routes/upload) ──────────────────────────────────────────────────
// Reads process.env, so this module must load after dotenv (it does — routes are
// required by index.js after dotenv.config()).
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10)
// Video only — burn/thumbnail/clips all require an actual video stream, so
// audio-only uploads (stored as original.<video-ext> via normalizeVideoExtension)
// can't use this app's core features anyway.
const ALLOWED_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
  'video/webm', 'video/mpeg', 'video/3gpp', 'video/x-flv',
]
// Doubles as the single-vs-multipart threshold: a file that fits in one part
// just gets a plain presigned PUT, no multipart machinery. S3 allows parts
// from 5MiB-5GiB (no minimum on the last part) — 10MB keeps part counts
// reasonable (500MB max upload ÷ 10MB = 50 parts, well under S3's 10,000 cap).
const UPLOAD_PART_SIZE_BYTES = 10 * 1024 * 1024

// ─── Thumbnail pipeline (routes/thumbnails) ──────────────────────────────────
const MAX_EXTRACT = 60            // max candidate frames to extract
const POST_DEDUP_KEEP = 12        // top-K kept after dedup, sent to VLM rerank
const TOP_PICK_COUNT = 3          // final picks surfaced + polished
const TRANSCRIPT_PROVIDER_PRIORITY = ['assemblyai', 'deepgram', 'openai']
const TRANSCRIPT_HINT_MAX_CHARS = 220  // transcript hint length cap for rerank/polish

// ─── Clips (routes/clips) ────────────────────────────────────────────────────
// Allow only simple tokens in path-segment params (provider, clipId) to block
// traversal. No `g` flag, so this RegExp is safe to share across call sites.
const SAFE_TOKEN = /^[A-Za-z0-9_-]+$/
// Provider id for the video-understanding method (Gemini watches the raw video).
const VIDEO_PROVIDER = 'geminivideo'
// Default-res Gemini handles ~1h of video; low-res reaches ~3h.
const DEFAULT_RES_MAX_S = 3600
// Requested clip count is clamped into [MIN, MAX].
const CLIP_COUNT_MIN = 3
const CLIP_COUNT_MAX = 5

module.exports = {
  MAX_FILE_SIZE_MB,
  ALLOWED_MIME_TYPES,
  UPLOAD_PART_SIZE_BYTES,
  MAX_EXTRACT,
  POST_DEDUP_KEEP,
  TOP_PICK_COUNT,
  TRANSCRIPT_PROVIDER_PRIORITY,
  TRANSCRIPT_HINT_MAX_CHARS,
  SAFE_TOKEN,
  VIDEO_PROVIDER,
  DEFAULT_RES_MAX_S,
  CLIP_COUNT_MIN,
  CLIP_COUNT_MAX,
}
