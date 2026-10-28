// Which screen a project shows, and the copy for it (spec 05 §2). Pure.

export const POLL_INTERVAL_MS = 3000

export const SCREENS = {
  PROCESSING: 'processing',
  FAILED: 'failed',
  EDITOR: 'editor',
}

export const STAGE_TEXT = {
  QUEUED: 'Starting…',
  PREPARING: 'Preparing video',
  ANALYZING: 'Finding faces and speakers',
  PLANNING: 'Planning the frame',
  FINALIZING: 'Almost done',
}

// Statuses that never reach the editor, beyond FAILED/REJECTED's own error.
// UPLOADING here means the page was reloaded mid-upload: the File is gone, so
// the upload can't resume from this tab.
const UPLOAD_ENDED_MESSAGES = {
  UPLOADING: "This upload didn't finish. Please upload the video again.",
  UPLOAD_ABORTED: 'This upload was cancelled.',
  UPLOAD_EXPIRED: 'This upload expired before it finished. Please upload the video again.',
}

const FALLBACK_FAILURE = 'Something went wrong while processing this video.'

export function screenFor(project) {
  if (project?.status === 'PROCESSING') return SCREENS.PROCESSING
  if (project?.status === 'READY') return SCREENS.EDITOR
  return SCREENS.FAILED
}

export const stageText = (stage) => STAGE_TEXT[stage] || STAGE_TEXT.QUEUED

// → { title, message, retryable } for the Failed screen.
export function failureInfo(project) {
  const { status, processing } = project
  if (status in UPLOAD_ENDED_MESSAGES) {
    return { title: 'Upload not finished', message: UPLOAD_ENDED_MESSAGES[status], retryable: false }
  }
  return {
    title: status === 'REJECTED' ? "This video can't be used" : 'Processing failed',
    message: processing?.error?.message || FALLBACK_FAILURE,
    retryable: status === 'FAILED' && processing?.retryable === true,
  }
}

// Server elapsed time plus what has passed locally since that response, so
// the counter ticks between 3 s polls.
export function elapsedSince(processing, receivedAt, now = Date.now()) {
  const base = processing?.elapsedMs ?? 0
  const running = processing?.finishedAt == null
  return running && receivedAt ? base + Math.max(0, now - receivedAt) : base
}
