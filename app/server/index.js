require('dotenv').config()
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const Sentry = require('@sentry/node')
const store = require('./storage/videoStore')
const { VIDEOS_DIR } = require('./config/paths')

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

const app = express()
const PORT = process.env.PORT || 3001

// Ensure the videos directory exists
store.init()

app.use(cors())
app.use(express.json())

// Log incoming HTTP requests
app.use(morgan('dev'))

app.use('/api/upload', uploadRouter)
app.use('/api/prepare', prepareRouter)
app.use('/api/transcribe', transcribeRouter)
app.use('/api/burn', burnRouter)
app.use('/api/thumbnails', thumbnailsRouter)
app.use('/api/clips', clipsRouter)
app.use('/api/health', healthRouter)
app.use('/api/videos', videosRouter)
app.use('/api/transcription', transcriptionRouter)
app.use('/api/video', mediaRouter)

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
  console.log(`Videos directory: ${VIDEOS_DIR}`)
})
