/**
 * S3 storage config — the single source of truth for where durable session data
 * lives. All artifacts are stored in S3 (no local disk); ffmpeg/provider work
 * happens in an ephemeral scratch dir (TMP_WORK_DIR) and is wiped per request.
 *
 * Reads process.env, so this module must load after dotenv.config().
 *
 * AWS_REGION            — bucket region (required)
 * S3_BUCKET             — bucket name (required)
 * AWS_ACCESS_KEY_ID /   — optional; omit BOTH to use an IAM role / instance
 *   AWS_SECRET_ACCESS_KEY   profile (the SDK default credential chain).
 * S3_KEY_PREFIX         — optional key prefix inside the bucket (e.g. "videos/")
 * S3_PRESIGN_EXPIRES_S  — presigned URL TTL in seconds (default 3600)
 * TMP_WORK_DIR          — local scratch dir (default <os.tmpdir()>/sp-video-work)
 */

const os = require('os')
const path = require('path')

const AWS_REGION = process.env.AWS_REGION || ''
const S3_BUCKET = process.env.S3_BUCKET || ''
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || ''
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || ''

// Normalize the prefix to either '' or 'something/' (no leading slash, single
// trailing slash) so key joins are dumb string concatenation.
function normalizePrefix(raw) {
  let p = String(raw || '').trim().replace(/^\/+/, '').replace(/\/+$/, '')
  return p ? p + '/' : ''
}
const S3_KEY_PREFIX = normalizePrefix(process.env.S3_KEY_PREFIX)

// TTL for the upload presigned-POST only (GET delivery uses public URLs now).
const PRESIGN_EXPIRES_S = parseInt(process.env.S3_PRESIGN_EXPIRES_S || '3600', 10)

// Public base URL for GET delivery. Objects are public-read; the browser hits S3
// (or a CDN) directly with Range support — no presigned GET. Override with a
// CloudFront domain later via S3_PUBLIC_BASE_URL.
const PUBLIC_BASE_URL = (process.env.S3_PUBLIC_BASE_URL
  || `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`).replace(/\/+$/, '')

const TMP_WORK_DIR = process.env.TMP_WORK_DIR
  ? path.resolve(process.env.TMP_WORK_DIR)
  : path.join(os.tmpdir(), 'sp-video-work')

// Explicit creds only when both are present; otherwise let the SDK resolve them
// from the default chain (env, shared config, IAM role). Passing `undefined`
// keeps the S3Client on its default credential provider.
const credentials = (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY)
  ? { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY }
  : undefined

// Fail loud at startup if the bucket/region are missing — mirrors the auth gate.
// `configured` lets index.js decide whether to refuse to boot.
const configured = Boolean(AWS_REGION && S3_BUCKET)

// Build a full object key from a videoId-relative path. Segments are joined with
// '/' (S3 keys use forward slashes, never path.sep).
function key(...segments) {
  return S3_KEY_PREFIX + segments.filter(Boolean).join('/')
}

// Public GET URL for a full object key (each path segment URL-encoded).
function publicUrl(objectKey) {
  const encoded = objectKey.split('/').map(encodeURIComponent).join('/')
  return `${PUBLIC_BASE_URL}/${encoded}`
}

module.exports = {
  AWS_REGION,
  S3_BUCKET,
  S3_KEY_PREFIX,
  PRESIGN_EXPIRES_S,
  PUBLIC_BASE_URL,
  TMP_WORK_DIR,
  credentials,
  configured,
  key,
  publicUrl,
}
