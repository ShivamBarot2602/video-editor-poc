/**
 * Ephemeral scratch space for ffmpeg / provider work. Artifacts live in S3; tools
 * need real local paths, so we materialize into a per-call temp dir, run, then
 * always wipe it. Nothing here is durable — never read state back from it.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { TMP_WORK_DIR } = require('../config/storage')

// Ensure the root scratch dir exists (called once at boot from index.js).
function init() {
  fs.mkdirSync(TMP_WORK_DIR, { recursive: true })
}

// Make a unique scratch subdir (optionally namespaced by videoId for debuggability).
function makeTempDir(label = 'work') {
  const safe = String(label).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'work'
  const dir = path.join(TMP_WORK_DIR, `${safe}-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Run `fn(dir)` with a fresh temp dir, removing it (and everything in it) after,
// success or failure. Returns whatever `fn` returns.
async function withTempDir(label, fn) {
  const dir = makeTempDir(label)
  try {
    return await fn(dir)
  } finally {
    fs.rm(dir, { recursive: true, force: true }, () => {})
  }
}

module.exports = { init, makeTempDir, withTempDir, TMP_WORK_DIR }
