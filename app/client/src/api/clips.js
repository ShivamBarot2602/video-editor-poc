import { getJsonOrNull, postJson, del } from './http'
import { openEventStream } from './stream'

// GET /api/clips/:id/:provider → suggestions for that provider, or null.
export const getClips = (videoId, provider) => getJsonOrNull(`/api/clips/${videoId}/${provider}`)

// GET /api/clips/:id/saved → saved-clip library, or { clips: [] } if absent.
export const getSavedClips = (videoId) => getJsonOrNull(`/api/clips/${videoId}/saved`, { clips: [] })

// POST /api/clips/:id/suggest → suggestion result; throws on !ok.
export const suggestClips = (videoId, body, fallbackMsg) =>
  postJson(`/api/clips/${videoId}/suggest`, body, fallbackMsg)

// POST /api/clips/:id/saved → { saved, clips }; throws on !ok.
export const saveClip = (videoId, body, fallbackMsg) =>
  postJson(`/api/clips/${videoId}/saved`, body, fallbackMsg)

// DELETE /api/clips/:id/saved/:savedId → { clips }; throws on !ok.
export const removeSavedClip = (videoId, savedId, fallbackMsg) =>
  del(`/api/clips/${videoId}/saved/${savedId}`, fallbackMsg)

// GET /api/clips/:id/suggest/stream (SSE, video method) → raw EventSource.
export const openSuggestStream = (videoId, { method, bucket, count, model }, handlers) => {
  const params = new URLSearchParams({ method, bucket, count: String(count) })
  if (model) params.set('model', model)
  return openEventStream(`/api/clips/${videoId}/suggest/stream?${params.toString()}`, handlers)
}

// GET /api/clips/:id/export/stream (SSE) → raw EventSource.
export const openExportStream = (videoId, { clipId, source, suggestProvider }, handlers) => {
  const params = new URLSearchParams({ clipId })
  if (source === 'saved') params.set('source', 'saved')
  else params.set('suggestProvider', suggestProvider)
  return openEventStream(`/api/clips/${videoId}/export/stream?${params.toString()}`, handlers)
}
