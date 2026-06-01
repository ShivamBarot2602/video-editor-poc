const sharp = require('sharp')

/**
 * Lightweight CV stage for thumbnail candidates. Pure Node + sharp.
 *
 * Per-frame signals:
 *   - meanY        : mean luma (0..255). Reject if too dark / too bright.
 *   - stdY         : luma stddev. Proxy for "interesting content" (blur proxy).
 *   - clipFrac     : fraction of pixels in extreme bins (0..10 or 245..255).
 *   - aHash        : 64-bit average hash for near-dup detection.
 *
 * Score = normalized weighted sum:
 *   - 0.7 * (stdY / 90)              (cap at 1.0)
 *   - 0.3 * (1 - 2 * |meanY/255 - 0.5|)   (peak near mid-grey, falls off at extremes)
 *   - -0.5 if clipFrac > 0.4         (penalty for blown/black frames)
 */

const TARGET_W = 64 // downscale for cheap stats
const TARGET_H = 64

async function computeFrameStats(framePath) {
  // Resize → raw grayscale buffer. 64x64 = 4096 luma bytes.
  const { data } = await sharp(framePath)
    .resize(TARGET_W, TARGET_H, { fit: 'cover' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const n = data.length
  let sum = 0
  let clip = 0
  for (let i = 0; i < n; i++) {
    const y = data[i]
    sum += y
    if (y < 10 || y > 245) clip++
  }
  const meanY = sum / n

  let sqSum = 0
  for (let i = 0; i < n; i++) {
    const d = data[i] - meanY
    sqSum += d * d
  }
  const stdY = Math.sqrt(sqSum / n)
  const clipFrac = clip / n

  // 8x8 average hash for dedup.
  // Re-resize the grayscale buffer to 8x8 using sharp.
  const hashBuf = await sharp(data, { raw: { width: TARGET_W, height: TARGET_H, channels: 1 } })
    .resize(8, 8, { fit: 'fill' })
    .raw()
    .toBuffer()
  let hashMean = 0
  for (let i = 0; i < 64; i++) hashMean += hashBuf[i]
  hashMean /= 64
  let aHash = 0n
  for (let i = 0; i < 64; i++) {
    if (hashBuf[i] >= hashMean) aHash |= 1n << BigInt(i)
  }

  return { meanY, stdY, clipFrac, aHash: aHash.toString(16).padStart(16, '0') }
}

function scoreFromStats({ meanY, stdY, clipFrac }) {
  const stdComponent = Math.min(1, stdY / 90)
  const midComponent = 1 - Math.min(1, 2 * Math.abs(meanY / 255 - 0.5))
  let score = 0.7 * stdComponent + 0.3 * midComponent
  if (clipFrac > 0.4) score -= 0.5
  return score
}

function hammingHex(a, b) {
  // Both are 16-char hex strings of a 64-bit hash.
  let dist = 0
  for (let i = 0; i < 16; i++) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (xor) { dist += xor & 1; xor >>= 1 }
  }
  return dist
}

/**
 * Score all frames in `frames` ([{idx, t, path, ...}]).
 * Returns sorted by score desc, with stats attached.
 */
async function scoreFrames(frames) {
  const scored = []
  for (const f of frames) {
    try {
      const stats = await computeFrameStats(f.path)
      scored.push({ ...f, ...stats, cvScore: scoreFromStats(stats) })
    } catch (e) {
      // Skip unreadable frames silently.
      console.warn(`[frameScoring] skip ${f.path}: ${e.message}`)
    }
  }
  scored.sort((a, b) => b.cvScore - a.cvScore)
  return scored
}

/**
 * Drop near-duplicate frames by Hamming distance on the average hash.
 * Iterates sorted-by-score so we keep the best of each visual cluster.
 */
function dedupByHash(scored, hammingThreshold = 8) {
  const kept = []
  for (const f of scored) {
    const dup = kept.find(k => hammingHex(k.aHash, f.aHash) <= hammingThreshold)
    if (!dup) kept.push(f)
  }
  return kept
}

module.exports = { scoreFrames, dedupByHash, computeFrameStats, scoreFromStats, hammingHex }
