const gemini = require('./gemini')
const openai = require('./openai')

/**
 * Registry of image-gen providers for the polish stage.
 * Order matters for `availableProviders()` — used as the canonical display order.
 */
const REGISTRY = { gemini, openai }

/**
 * Which providers have their API key set in env? Returns provider ids.
 */
function availableProviders() {
  const out = []
  if (process.env.GEMINI_API_KEY) out.push('gemini')
  if (process.env.OPENAI_API_KEY) out.push('openai')
  return out
}

module.exports = { gemini, openai, REGISTRY, availableProviders }
