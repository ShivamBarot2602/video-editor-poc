require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const morgan = require('morgan')
const Sentry = require('@sentry/node')
const store = require('./storage/videoStore')
const tempWork = require('./lib/tempWork')
const storageConfig = require('./config/storage')

// Initialize Sentry (if DSN is configured)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  })
}

const uploadRouter = require('./routes/upload')
const transcribeRouter = require('./routes/transcribe')
const prepareRouter = require('./routes/prepare')
const burnRouter = require('./routes/burn')
const thumbnailsRouter = require('./routes/thumbnails')
const clipsRouter = require('./routes/clips')
const healthRouter = require('./routes/health')
const videosRouter = require('./routes/videos')
const transcriptionRouter = require('./routes/transcription')
const mediaRouter = require('./routes/media')
const authRouter = require('./routes/auth')
const { requireAuth, authConfigured } = require('./middleware/auth')

const app = express()
const PORT = process.env.PORT || 3001

// Refuse to start half-configured — a public deployment with no auth is the
// exact failure mode this feature exists to prevent.
if (!authConfigured) {
  console.error(
    'FATAL: auth not configured. Set AUTH_USERNAME, AUTH_PASSWORD_HASH, JWT_SECRET in .env.\n' +
    "Generate a hash with: node scripts/gen-password-hash.js '<password>'"
  )
  process.exit(1)
}

// Refuse to start without S3 storage configured — there is no local-disk fallback.
if (!storageConfig.configured) {
  console.error(
    'FATAL: S3 storage not configured. Set AWS_REGION and S3_BUCKET in .env.\n' +
    '(Set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY for local dev, or rely on an IAM role.)'
  )
  process.exit(1)
}

// S3 is the durable store; create the local ephemeral scratch dir for ffmpeg work.
store.init()
tempWork.init()

// Credentialed CORS so the SPA can send the session cookie cross-origin in prod.
// `origin: true` reflects the request origin (POC has no fixed client domain).
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Log incoming HTTP requests
app.use(morgan('dev'))

// Public routes — auth (login/logout/me) and health checks stay open.
app.use('/api/auth', authRouter)
app.use('/api/health', healthRouter)

// Everything below requires a valid session.
app.use('/api', requireAuth)

app.use('/api/upload', uploadRouter)
app.use('/api/prepare', prepareRouter)
app.use('/api/transcribe', transcribeRouter)
app.use('/api/burn', burnRouter)
app.use('/api/thumbnails', thumbnailsRouter)
app.use('/api/clips', clipsRouter)
app.use('/api/videos', videosRouter)
app.use('/api/transcription', transcriptionRouter)
app.use('/api/video', mediaRouter)

// JSON 404 for unknown API routes (instead of Express's default HTML page).
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Sentry error handler (must be after all routes, before other error handlers)
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app)
}

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Storage: s3://${storageConfig.S3_BUCKET}/${storageConfig.S3_KEY_PREFIX} (region ${storageConfig.AWS_REGION})`)
  console.log(`Scratch dir: ${storageConfig.TMP_WORK_DIR}`)
})
