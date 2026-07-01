const path = require('path')
const store = require('../storage/videoStore')
const s3 = require('../lib/s3')
const { key } = require('../config/storage')
const { normalizeVideoExtension } = require('../lib/videoExtensions')
const { UPLOAD_PART_SIZE_BYTES } = require('../config/constants')

// Mint a videoId + presigned upload URL(s) for the browser to PUT
// original.<ext> straight to S3. A file that fits in one part gets a plain
// presigned PUT (no multipart machinery); anything larger gets a multipart
// upload with one presigned UploadPart URL per part, uploaded in parallel
// client-side.
async function createPresignedUpload({ filename, contentType, size }) {
  const videoId = store.newId()
  const ext = normalizeVideoExtension(path.extname(filename || ''))
  const objectKey = key(videoId, `original${ext}`)

  if (size <= UPLOAD_PART_SIZE_BYTES) {
    const url = await s3.presignPut(objectKey, contentType)
    return { videoId, key: objectKey, mode: 'single', url }
  }

  const uploadId = await s3.createMultipartUpload(objectKey, contentType)
  const partCount = Math.ceil(size / UPLOAD_PART_SIZE_BYTES)
  const parts = []
  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    parts.push({ partNumber, url: await s3.presignUploadPart(objectKey, uploadId, partNumber) })
  }

  return { videoId, key: objectKey, mode: 'multipart', uploadId, partSize: UPLOAD_PART_SIZE_BYTES, parts }
}

/**
 * Finalize an upload. For multipart, assemble the parts on S3 first (tolerates
 * a duplicate completion call — e.g. a retried request after the first one
 * actually succeeded — by falling back to the existence check instead of
 * hard-failing). Either way, confirm the object landed and isn't over the
 * declared size limit, then persist filename/size/time for Recent Videos.
 *
 * Unlike the old presigned-POST flow, a presigned PUT/UploadPart URL carries
 * no content-length condition — nothing stops a client from sending more bytes
 * than it declared. So the size cap has to be re-checked here, post-hoc, once
 * we can HEAD the real object; an oversized upload gets deleted rather than
 * silently accepted.
 *
 * Returns null if the object never landed. Throws (with `.oversized = true`)
 * if it exceeds `maxBytes`.
 */
async function completeUpload({ videoId, filename, size, key: objectKey, uploadId, parts, maxBytes }) {
  if (uploadId) {
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error('parts required to complete a multipart upload')
    }
    try {
      await s3.completeMultipartUpload(objectKey, uploadId, parts)
    } catch (err) {
      const alreadyDone = await store.statOriginal(videoId)
      if (!alreadyDone) throw err
    }
  }

  const stat = await store.statOriginal(videoId)
  if (!stat) return null

  if (maxBytes != null && stat.size > maxBytes) {
    await s3.deleteObject(objectKey)
    const err = new Error('Uploaded file exceeds the size limit')
    err.oversized = true
    throw err
  }

  const name = await store.findOriginalName(videoId)
  const meta = {
    filename: filename || name,
    size: stat.size ?? (size != null ? Number(size) : null),
    uploadedAt: new Date().toISOString(),
  }
  await store.writeMeta(videoId, meta)
  return { videoId, filename: meta.filename, size: meta.size }
}

// Abort an in-progress multipart upload (called by the client after a part
// exhausts its retry budget) so orphaned parts don't sit on S3 until the
// bucket's lifecycle rule eventually sweeps them.
async function abortUpload({ key: objectKey, uploadId }) {
  await s3.abortMultipartUpload(objectKey, uploadId)
}

module.exports = { createPresignedUpload, completeUpload, abortUpload }
