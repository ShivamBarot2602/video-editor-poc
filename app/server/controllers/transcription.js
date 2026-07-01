const { getFormat } = require('../lib/subtitleFormats')
const txService = require('../services/transcription')

// GET /api/transcription/:id/:provider
async function get(req, res) {
  const { id, provider } = req.params
  if (!await txService.exists(id, provider)) return res.status(404).json({ error: 'Transcription not found' })
  try {
    res.json(await txService.get(id, provider))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * PATCH /api/transcription/:id/:provider
 * Body: { speaker_aliases?: { [speakerId]: string }, segment_edits?: { [index]: string | null } }
 */
async function patch(req, res) {
  const { id, provider } = req.params
  if (!await txService.exists(id, provider)) return res.status(404).json({ error: 'Transcription not found' })

  const body = req.body || {}
  const incomingAliases = body.speaker_aliases
  const incomingEdits = body.segment_edits

  const hasAliases = incomingAliases && typeof incomingAliases === 'object' && !Array.isArray(incomingAliases)
  const hasEdits = incomingEdits && typeof incomingEdits === 'object' && !Array.isArray(incomingEdits)

  if (!hasAliases && !hasEdits) {
    return res.status(400).json({ error: 'speaker_aliases or segment_edits required' })
  }

  try {
    const tx = await txService.applyEdits(id, provider, {
      aliases: hasAliases ? incomingAliases : null,
      edits: hasEdits ? incomingEdits : null,
    })
    res.json(tx)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/transcription/:id/:provider/:format — sends an export as a download,
// built on the fly from the saved transcription JSON (subtitle text is tiny).
async function download(req, res) {
  const { id, provider, format } = req.params
  const fmt = getFormat(format)
  if (!fmt) return res.status(404).json({ error: `Unknown export format: ${format}` })
  if (!await txService.exists(id, provider)) return res.status(404).json({ error: 'Transcription not found' })

  try {
    const exp = await txService.resolveExport(id, provider, format)
    res.setHeader('Content-Type', exp.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${exp.fileName}"`)
    res.send(exp.content)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { get, patch, download }
