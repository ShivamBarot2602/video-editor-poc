/**
 * SmartCrop config (spec 00 §8) — reads + checks env once at require time.
 *
 * SmartCrop is opt-in: with SMARTCROP_ENABLED !== 'true' the router is never
 * mounted and nothing here is enforced, so the rest of the app boots exactly as
 * before. With it on, index.js refuses to start while `errors` is non-empty.
 *
 * Reads process.env, so this module must load after dotenv.config().
 */

const env = process.env

const enabled = env.SMARTCROP_ENABLED === 'true'
const errors = []

function required(name) {
  const v = (env[name] || '').trim()
  if (!v) errors.push(`${name} is required`)
  return v
}

// Positive integer with a default; a set-but-invalid value is a boot error
// rather than a silent fallback.
function int(name, fallback, { min = 1 } = {}) {
  const raw = env[name]
  if (raw == null || String(raw).trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min) {
    errors.push(`${name} must be an integer >= ${min} (got "${raw}")`)
    return fallback
  }
  return n
}

const KNOWN_FEATURES = ['skip_render', 'edit', 'editor_media']

function parseFeatures(raw) {
  const set = new Set()
  for (const f of String(raw || '').split(',').map(s => s.trim()).filter(Boolean)) {
    if (!KNOWN_FEATURES.includes(f)) errors.push(`PIPELINE_FEATURES: unknown feature "${f}" (known: ${KNOWN_FEATURES.join(', ')})`)
    else set.add(f)
  }
  return set
}

const config = {
  enabled,
  region: required('AWS_REGION'),
  buckets: {
    in: required('SMARTCROP_IN_BUCKET'),
    jobs: required('SMARTCROP_JOBS_BUCKET'),
    out: required('SMARTCROP_OUT_BUCKET'),
  },
  tables: {
    projects: (env.PROJECTS_TABLE || '').trim() || 'smartcrop-api-projects',
    renders: (env.RENDERS_TABLE || '').trim() || 'smartcrop-api-renders',
    pipelineJobs: required('PIPELINE_JOBS_TABLE'),
  },
  stateMachineArn: required('STATE_MACHINE_ARN'),
  planLambdaFunction: required('PLAN_LAMBDA_FUNCTION'),
  features: parseFeatures(env.PIPELINE_FEATURES),
  planVersion: int('PIPELINE_PLAN_VERSION', 1),
  corsOrigins: String(env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean),
  signedUrlTtlSec: int('SIGNED_URL_TTL_SEC', 3600),
  uploadPartSizeBytes: int('UPLOAD_PART_SIZE_BYTES', 16777216, { min: 5 * 1024 * 1024 }),
  uploadMaxBytes: int('UPLOAD_MAX_BYTES', 4294967296),
  uploadExpiryHours: int('UPLOAD_EXPIRY_HOURS', 24),
  videoMinDurationMs: int('VIDEO_MIN_DURATION_MS', 3000),
  videoMaxDurationMs: int('VIDEO_MAX_DURATION_MS', 1800000),
  videoMinShortSidePx: int('VIDEO_MIN_SHORT_SIDE_PX', 360),
  videoMaxLongSidePx: int('VIDEO_MAX_LONG_SIDE_PX', 3840),
  previewTimeoutMs: int('PREVIEW_TIMEOUT_MS', 30000),
  previewMaxInflightPerProject: int('PREVIEW_MAX_INFLIGHT_PER_PROJECT', 2),
  statusRefreshMinMs: int('STATUS_REFRESH_MIN_MS', 3000, { min: 0 }),
  minClipMs: int('MIN_CLIP_MS', 200),
  maxClips: int('MAX_CLIPS', 500),
  errors,
}

config.hasFeature = (name) => config.features.has(name)

module.exports = config
