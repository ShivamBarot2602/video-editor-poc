const store = require('../storage/videoStore')
const { buildAss } = require('../lib/assBuilder')

async function exists(id, provider) {
  return store.transcriptionExists(id, provider)
}

// Parsed transcription. REJECTS on parse error (controller surfaces 500).
async function get(id, provider) {
  return store.readTranscription(id, provider)
}

// Built export → { content, contentType, fileName }, built from the saved JSON.
async function resolveExport(id, provider, formatId) {
  return store.resolveSubtitleExport(id, provider, formatId)
}

// Style-parameterized `.ass` export. Unlike `.srt`, `.ass` needs the current
// editor style (colors, font, positioning) so the download matches what would
// be burned. Style JSON comes from the request body (see controllers/transcription).
async function resolveAssExport(id, provider, style) {
  const tx = await store.readTranscription(id, provider)
  return {
    fileName: `transcription_${provider}.ass`,
    ext: 'ass',
    contentType: 'text/plain; charset=utf-8',
    content: buildAss(tx, style),
  }
}

/**
 * Apply speaker-alias and segment-text edits to a stored transcription, persist
 * it, and regenerate every export format. Returns the updated transcription.
 *   - aliases: { [speakerId]: string } — empty value clears the alias
 *   - edits:   { [index]: string | null } — null removes text_edited
 */
async function applyEdits(id, provider, { aliases, edits }) {
  const tx = await store.readTranscription(id, provider)

  if (aliases) {
    const prev = tx?.metadata?.speaker_aliases && typeof tx.metadata.speaker_aliases === 'object'
      ? tx.metadata.speaker_aliases : {}
    const next = { ...prev }
    for (const [speakerId, aliasRaw] of Object.entries(aliases)) {
      const alias = String(aliasRaw ?? '').trim()
      if (!alias) delete next[String(speakerId)]
      else next[String(speakerId)] = alias
    }
    tx.metadata = { ...(tx.metadata || {}), speaker_aliases: next }
  }

  if (edits && Array.isArray(tx.segments)) {
    for (const [idxStr, editedText] of Object.entries(edits)) {
      const idx = parseInt(idxStr, 10)
      if (isNaN(idx) || idx < 0 || idx >= tx.segments.length) continue
      if (editedText == null) {
        delete tx.segments[idx].text_edited
      } else {
        const trimmed = String(editedText).trim()
        if (trimmed) tx.segments[idx].text_edited = trimmed
        else delete tx.segments[idx].text_edited
      }
    }
  }

  await store.writeTranscription(id, provider, tx)
  // Regenerate every export format so downloads reflect the latest edits.
  await store.writeSubtitleExports(id, provider, tx)
  return tx
}

module.exports = { exists, get, resolveExport, resolveAssExport, applyEdits }
