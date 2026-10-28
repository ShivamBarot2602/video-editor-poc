// How a project appears in the projects list (GET /projects, spec 02 §2). Pure.

import { stageText } from './projectStatus.js'

export const PROJECTS_PAGE_SIZE = 20

// tone: 'ok' | 'busy' | 'error' | 'muted' — the badge colour.
const STATUS_BADGES = {
  READY: { label: 'Ready', tone: 'ok' },
  FAILED: { label: 'Failed', tone: 'error' },
  REJECTED: { label: "Can't be used", tone: 'error' },
  UPLOADING: { label: 'Upload not finished', tone: 'muted' },
  UPLOAD_ABORTED: { label: 'Upload cancelled', tone: 'muted' },
  UPLOAD_EXPIRED: { label: 'Upload expired', tone: 'muted' },
}

const RENDER_LABELS = {
  QUEUED: 'Rendering…',
  RENDERING: 'Rendering…',
  SUCCEEDED: 'Rendered',
  FAILED: 'Render failed',
  CANCELLED: 'Render cancelled',
}

// → { label, tone } for the status badge. Processing shows its stage.
export function statusBadge(project) {
  if (project.status === 'PROCESSING') return { label: stageText(project.processing?.stage), tone: 'busy' }
  return STATUS_BADGES[project.status] ?? { label: project.status, tone: 'muted' }
}

// "Rendered · 9:16" for the last render, or null if there never was one.
export function lastRenderText(project) {
  const render = project.lastRender
  if (!render) return null
  const label = RENDER_LABELS[render.status] ?? render.status
  return render.aspect ? `${label} · ${render.aspect}` : label
}

// Append a page, dropping any project already listed (a project created
// between page loads can shift items across the cursor boundary).
export function mergePage(items, page) {
  const seen = new Set(items.map((p) => p.projectId))
  return [...items, ...page.filter((p) => !seen.has(p.projectId))]
}
