const store = require('../storage/videoStore')
const { extractAudio } = require('../lib/ffmpeg')
const providers = require('../providers')

function videoExists(id) {
  return store.videoExists(id)
}

function originalExists(id) {
  return !!store.findOriginalPath(id)
}

function providerExists(provider) {
  return !!providers[provider]
}

/**
 * Run a transcription provider end-to-end: extract audio (unless prepared),
 * call the provider, preserve any prior speaker aliases, and persist the
 * normalized result + raw response + export formats. Returns the normalized
 * result. Throws on any failure (controller surfaces 500).
 */
async function run({ id, provider, language, skipExtract }) {
  const originalPath = store.findOriginalPath(id)
  const audioPath = store.audioPath(id)

  // Skip extraction when the caller already ran /api/prepare (parallel runs),
  // otherwise extract fresh (single-provider calls from the editor).
  if (skipExtract && store.audioExists(id)) {
    console.log(`[${id}][${provider}] Skipping audio extraction (prepared)`)
  } else {
    console.log(`[${id}][${provider}] Extracting audio…`)
    await extractAudio(originalPath, audioPath)
  }

  // Run transcription
  console.log(`[${id}][${provider}] Running provider…`)
  const result = await providers[provider]({ audioPath, videoDir: store.videoDir(id), language, videoId: id })

  // Separate raw API response (for debugging) from the normalized result
  const { _raw, ...normalizedResult } = result

  // Preserve speaker aliases if a previous transcription exists
  let preservedAliases = null
  if (store.transcriptionExists(id, provider)) {
    try {
      const prev = store.readTranscription(id, provider)
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
    store.writeRaw(id, provider, _raw)
    console.log(`[${id}] Raw response saved → raw_${provider}.json`)
  }

  store.writeTranscription(id, provider, normalizedResult)
  console.log(`[${id}][${provider}] Transcription saved`)

  // Persist all registered export formats (e.g. .srt) next to the JSON.
  store.writeSubtitleExports(id, provider, normalizedResult)
  console.log(`[${id}][${provider}] Export formats saved`)

  return normalizedResult
}

module.exports = { videoExists, originalExists, providerExists, run }
