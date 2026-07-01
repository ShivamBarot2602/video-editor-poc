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
} = require('@aws-sdk/client-s3')
const { Upload } = require('@aws-sdk/lib-storage')
const { createPresignedPost: sdkCreatePresignedPost } = require('@aws-sdk/s3-presigned-post')

const { S3_BUCKET, AWS_REGION, credentials, PRESIGN_EXPIRES_S } = require('../config/storage')

const Bucket = S3_BUCKET

// Lazily construct the client so requiring this module is side-effect-free — the
// S3Client throws if the region is missing, and we want the clean fail-fast in
// index.js to fire first when storage is unconfigured.
let _client = null
function getClient() {
  if (!_client) _client = new S3Client({ region: AWS_REGION, credentials })
  return _client
}

// True when an S3 error means "object/key not found" (varies across operations).
function isNotFound(err) {
  const code = err?.name || err?.Code
  return code === 'NoSuchKey' || code === 'NotFound' || err?.$metadata?.httpStatusCode === 404
}

// ─── writes ──────────────────────────────────────────────────────────────────

// Put an in-memory body (string | Buffer). Use for small JSON/text/images.
async function putObject(key, body, contentType) {
  await getClient().send(new PutObjectCommand({
    Bucket, Key: key, Body: body,
    ...(contentType ? { ContentType: contentType } : {}),
  }))
}

// Stream a local file up via managed multipart upload (handles large videos).
async function uploadFile(key, localPath, contentType, contentDisposition) {
  const up = new Upload({
    client: getClient(),
    params: {
      Bucket, Key: key, Body: fs.createReadStream(localPath),
      ...(contentType ? { ContentType: contentType } : {}),
      ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
    },
  })
  await up.done()
}

// ─── reads ─────────────────────────────────────────────────────────────────--

// Object body as a UTF-8 string, or null if the key is missing.
async function getText(key) {
  try {
    const out = await getClient().send(new GetObjectCommand({ Bucket, Key: key }))
    return await out.Body.transformToString('utf-8')
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

// Object body as a Buffer, or null if the key is missing.
async function getBuffer(key) {
  try {
    const out = await getClient().send(new GetObjectCommand({ Bucket, Key: key }))
    const bytes = await out.Body.transformToByteArray()
    return Buffer.from(bytes)
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

// Download an object to a local file path. Throws if the key is missing.
async function downloadToFile(key, localPath) {
  const out = await getClient().send(new GetObjectCommand({ Bucket, Key: key }))
  await pipeline(out.Body, fs.createWriteStream(localPath))
}

// ─── metadata / listing ────────────────────────────────────────────────────--

// True if the exact key exists.
async function exists(key) {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket, Key: key }))
    return true
  } catch (err) {
    if (isNotFound(err)) return false
    throw err
  }
}

// HEAD an object → { size, contentType, lastModified } or null if missing.
async function head(key) {
  try {
    const out = await getClient().send(new HeadObjectCommand({ Bucket, Key: key }))
    return { size: out.ContentLength, contentType: out.ContentType, lastModified: out.LastModified }
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

// All keys under a prefix (paginated). Returns full keys (including the prefix).
async function listKeys(prefix) {
  const keys = []
  let ContinuationToken
  do {
    const out = await getClient().send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }))
    for (const o of out.Contents || []) keys.push(o.Key)
    ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (ContinuationToken)
  return keys
}

// ─── deletes ───────────────────────────────────────────────────────────────--

async function deleteObject(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket, Key: key }))
}

// Delete every object under a prefix. Batches of up to 1000 per request.
async function deleteByPrefix(prefix) {
  const keys = await listKeys(prefix)
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000)
    await getClient().send(new DeleteObjectsCommand({
      Bucket, Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true },
    }))
  }
}

// ─── presigning (upload only) ──────────────────────────────────────────────--

// Presigned POST for browser → S3 direct upload. `conditions` enforce size/type
// at S3 (e.g. ['content-length-range', 0, max]); `fields` are echoed back.
function createPresignedPost(key, { conditions = [], fields = {}, expiresIn = PRESIGN_EXPIRES_S } = {}) {
  return sdkCreatePresignedPost(getClient(), { Bucket, Key: key, Conditions: conditions, Fields: fields, Expires: expiresIn })
}

module.exports = {
  getClient,
  putObject,
  uploadFile,
  getText,
  getBuffer,
  downloadToFile,
  exists,
  head,
  listKeys,
  deleteObject,
  deleteByPrefix,
  createPresignedPost,
}
