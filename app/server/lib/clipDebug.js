const fs = require('fs')

/**
 * Write a single, human-readable debug log of the last clip-suggest run for a
 * provider: the exact prompts sent and the raw model response. Overwrites on
 * every run (we only track the latest, not history).
 *
 * Best-effort — never throws into the suggest flow.
 *
 * @param {string} debugPath - file to (over)write, or falsy to skip
 * @param {object} info
 * @param {string} info.provider
 * @param {string} [info.model]
 * @param {string} [info.system]      - system prompt sent
 * @param {string} [info.user]        - user prompt sent (constraints + transcript)
 * @param {*}      [info.raw]         - full provider response body (object or string); object is pretty-printed
 * @param {string} [info.error]       - error summary, if the run failed
 */
function writeClipDebug(debugPath, { provider, model, system, user, raw, error } = {}) {
  if (!debugPath) return
  try {
    const rawText = raw == null
      ? '(none)'
      : typeof raw === 'string'
        ? raw
        : (() => { try { return JSON.stringify(raw, null, 2) } catch (_) { return String(raw) } })()
    const out = [
      '=== CLIP SUGGEST DEBUG (latest run, overwritten each time) ===',
      `time: ${new Date().toISOString()}`,
      `provider: ${provider || '-'}   model: ${model || '-'}`,
      `status: ${error ? `ERROR — ${error}` : 'ok'}`,
      '',
      '=== SYSTEM PROMPT ===',
      system || '(none)',
      '',
      '=== USER PROMPT ===',
      user || '(none)',
      '',
      '=== RAW RESPONSE (full response.data) ===',
      rawText,
      '',
    ].join('\n')
    fs.writeFileSync(debugPath, out, 'utf8')
  } catch (_) {
    // logging must never break the suggest flow
  }
}

module.exports = { writeClipDebug }
