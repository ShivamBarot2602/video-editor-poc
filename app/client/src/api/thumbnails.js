import { getJsonOrNull } from './http'
import { openEventStream } from './stream'

// GET /api/thumbnails/:id → stored state, or null if none generated yet.
export const getThumbnails = (videoId) => getJsonOrNull(`/api/thumbnails/${videoId}`)

// GET /api/thumbnails/:id/stream (SSE) → raw EventSource; caller owns teardown.
export const openThumbnailStream = (videoId, reranker, handlers) =>
  openEventStream(`/api/thumbnails/${videoId}/stream?reranker=${encodeURIComponent(reranker)}`, handlers)
