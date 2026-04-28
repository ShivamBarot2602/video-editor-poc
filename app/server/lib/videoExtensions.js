const DEFAULT_VIDEO_EXTENSION = '.mp4'
const EXTENSION_ALIASES = {
  '.qt': '.mov',
}

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.mpeg',
  '.mpg',
  '.3gp',
  '.flv',
  '.m4v',
])

function normalizeVideoExtension(ext) {
  const lower = (ext || '').toLowerCase()
  const canonical = EXTENSION_ALIASES[lower] || lower
  return SUPPORTED_VIDEO_EXTENSIONS.has(canonical) ? canonical : DEFAULT_VIDEO_EXTENSION
}

module.exports = { normalizeVideoExtension }
