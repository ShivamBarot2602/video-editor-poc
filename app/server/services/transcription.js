const store = require('../storage/videoStore')

function exists(id, provider) {
  return store.transcriptionExists(id, provider)
}

// Parsed transcription. THROWS on parse error (controller surfaces 500).
function get(id, provider) {
  return store.readTranscription(id, provider)
}

// Absolute path to an export format, building it lazily if absent.
function resolveExportPath(id, provider, formatId) {
  return store.resolveSubtitleExport(id, provider, formatId)
}

/**
 * Apply speaker-alias and segment-text edits to a stored transcription, persist
 * it, and regenerate every export format. Returns the updated transcription.
 *   - aliases: { [speakerId]: string } — empty value clears the alias
 *   - edits:   { [index]: string | null } — null removes text_edited
 */
function applyEdits(id, provider, { aliases, edits }) {
  const tx = store.readTranscription(id, provider)

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

  store.writeTranscription(id, provider, tx)
  // Regenerate every export format so downloads reflect the latest edits.
  store.writeSubtitleExports(id, provider, tx)
  return tx
}

module.exports = { exists, get, resolveExportPath, applyEdits }
