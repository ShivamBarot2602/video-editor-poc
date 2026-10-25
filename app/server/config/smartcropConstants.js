/**
 * SmartCrop shared constants (spec 00 §2, §3, §5). Policy values that come from
 * env live in config/smartcrop.js; these are fixed by the spec / pipeline.
 */

const ASPECTS = ['9:16', '4:5', '1:1', '16:9']
const LAYOUTS = ['fill', 'fit', 'split', 'three', 'four']

// Copy of the pipeline's LAYOUT_SUPPORT (spec 00 §3) — a unit test pins it.
const LAYOUT_SUPPORT = {
  '9:16': ['fill', 'fit', 'split', 'three', 'four'],
  '4:5': ['fill', 'fit', 'split'],
  '1:1': ['fill', 'fit', 'split'],
  '16:9': ['fill', 'fit', 'split'],
}

const BACKGROUNDS = ['blur', 'black'] // or '#RRGGBB'
const FALLBACK_LAYOUTS = ['fill', 'fit']
const DEFAULT_OPTIONS = { background: 'blur', fallbackLayout: 'fill' }

// Allowed upload extensions → content types that may accompany them.
const VIDEO_TYPES = {
  mp4: ['video/mp4'],
  m4v: ['video/x-m4v', 'video/mp4'],
  mov: ['video/quicktime'],
  webm: ['video/webm'],
}
const ALLOWED_CONTENT_TYPES = [...new Set(Object.values(VIDEO_TYPES).flat())]
const ALLOWED_EXTENSIONS = Object.keys(VIDEO_TYPES).map(e => `.${e}`)

// ffprobe `format_name` (comma list) must contain one of these for the ext.
const FORMAT_NAMES = {
  mp4: ['mp4', 'mov'],
  m4v: ['mp4', 'mov'],
  mov: ['mov'],
  webm: ['webm', 'matroska'],
}

const PROJECT_ID_RE = /^prj_[0-9a-z]{26}$/
const RENDER_ID_RE = /^rnd_[0-9a-z]{26}$/
const CLIP_ID_RE = /^[a-zA-Z0-9_-]{1,40}$/

const PROJECT_STATUS = {
  UPLOADING: 'UPLOADING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
  UPLOAD_ABORTED: 'UPLOAD_ABORTED',
  UPLOAD_EXPIRED: 'UPLOAD_EXPIRED',
}
const PROJECT_STATUSES = Object.values(PROJECT_STATUS)

const RENDER_STATUS = {
  QUEUED: 'QUEUED',
  RENDERING: 'RENDERING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
}
const RENDER_STATUSES = Object.values(RENDER_STATUS)
const RENDER_ACTIVE = [RENDER_STATUS.QUEUED, RENDER_STATUS.RENDERING]

// Processing stage from the latest Step Functions state entered (spec 00 §5).
const PROCESSING_STAGES = ['QUEUED', 'PREPARING', 'ANALYZING', 'PLANNING', 'FINALIZING']
const STATE_TO_STAGE = {
  Init: 'QUEUED', MarkRunning: 'QUEUED', StartAt: 'QUEUED',
  Prepare: 'PREPARING',
  Analyze: 'ANALYZING',
  Decide: 'PLANNING', Plan: 'PLANNING', MarkPlanned: 'PLANNING',
  AnyPlans: 'FINALIZING', ReadManifest: 'FINALIZING', Render: 'FINALIZING', RenderOne: 'FINALIZING', MarkDone: 'FINALIZING',
}

// Render: states up to MarkPlanned → QUEUED/PLANNING; AnyPlans on → RENDERING/ENCODING (spec 04 §3).
const RENDER_ENCODING_STATES = ['AnyPlans', 'ReadManifest', 'Render', 'RenderOne', 'MarkDone']

// Pipeline `failed_state` → failure code (spec 00 §5).
const FAILED_STATE_TO_CODE = {
  Prepare: 'PREPARE_FAILED',
  Analyze: 'ANALYZE_FAILED',
  Decide: 'DECIDE_FAILED',
  Plan: 'PLAN_FAILED',
  Render: 'RENDER_FAILED',
  RenderOne: 'RENDER_FAILED',
}

const FAILED_STAGE_BY_CODE = {
  PREPARE_FAILED: 'PREPARE',
  ANALYZE_FAILED: 'ANALYZE',
  DECIDE_FAILED: 'DECIDE',
  PLAN_FAILED: 'PLAN',
  RENDER_FAILED: 'RENDER',
  OUTPUT_MISSING: 'RENDER',
}

// Fixed user-facing message per failure code. Raw pipeline error_message is only logged.
const FAILURE_MESSAGES = {
  PREPARE_FAILED: "We couldn't read this video. Try again, or upload a different file.",
  ANALYZE_FAILED: "We couldn't analyse this video. Try again, or upload a different file.",
  DECIDE_FAILED: "We couldn't work out how to frame this video. Try again, or upload a different file.",
  PLAN_FAILED: "We couldn't plan the crop for this video. Please try again.",
  RENDER_FAILED: "We couldn't create the video. Please try saving again.",
  PIPELINE_FAILED: 'Something went wrong while processing this video. Please try again.',
  PIPELINE_TIMED_OUT: 'Processing took too long and was stopped. Please try again.',
  PIPELINE_ABORTED: 'Processing was stopped before it finished. Please try again.',
  OUTPUT_MISSING: "The finished video couldn't be found. Please try saving again.",
}

const MAX_PROCESSING_ATTEMPTS = 3
const ANALYSIS_FPS = 25
const MAX_SNAP_POINTS = 2000
const COMPLETE_LOCK_MS = 2 * 60 * 1000
const MIN_OUTPUT_MS = 1000
const LIST_PK = 'P'

module.exports = {
  ASPECTS,
  LAYOUTS,
  LAYOUT_SUPPORT,
  BACKGROUNDS,
  FALLBACK_LAYOUTS,
  DEFAULT_OPTIONS,
  VIDEO_TYPES,
  ALLOWED_CONTENT_TYPES,
  ALLOWED_EXTENSIONS,
  FORMAT_NAMES,
  PROJECT_ID_RE,
  RENDER_ID_RE,
  CLIP_ID_RE,
  PROJECT_STATUS,
  PROJECT_STATUSES,
  RENDER_STATUS,
  RENDER_STATUSES,
  RENDER_ACTIVE,
  PROCESSING_STAGES,
  STATE_TO_STAGE,
  RENDER_ENCODING_STATES,
  FAILED_STATE_TO_CODE,
  FAILED_STAGE_BY_CODE,
  FAILURE_MESSAGES,
  MAX_PROCESSING_ATTEMPTS,
  ANALYSIS_FPS,
  MAX_SNAP_POINTS,
  COMPLETE_LOCK_MS,
  MIN_OUTPUT_MS,
  LIST_PK,
}
