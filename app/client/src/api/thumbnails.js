import { getJsonOrNull } from './http'
import { openEventStream } from './stream'

// GET /api/thumbnails/:id → stored state, or null if none generated yet.
export const getThumbnails = (videoId) => getJsonOrNull(`/api/thumbnails/${videoId}`)

// PATCH /api/thumbnails/:id → updated state when ok, else null (caller ignores failures).
export const patchThumbnailSelection = (videoId, selectedKey) =>
  fetch(`/api/thumbnails/${videoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedKey }),
  }).then((r) => (r.ok ? r.json() : null))

// GET /api/thumbnails/:id/stream (SSE) → raw EventSource; caller owns teardown.
export const openThumbnailStream = (videoId, reranker, handlers) =>
  openEventStream(`/api/thumbnails/${videoId}/stream?reranker=${encodeURIComponent(reranker)}`, handlers)
