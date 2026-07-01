/**
 * Providers whose API accepts a public audio URL directly instead of an
 * uploaded file. For these, services/transcribe.js skips downloading audio.wav
 * out of S3 and passes its public URL straight through — no bytes touch our
 * server or the provider's upload endpoint, the provider fetches from S3 itself.
 *
 * Confirmed against each provider's current docs (param name in parens):
 *   assemblyai (audio), deepgram (transcribeUrl), gladia (audio_url),
 *   speechmatics (fetch_data.url), revai (source_config.url),
 *   pyannote (url), mistral (file_url), elevenlabs (source_url),
 *   sonix (file_url), groq (url), xai (url)
 *
 * NOT capable (file upload only, per their docs — do not add without re-checking):
 *   openai, sarvam
 */
module.exports = new Set([
  'assemblyai', 'deepgram', 'gladia', 'speechmatics', 'revai',
  'pyannote', 'mistral', 'elevenlabs', 'sonix', 'groq', 'xai',
])
