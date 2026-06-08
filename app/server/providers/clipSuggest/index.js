const gemini = require('./gemini')
const openai = require('./openai')

/**
 * Registry of LLM providers for the clip-suggestion stage.
 * Order matters for `availableProviders()` — Gemini is the canonical default
 * (long-context, bridges to future video understanding), OpenAI the alternative.
 */
const REGISTRY = { gemini, openai }

/**
 * Which clip-suggest providers have their API key set in env? Returns provider
 * ids, Gemini first (default), then OpenAI.
 */
function availableProviders() {
  const out = []
  if (process.env.GEMINI_API_KEY) out.push('gemini')
  if (process.env.OPENAI_API_KEY) out.push('openai')
  return out
}

module.exports = { gemini, openai, REGISTRY, availableProviders }
