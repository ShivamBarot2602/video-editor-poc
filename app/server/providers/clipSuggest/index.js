const gemini = require('./gemini')
const openai = require('./openai')
const geminiVideo = require('./geminiVideo')

/**
 * Registry of LLM providers for the transcript-based clip-suggestion method.
 * Order matters for `availableProviders()` — Gemini is the canonical default
 * (long-context), OpenAI the alternative.
 */
const REGISTRY = { gemini, openai }

/**
 * Which transcript-method clip-suggest providers have their API key set? Returns
 * provider ids, Gemini first (default), then OpenAI.
 */
function availableProviders() {
  const out = []
  if (process.env.GEMINI_API_KEY) out.push('gemini')
  if (process.env.OPENAI_API_KEY) out.push('openai')
  return out
}

/**
 * The video-understanding method (watch the raw video) is Gemini-only and needs
 * a billing-enabled key (Files API + video tokens).
 */
function videoMethodAvailable() {
  return !!process.env.GEMINI_API_KEY
}

module.exports = { gemini, openai, geminiVideo, REGISTRY, availableProviders, videoMethodAvailable }
