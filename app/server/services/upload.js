const path = require('path')
const store = require('../storage/videoStore')
const s3 = require('../lib/s3')
const { key } = require('../config/storage')
const { normalizeVideoExtension } = require('../lib/videoExtensions')

// Mint a videoId + presigned POST for the browser to upload original.<ext>
// straight to S3. The content-length-range condition caps the size at S3; the
// Content-Type field is auto-added to the policy conditions by the SDK.
async function createPresignedUpload({ filename, contentType, maxBytes }) {
  const videoId = store.newId()
  const ext = normalizeVideoExtension(path.extname(filename || ''))
  const objectKey = key(videoId, `original${ext}`)

  const { url, fields } = await s3.createPresignedPost(objectKey, {
    conditions: [['content-length-range', 0, maxBytes]],
    fields: { 'Content-Type': contentType },
  })

  return { videoId, url, fields }
}

// Confirm the object exists, then persist filename/size/time for Recent Videos.
// Returns null if the object never landed (client lied or upload failed).
async function completeUpload({ videoId, filename, size }) {
  const stat = await store.statOriginal(videoId)
  if (!stat) return null

  const name = await store.findOriginalName(videoId)
  const meta = {
    filename: filename || name,
    size: stat.size ?? (size != null ? Number(size) : null),
    uploadedAt: new Date().toISOString(),
  }
  await store.writeMeta(videoId, meta)
  return { videoId, filename: meta.filename, size: meta.size }
}

module.exports = { createPresignedUpload, completeUpload }
