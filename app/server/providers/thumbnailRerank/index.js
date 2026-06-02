const gemini = require('./gemini')
const openai = require('./openai')

/**
 * Registry of vision providers for the rerank stage.
 * Order matters for `availableProviders()` — Gemini is the canonical default,
 * OpenAI is the alternative / fallback.
 */
const REGISTRY = { gemini, openai }

/**
 * Which rerankers have their API key set in env? Returns provider ids,
 * Gemini first (default), then OpenAI.
 */
function availableProviders() {
  const out = []
  if (process.env.GEMINI_API_KEY) out.push('gemini')
  if (process.env.OPENAI_API_KEY) out.push('openai')
  return out
}

module.exports = { gemini, openai, REGISTRY, availableProviders }
