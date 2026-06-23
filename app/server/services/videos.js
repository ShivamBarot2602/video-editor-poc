const store = require('../storage/videoStore')

// Assemble the Recent Videos cards: one per session dir that has an original file.
function listVideos() {
  const videos = []
  for (const id of store.listSessionIds()) {
    const originalName = store.findOriginalName(id)
    if (!originalName) continue

    const meta = store.readMeta(id)
    const originalStat = store.statOriginal(id)
    const providers = store.listTranscriptionProviders(id)
    const clipProviders = store.listClipProviders(id)

    videos.push({
      id,
      filename: meta.filename || originalName,
      size: meta.size ?? originalStat.size,
      providers,
      clipProviders,
      hasClips: clipProviders.length > 0,
      hasBurned: store.hasBurned(id),
      uploadedAt: meta.uploadedAt || originalStat.mtime.toISOString(),
      thumbnail: `/api/video/${id}/thumbnail?v=2`,
    })
  }

  videos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
  return videos
}

module.exports = { listVideos }
