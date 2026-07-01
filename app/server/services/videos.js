const store = require('../storage/videoStore')

// Assemble the Recent Videos cards: one per session that has an original file.
async function listVideos() {
  const videos = []
  for (const id of await store.listSessionIds()) {
    const originalName = await store.findOriginalName(id)
    if (!originalName) continue

    const meta = await store.readMeta(id)
    const originalStat = await store.statOriginal(id)
    const providers = await store.listTranscriptionProviders(id)
    const clipProviders = await store.listClipProviders(id)

    videos.push({
      id,
      filename: meta.filename || originalName,
      size: meta.size ?? originalStat?.size ?? null,
      providers,
      clipProviders,
      hasClips: clipProviders.length > 0,
      hasBurned: await store.hasBurned(id),
      uploadedAt: meta.uploadedAt || originalStat?.mtime?.toISOString() || null,
      thumbnail: `/api/video/${id}/thumbnail?v=2`,
    })
  }

  videos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
  return videos
}

module.exports = { listVideos }
