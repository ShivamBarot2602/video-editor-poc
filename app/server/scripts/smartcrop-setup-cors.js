#!/usr/bin/env node
/**
 * Put the CORS rule from spec 00 §4 on the three SmartCrop buckets, so the
 * browser can upload parts straight to IN and play/fetch from JOBS and OUT:
 *   origins = CORS_ORIGINS (default http://localhost:5173), methods GET/HEAD/PUT,
 *   headers *, expose ETag, Content-Length, Content-Range, Accept-Ranges.
 *
 * Dry run by default: prints each bucket's current and new rules.
 *
 * Usage (from app/server):
 *   node scripts/smartcrop-setup-cors.js            # show what would change
 *   node scripts/smartcrop-setup-cors.js --apply    # write it
 *
 * PutBucketCors replaces a bucket's whole CORS config, so a bucket that already
 * has *different* rules is skipped unless --force is passed too.
 * Reads AWS_REGION / AWS credentials / SMARTCROP_*_BUCKET / CORS_ORIGINS from .env.
 */

require('dotenv').config()
const { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3')

const apply = process.argv.includes('--apply')
const force = process.argv.includes('--force')

const region = process.env.AWS_REGION
const buckets = ['SMARTCROP_IN_BUCKET', 'SMARTCROP_JOBS_BUCKET', 'SMARTCROP_OUT_BUCKET']
  .map((name) => process.env[name])
if (!region || buckets.some((b) => !b)) {
  console.error('AWS_REGION and SMARTCROP_IN_BUCKET / _JOBS_BUCKET / _OUT_BUCKET are required')
  process.exit(1)
}

const credentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
  : undefined
const client = new S3Client({ region, credentials })

const origins = String(process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean)

const RULES = [{
  AllowedOrigins: origins,
  AllowedMethods: ['GET', 'HEAD', 'PUT'],
  AllowedHeaders: ['*'],
  ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range', 'Accept-Ranges'],
  MaxAgeSeconds: 3600,
}]

async function currentRules(Bucket) {
  try {
    const { CORSRules } = await client.send(new GetBucketCorsCommand({ Bucket }))
    return CORSRules || []
  } catch (err) {
    if (err.name === 'NoSuchCORSConfiguration') return []
    throw err
  }
}

// Order-insensitive comparison of the fields we set.
const normalise = (rules) => JSON.stringify(rules.map((r) => ({
  AllowedOrigins: [...(r.AllowedOrigins || [])].sort(),
  AllowedMethods: [...(r.AllowedMethods || [])].sort(),
  AllowedHeaders: [...(r.AllowedHeaders || [])].sort(),
  ExposeHeaders: [...(r.ExposeHeaders || [])].sort(),
  MaxAgeSeconds: r.MaxAgeSeconds ?? null,
})))

async function main() {
  console.log(`Origins: ${origins.join(', ')}${apply ? '' : '   (dry run — pass --apply to write)'}\n`)
  let failed = false

  for (const Bucket of buckets) {
    const existing = await currentRules(Bucket)
    if (normalise(existing) === normalise(RULES)) {
      console.log(`✓ ${Bucket}: already up to date`)
      continue
    }
    if (existing.length && !force) {
      console.log(`! ${Bucket}: has different CORS rules — skipped (re-run with --force to replace):`)
      console.log(JSON.stringify(existing, null, 2))
      failed = true
      continue
    }
    if (!apply) {
      console.log(`• ${Bucket}: would set CORS (currently ${existing.length ? 'different rules' : 'none'})`)
      continue
    }
    await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: RULES } }))
    console.log(`✓ ${Bucket}: CORS set`)
  }

  if (!apply) console.log(`\nRules:\n${JSON.stringify(RULES, null, 2)}`)
  if (failed) process.exitCode = 1
}

main().catch((err) => {
  console.error(`Failed: ${err.name}: ${err.message}`)
  process.exit(1)
})
