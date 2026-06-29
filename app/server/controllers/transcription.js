const { getFormat } = require('../lib/subtitleFormats')
const txService = require('../services/transcription')

// GET /api/transcription/:id/:provider
function get(req, res) {
  const { id, provider } = req.params
  if (!txService.exists(id, provider)) return res.status(404).json({ error: 'Transcription not found' })
  try {
    res.json(txService.get(id, provider))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * PATCH /api/transcription/:id/:provider
 * Body: { speaker_aliases?: { [speakerId]: string }, segment_edits?: { [index]: string | null } }
 */
function patch(req, res) {
  const { id, provider } = req.params
  if (!txService.exists(id, provider)) return res.status(404).json({ error: 'Transcription not found' })

  const body = req.body || {}
  const incomingAliases = body.speaker_aliases
  const incomingEdits = body.segment_edits

  const hasAliases = incomingAliases && typeof incomingAliases === 'object' && !Array.isArray(incomingAliases)
  const hasEdits = incomingEdits && typeof incomingEdits === 'object' && !Array.isArray(incomingEdits)

  if (!hasAliases && !hasEdits) {
    return res.status(400).json({ error: 'speaker_aliases or segment_edits required' })
  }

  try {
    const tx = txService.applyEdits(id, provider, {
      aliases: hasAliases ? incomingAliases : null,
      edits: hasEdits ? incomingEdits : null,
    })
    res.json(tx)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/transcription/:id/:provider/:format — streams an export as a download,
// building it lazily from the saved JSON if it doesn't exist yet (older sessions).
function download(req, res) {
  const { id, provider, format } = req.params
  const fmt = getFormat(format)
  if (!fmt) return res.status(404).json({ error: `Unknown export format: ${format}` })
  if (!txService.exists(id, provider)) return res.status(404).json({ error: 'Transcription not found' })

  try {
    const filePath = txService.resolveExportPath(id, provider, format)
    res.setHeader('Content-Type', fmt.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="transcription_${provider}.${fmt.ext}"`)
    res.sendFile(filePath)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { get, patch, download }
