const fs = require('fs')
const path = require('path')
const store = require('../storage/videoStore')
const { withTempDir } = require('../lib/tempWork')
const { extractAudio } = require('../lib/ffmpeg')
const providers = require('../providers')
const URL_CAPABLE = require('../providers/urlCapable')
const { splitLongSegments } = require('../providers/utils')

async function videoExists(id) {
  return store.videoExists(id)
}

async function originalExists(id) {
  return store.originalExists(id)
}

function providerExists(provider) {
  return !!providers[provider]
}

/**
 * Run a transcription provider end-to-end inside an ephemeral temp dir: ensure
 * audio.wav exists in S3 (extract once and cache it there if missing — checked
 * unconditionally, regardless of caller — reused by every provider/run after
 * the first), then hand off to the provider.
 *
 * Providers in providers/urlCapable.js accept audio.wav's public S3 URL
 * directly — no local download, no upload of bytes to the provider either;
 * their infra fetches straight from S3. Others still get a local `audioPath`
 * (downloaded here) exactly as before.
 *
 * Persists the normalized result + raw response + export formats to S3.
 * Returns the normalized result. Throws on any failure (controller → 500).
 */
async function run({ id, provider, language }) {
  const urlCapable = URL_CAPABLE.has(provider)

  return withTempDir(`tx-${id}-${provider}`, async (dir) => {
    const audioPath = path.join(dir, 'audio.wav')

    // Extract only if audio.wav isn't already sitting in S3 — a full
    // download-original + ffmpeg + upload-audio round trip is expensive on S3,
    // so this is never skippable-but-forced; existence is the only gate.
    if (await store.audioExists(id)) {
      console.log(`[${id}][${provider}] Using existing audio (cached)`)
    } else {
      console.log(`[${id}][${provider}] Extracting audio…`)
      const orig = await store.downloadOriginal(id, dir)
      await extractAudio(orig, audioPath)
      await store.uploadAudio(id, audioPath)
    }

    // URL-capable providers fetch audio.wav from S3 themselves — skip the local
    // download entirely. Others need it on disk (download unless extraction
    // above already wrote it into `dir`).
    let localAudioPath = null
    let audioUrl = null
    if (urlCapable) {
      audioUrl = store.publicUrlAudio(id)
      console.log(`[${id}][${provider}] Passing public S3 URL directly (no upload)`)
    } else {
      localAudioPath = audioPath
      if (!fs.existsSync(localAudioPath)) await store.downloadAudio(id, dir)
    }

    console.log(`[${id}][${provider}] Running provider…`)
    const result = await providers[provider]({ audioPath: localAudioPath, audioUrl, videoDir: dir, language, videoId: id })

    // Separate raw API response (for debugging) from the normalized result
    const { _raw, ...normalizedResult } = result

    // Backstop against any provider (its own diarization or our fallback
    // grouping) handing back an oversized segment — re-chunk before persisting
    // so the editor/burn always see reasonably-sized subtitle blocks.
    normalizedResult.segments = splitLongSegments(normalizedResult.segments || [])
    if (normalizedResult.metadata) {
      normalizedResult.metadata.segment_count = normalizedResult.segments.length
    }

    // Preserve speaker aliases if a previous transcription exists
    let preservedAliases = null
    if (await store.transcriptionExists(id, provider)) {
      try {
        const prev = await store.readTranscription(id, provider)
        const prevAliases = prev?.metadata?.speaker_aliases
        if (prevAliases && typeof prevAliases === 'object' && !Array.isArray(prevAliases)) {
          preservedAliases = prevAliases
        }
      } catch (_) {
        // ignore parse errors
      }
    }

    if (preservedAliases) {
      normalizedResult.metadata = {
        ...(normalizedResult.metadata || {}),
        speaker_aliases: preservedAliases,
      }
    }

    if (_raw !== undefined) {
      await store.writeRaw(id, provider, _raw)
      console.log(`[${id}] Raw response saved → raw_${provider}.json`)
    }

    await store.writeTranscription(id, provider, normalizedResult)
    console.log(`[${id}][${provider}] Transcription saved`)

    // Persist all registered export formats (e.g. .srt) alongside the JSON.
    await store.writeSubtitleExports(id, provider, normalizedResult)
    console.log(`[${id}][${provider}] Export formats saved`)

    return normalizedResult
  })
}

module.exports = { videoExists, originalExists, providerExists, run }
