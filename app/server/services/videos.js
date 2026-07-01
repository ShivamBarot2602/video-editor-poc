const store = require('../storage/videoStore')
const { PREFIXES } = require('../config/paths')

// Derive a video card from its session's raw object listing + meta.json
// content. `objects` is [{ rel, size, lastModified }] (rel = key relative to
// the session, from videoStore.listSessionObjects/listAllSessionObjects) — a
// single S3 listing already has everything except meta.json's own content, so
// this does zero extra S3 calls beyond the one `meta` was fetched with.
function assemble(id, objects, meta) {
  const original = objects.find(o => o.rel.startsWith(PREFIXES.ORIGINAL))
  if (!original) return null

  const providers = objects
    .filter(o => o.rel.startsWith(PREFIXES.TRANSCRIPTION) && o.rel.endsWith('.json'))
    .map(o => o.rel.slice(PREFIXES.TRANSCRIPTION.length, -'.json'.length))

  const clipProviders = objects
    .filter(o => o.rel.startsWith(PREFIXES.CLIPS) && o.rel.endsWith('.json'))
    .map(o => o.rel.slice(PREFIXES.CLIPS.length, -'.json'.length))

  const hasBurned = objects.some(o => o.rel.startsWith(PREFIXES.BURNED))

  return {
    id,
    filename: meta.filename || original.rel,
    size: meta.size ?? original.size ?? null,
    providers,
    clipProviders,
    hasClips: clipProviders.length > 0,
    hasBurned,
    uploadedAt: meta.uploadedAt || original.lastModified?.toISOString() || null,
    thumbnail: `/api/video/${id}/thumbnail?v=2`,
  }
}

// Single video's card — one S3 listing + one meta.json read (2 calls total,
// down from ~7 sequential ones before).
async function getVideo(id) {
  const [objects, meta] = await Promise.all([store.listSessionObjects(id), store.readMeta(id)])
  return assemble(id, objects, meta)
}

// Assemble the Recent Videos cards: one per session that has an original file.
// One bucket-wide listing (1 call, however many sessions exist) + every
// meta.json read in parallel — down from ~7 sequential S3 calls PER video.
async function listVideos() {
  const byId = await store.listAllSessionObjects()
  const ids = [...byId.keys()]
  const metas = await Promise.all(ids.map(id => store.readMeta(id)))

  const videos = ids
    .map((id, i) => assemble(id, byId.get(id), metas[i]))
    .filter(Boolean)

  videos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
  return videos
}

module.exports = { listVideos, getVideo }
