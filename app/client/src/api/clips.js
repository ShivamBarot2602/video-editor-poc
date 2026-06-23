import { getJsonOrNull, postJson, del } from './http'

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

// openSuggestStream / openExportStream (SSE) are added in the streaming pass.
