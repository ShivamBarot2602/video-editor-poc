import { getJsonOrNull, patchJson, postRaw } from './http'

// GET /api/transcription/:id/:provider → parsed JSON, or null if not present.
export const getTranscriptionOrNull = (videoId, provider) =>
  getJsonOrNull(`/api/transcription/${videoId}/${provider}`)

// PATCH /api/transcription/:id/:provider → updated transcription; throws on !ok.
// Body is either { speaker_aliases } or { segment_edits }.
export const patchTranscription = (videoId, provider, body, fallbackMsg) =>
  patchJson(`/api/transcription/${videoId}/${provider}`, body, fallbackMsg)

// POST /api/transcribe/:id → raw Response (callers branch on res.ok themselves).
export const transcribe = (videoId, body) => postRaw(`/api/transcribe/${videoId}`, body)

// POST /api/burn/:id → raw Response whose body streams SSE progress events.
// Caller checks res.ok then pipes the body through readJsonLines.
export const burn = (videoId, body) => postRaw(`/api/burn/${videoId}`, body)

// POST /api/prepare/:id → resolves on success; throws a fixed message on failure
// (the caller never inspects the response body).
export async function prepare(videoId) {
  const res = await fetch(`/api/prepare/${videoId}`, { method: 'POST' })
  if (!res.ok) throw new Error('Audio preparation failed')
}

// Download URL for a server-rendered subtitle export (srt, …).
export const subtitleDownloadUrl = (videoId, provider, formatId) =>
  `/api/transcription/${videoId}/${provider}/${formatId}`

// POST current editor style → server renders .ass and streams the file back
// as text. Returns the raw response so the caller can pull the blob and
// trigger a browser download.
export const downloadAss = (videoId, provider, style) =>
  postRaw(`/api/transcription/${videoId}/${provider}/ass`, { style })
