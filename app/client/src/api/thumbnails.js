import { getJsonOrNull } from './http'

// GET /api/thumbnails/:id → stored state, or null if none generated yet.
export const getThumbnails = (videoId) => getJsonOrNull(`/api/thumbnails/${videoId}`)

// PATCH /api/thumbnails/:id → updated state when ok, else null (caller ignores failures).
export const patchThumbnailSelection = (videoId, selectedKey) =>
  fetch(`/api/thumbnails/${videoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedKey }),
  }).then((r) => (r.ok ? r.json() : null))

// openThumbnailStream (SSE) is added alongside this in the streaming pass.
