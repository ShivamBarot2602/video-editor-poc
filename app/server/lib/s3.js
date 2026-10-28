/**
 * Low-level S3 access — the only module that talks to the AWS SDK. Everything
 * else (videoStore, services) calls these helpers with full object keys built
 * via config/storage.js `key()`.
 *
 * Stream rule (AWS SDK v3): GetObject Body is a Node Readable, readable once.
 * We either pipe it to a file (downloadToFile) or transform it to bytes/string.
 */

const fs = require('fs')
const { pipeline } = require('stream/promises')
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} = require('@aws-sdk/client-s3')
const { Upload } = require('@aws-sdk/lib-storage')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const { S3_BUCKET, AWS_REGION, credentials, PRESIGN_EXPIRES_S } = require('../config/storage')

// Lazily construct the client so requiring this module is side-effect-free — the
// S3Client throws if the region is missing, and we want the clean fail-fast in
// index.js to fire first when storage is unconfigured.
//
// requestChecksumCalculation: 'WHEN_REQUIRED' — since SDK 3.729 the default
// ('WHEN_SUPPORTED') bakes a CRC32 of the *empty* request body into presigned
// PUT / UploadPart URLs (x-amz-checksum-crc32=AAAAAA==), so the browser's
// upload of the real bytes fails S3's checksum check. Operations that require
// a checksum (e.g. DeleteObjects) still get one.
let _client = null
function getClient() {
  if (!_client) {
    _client = new S3Client({ region: AWS_REGION, credentials, requestChecksumCalculation: 'WHEN_REQUIRED' })
  }
  return _client
}

// Every SDK call goes through here so failures carry `awsService` (smartcrop's
// error middleware maps that to 502 UPSTREAM_ERROR; legacy callers ignore it).
async function send(cmd) {
  try {
    return await getClient().send(cmd)
  } catch (err) {
    if (err && typeof err === 'object') err.awsService = 's3'
    throw err
  }
}

// True when an S3 error means "object/key not found" (varies across operations).
function isNotFound(err) {
  const code = err?.name || err?.Code
  return code === 'NoSuchKey' || code === 'NotFound' || err?.$metadata?.httpStatusCode === 404
}

/**
 * Build the helper API bound to one bucket. The default export is bound to the
 * legacy S3_BUCKET (unchanged behaviour for every existing caller); smartcrop
 * gets its IN / JOBS / OUT buckets via forBucket(name).
 */
