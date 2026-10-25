/**
 * In-memory S3 behind aws-sdk-client-mock — objects per bucket plus multipart
 * uploads, enough for the smartcrop flows (and the legacy helpers it shares).
 */

const crypto = require('crypto')
const { mockClient } = require('aws-sdk-client-mock')
const {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, DeleteObjectsCommand,
  ListObjectsV2Command, CreateMultipartUploadCommand, ListPartsCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3')

function s3Error(name, status) {
  const err = new Error(name)
  err.name = name
  err.$metadata = { httpStatusCode: status }
  return err
}

function body(buf) {
  return {
    transformToString: async (enc = 'utf-8') => buf.toString(enc),
    transformToByteArray: async () => new Uint8Array(buf),
  }
}

function createFakeS3() {
  const objects = new Map() // `${bucket}/${key}` → { body: Buffer, contentType }
  const uploads = new Map() // uploadId → { bucket, key, contentType, parts: Map(n → { etag, size }) }
  const failNext = []
  const id = (b, k) => `${b}/${k}`
  const maybeFail = (command) => {
    const idx = failNext.findIndex(f => f.command === command)
    if (idx >= 0) { const [f] = failNext.splice(idx, 1); throw f.error }
  }

  const mock = mockClient(S3Client)

  mock.on(PutObjectCommand).callsFake((i) => {
    maybeFail('PutObject')
    objects.set(id(i.Bucket, i.Key), { body: Buffer.from(i.Body), contentType: i.ContentType })
    return { ETag: '"put"' }
  })
  mock.on(GetObjectCommand).callsFake((i) => {
    maybeFail('GetObject')
    const o = objects.get(id(i.Bucket, i.Key))
    if (!o) throw s3Error('NoSuchKey', 404)
    return { Body: body(o.body), ContentLength: o.body.length, ContentType: o.contentType }
  })
  mock.on(HeadObjectCommand).callsFake((i) => {
    maybeFail('HeadObject')
    const o = objects.get(id(i.Bucket, i.Key))
    if (!o) throw s3Error('NotFound', 404)
    return { ContentLength: o.size ?? o.body.length, ContentType: o.contentType, LastModified: new Date() }
  })
  mock.on(DeleteObjectCommand).callsFake((i) => {
    maybeFail('DeleteObject')
    objects.delete(id(i.Bucket, i.Key))
    return {}
  })
  mock.on(DeleteObjectsCommand).callsFake((i) => {
    maybeFail('DeleteObjects')
    for (const o of i.Delete.Objects) objects.delete(id(i.Bucket, o.Key))
    return {}
  })
  mock.on(ListObjectsV2Command).callsFake((i) => {
    maybeFail('ListObjectsV2')
    const Contents = [...objects.entries()]
      .filter(([k]) => k.startsWith(`${i.Bucket}/${i.Prefix || ''}`))
      .map(([k, o]) => ({ Key: k.slice(i.Bucket.length + 1), Size: o.size ?? o.body.length, LastModified: new Date() }))
      .sort((a, b) => a.Key.localeCompare(b.Key))
    return { Contents, IsTruncated: false }
  })
  mock.on(CreateMultipartUploadCommand).callsFake((i) => {
    maybeFail('CreateMultipartUpload')
    const UploadId = `up-${crypto.randomUUID()}`
    uploads.set(UploadId, { bucket: i.Bucket, key: i.Key, contentType: i.ContentType, parts: new Map() })
    return { UploadId }
  })
  mock.on(ListPartsCommand).callsFake((i) => {
    maybeFail('ListParts')
    const u = uploads.get(i.UploadId)
    if (!u) throw s3Error('NoSuchUpload', 404)
    const Parts = [...u.parts.entries()].sort((a, b) => a[0] - b[0]).map(([n, p]) => ({ PartNumber: n, ETag: p.etag, Size: p.size }))
    return { Parts, IsTruncated: false }
  })
  mock.on(CompleteMultipartUploadCommand).callsFake((i) => {
    maybeFail('CompleteMultipartUpload')
    const u = uploads.get(i.UploadId)
    if (!u) throw s3Error('NoSuchUpload', 404)
    const sent = i.MultipartUpload.Parts
    for (let k = 1; k < sent.length; k++) if (sent[k].PartNumber <= sent[k - 1].PartNumber) throw s3Error('InvalidPartOrder', 400)
    let size = 0
    for (const p of sent) {
      const have = u.parts.get(p.PartNumber)
      if (!have || have.etag !== p.ETag) throw s3Error('InvalidPart', 400)
      size += have.size
    }
    objects.set(id(u.bucket, u.key), { body: Buffer.alloc(0), size, contentType: u.contentType })
    uploads.delete(i.UploadId)
    return { ETag: '"done"' }
  })
  mock.on(AbortMultipartUploadCommand).callsFake((i) => {
    maybeFail('AbortMultipartUpload')
    if (!uploads.has(i.UploadId)) throw s3Error('NoSuchUpload', 404)
    uploads.delete(i.UploadId)
    return {}
  })

  return {
    mock,
    objects,
    uploads,
    // Simulate the browser PUTting a part; returns the quoted ETag.
    uploadPart(uploadId, partNumber, size) {
      const u = uploads.get(uploadId)
      if (!u) throw new Error(`no upload ${uploadId}`)
      const etag = `"etag-${partNumber}-${crypto.randomBytes(4).toString('hex')}"`
      u.parts.set(partNumber, { etag, size })
      return etag
    },
    putJson(bucket, key, obj) { objects.set(id(bucket, key), { body: Buffer.from(JSON.stringify(obj)), contentType: 'application/json' }) },
    putBytes(bucket, key, size, contentType = 'application/octet-stream') { objects.set(id(bucket, key), { body: Buffer.alloc(0), size, contentType }) },
    has: (bucket, key) => objects.has(id(bucket, key)),
    getJson: (bucket, key) => JSON.parse(objects.get(id(bucket, key)).body.toString()),
    keys: (bucket, prefix = '') => [...objects.keys()].filter(k => k.startsWith(`${bucket}/${prefix}`)).map(k => k.slice(bucket.length + 1)),
    failNext: (command, error) => failNext.push({ command, error }),
    reset() { objects.clear(); uploads.clear(); failNext.length = 0 },
  }
}

module.exports = { createFakeS3, s3Error }
