const path = require('path')
const store = require('../storage/videoStore')
const { withTempDir } = require('../lib/tempWork')
const { extractAudio } = require('../lib/ffmpeg')
const providers = require('../providers')

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
 * audio.wav is available locally (download a prepared one, or extract fresh and
 * cache it to S3), call the provider with temp paths, preserve any prior speaker
 * aliases, and persist the normalized result + raw response + export formats to
 * S3. Returns the normalized result. Throws on any failure (controller → 500).
 */
async function run({ id, provider, language, skipExtract }) {
  return withTempDir(`tx-${id}-${provider}`, async (dir) => {
    const audioPath = path.join(dir, 'audio.wav')

    // Use a prepared audio.wav when the caller ran /api/prepare; otherwise
    // extract fresh from the original and cache it back to S3.
    if (skipExtract && await store.audioExists(id)) {
      console.log(`[${id}][${provider}] Using prepared audio`)
      await store.downloadAudio(id, dir)
    } else {
      console.log(`[${id}][${provider}] Extracting audio…`)
      const orig = await store.downloadOriginal(id, dir)
      await extractAudio(orig, audioPath)
      await store.uploadAudio(id, audioPath)
    }

    // Run transcription (provider works on temp paths; openai/groq write
    // audio_compressed.mp3 into `dir`).
    console.log(`[${id}][${provider}] Running provider…`)
    const result = await providers[provider]({ audioPath, videoDir: dir, language, videoId: id })

    // Separate raw API response (for debugging) from the normalized result
    const { _raw, ...normalizedResult } = result

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