function makeApi(Bucket) {
  // ─── writes ──────────────────────────────────────────────────────────────────

  // Put an in-memory body (string | Buffer). Use for small JSON/text/images.
  async function putObject(key, body, contentType) {
    await send(new PutObjectCommand({
      Bucket, Key: key, Body: body,
      ...(contentType ? { ContentType: contentType } : {}),
    }))
  }

  // Stream a local file up via managed multipart upload (handles large videos).
  // onProgress (optional) receives 0–100 as parts complete.
  async function uploadFile(key, localPath, contentType, contentDisposition, onProgress) {
    const total = fs.statSync(localPath).size
    const up = new Upload({
      client: getClient(),
      // Cap in-flight part buffers (queueSize × partSize = 10MB) — the default
      // (4 × 5MB) plus ffmpeg plus node baseline is tight on 512MB containers,
      // and extra upload concurrency buys nothing on fractional-vCPU instances.
      queueSize: 5,
      partSize: 5 * 1024 * 1024,
      params: {
        Bucket, Key: key, Body: fs.createReadStream(localPath),
        ...(contentType ? { ContentType: contentType } : {}),
        ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
      },
    })
    if (typeof onProgress === 'function' && total > 0) {
      up.on('httpUploadProgress', ({ loaded }) => {
        if (loaded != null) onProgress(Math.min(100, Math.round((loaded / total) * 100)))
      })
    }
    await up.done()
  }

  // ─── reads ─────────────────────────────────────────────────────────────────--

  // Object body as a UTF-8 string, or null if the key is missing.
  async function getText(key) {
    try {
      const out = await send(new GetObjectCommand({ Bucket, Key: key }))
      return await out.Body.transformToString('utf-8')
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  // Object body as a Buffer, or null if the key is missing.
  async function getBuffer(key) {
    try {
      const out = await send(new GetObjectCommand({ Bucket, Key: key }))
      const bytes = await out.Body.transformToByteArray()
      return Buffer.from(bytes)
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  // Download an object to a local file path. Throws if the key is missing.
  // onProgress (optional) receives 0–100 as bytes arrive (needs ContentLength).
  async function downloadToFile(key, localPath, onProgress) {
    const out = await send(new GetObjectCommand({ Bucket, Key: key }))
    const total = out.ContentLength
    if (typeof onProgress === 'function' && total > 0) {
      let loaded = 0
      let lastSent = -1
      out.Body.on('data', (chunk) => {
        loaded += chunk.length
        const pct = Math.min(100, Math.round((loaded / total) * 100))
        if (pct !== lastSent) { lastSent = pct; onProgress(pct) }
      })
    }
    await pipeline(out.Body, fs.createWriteStream(localPath))
  }

  // ─── metadata / listing ────────────────────────────────────────────────────--

  // True if the exact key exists.
  async function exists(key) {
    try {
      await send(new HeadObjectCommand({ Bucket, Key: key }))
      return true
    } catch (err) {
      if (isNotFound(err)) return false
      throw err
    }
  }

  // HEAD an object → { size, contentType, lastModified } or null if missing.
  async function head(key) {
    try {
      const out = await send(new HeadObjectCommand({ Bucket, Key: key }))
      return { size: out.ContentLength, contentType: out.ContentType, lastModified: out.LastModified }
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  // Full object listing under a prefix (paginated): [{ key, size, lastModified }].
  // One round trip per 1000 objects — use this (not N separate listKeys calls)
  // whenever multiple facts about the same prefix are needed at once.
  async function listObjects(prefix) {
    const out = []
    let ContinuationToken
    do {
      const res = await send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }))
      for (const o of res.Contents || []) out.push({ key: o.Key, size: o.Size, lastModified: o.LastModified })
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (ContinuationToken)
    return out
  }

  // Convenience: just the keys, for call sites that only need existence/names.
  async function listKeys(prefix) {
    return (await listObjects(prefix)).map(o => o.key)
  }

  // ─── deletes ───────────────────────────────────────────────────────────────--

  async function deleteObject(key) {
    await send(new DeleteObjectCommand({ Bucket, Key: key }))
  }

  // Delete every object under a prefix. Batches of up to 1000 per request.
  async function deleteByPrefix(prefix) {
    const keys = await listKeys(prefix)
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000)
      await send(new DeleteObjectsCommand({
        Bucket, Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true },
      }))
    }
  }

  // ─── presigning (upload only) ──────────────────────────────────────────────--

  // Presigned PUT for a browser → S3 direct single-request upload (small files —
  // whatever fits in one multipart part, so no multipart machinery needed at all).
  // `contentType` is signed in; the caller MUST send an identical Content-Type
  // header on the actual PUT or S3 rejects it with a signature mismatch.
  function presignPut(key, contentType, { expiresIn = PRESIGN_EXPIRES_S } = {}) {
    const cmd = new PutObjectCommand({
      Bucket, Key: key,
      ...(contentType ? { ContentType: contentType } : {}),
    })
    return getSignedUrl(getClient(), cmd, { expiresIn })
  }

  // Start a multipart upload; ContentType is set here (once) — UploadPart itself
  // carries no content-type. Returns the uploadId used by every subsequent call.
  async function createMultipartUpload(key, contentType) {
    const out = await send(new CreateMultipartUploadCommand({
      Bucket, Key: key,
      ...(contentType ? { ContentType: contentType } : {}),
    }))
    return out.UploadId
  }

  // Presigned PUT for one part of a multipart upload. No body to sign — the
  // browser PUTs raw bytes directly and must read the ETag off the response.
  function presignUploadPart(key, uploadId, partNumber, { expiresIn = PRESIGN_EXPIRES_S } = {}) {
    const cmd = new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber })
    return getSignedUrl(getClient(), cmd, { expiresIn })
  }

  // Finalize a multipart upload. `parts` is [{ partNumber, eTag }] — every part
  // the client successfully uploaded, order doesn't matter (S3 sorts by PartNumber).
  async function completeMultipartUpload(key, uploadId, parts) {
    await send(new CompleteMultipartUploadCommand({
      Bucket, Key: key, UploadId: uploadId,
      MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.eTag })) },
    }))
  }

  // Abort a multipart upload, discarding any parts already uploaded to S3. Called
  // automatically when a client-side upload fails past its retry budget, so
  // orphaned parts don't sit around until the bucket lifecycle rule sweeps them.
  async function abortMultipartUpload(key, uploadId) {
    await send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }))
  }

  // ─── smartcrop additions ────────────────────────────────────────────────────

  // Presigned GET. `responseContentType` / `responseContentDisposition` are
  // signed into the URL as response overrides.
  function presignGet(key, { expiresIn = PRESIGN_EXPIRES_S, responseContentType, responseContentDisposition } = {}) {
    const cmd = new GetObjectCommand({
      Bucket, Key: key,
      ...(responseContentType ? { ResponseContentType: responseContentType } : {}),
      ...(responseContentDisposition ? { ResponseContentDisposition: responseContentDisposition } : {}),
    })
    return getSignedUrl(getClient(), cmd, { expiresIn })
  }

  // Every part S3 holds for a multipart upload (paginated):
  // [{ partNumber, etag, sizeBytes }] sorted by partNumber.
  async function listParts(key, uploadId) {
    const out = []
    let PartNumberMarker
    do {
      const res = await send(new ListPartsCommand({ Bucket, Key: key, UploadId: uploadId, PartNumberMarker }))
      for (const p of res.Parts || []) out.push({ partNumber: p.PartNumber, etag: p.ETag, sizeBytes: p.Size })
      PartNumberMarker = res.IsTruncated ? res.NextPartNumberMarker : undefined
    } while (PartNumberMarker)
    return out.sort((a, b) => a.partNumber - b.partNumber)
  }

  return {
    bucket: Bucket,
    putObject,
    uploadFile,
    getText,
    getBuffer,
    downloadToFile,
    exists,
    head,
    listObjects,
    listKeys,
    deleteObject,
    deleteByPrefix,
    presignPut,
    createMultipartUpload,
    presignUploadPart,
    completeMultipartUpload,
    abortMultipartUpload,
    presignGet,
    listParts,
  }
}

const bound = new Map()
function forBucket(bucket) {
  if (!bucket) throw new Error('forBucket: bucket name required')
  if (!bound.has(bucket)) bound.set(bucket, makeApi(bucket))
  return bound.get(bucket)
}

const defaultApi = makeApi(S3_BUCKET)

module.exports = {
  getClient,
  isNotFound,
  forBucket,
  ...defaultApi,
}
