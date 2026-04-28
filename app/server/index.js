require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')

const uploadRouter = require('./routes/upload')
const transcribeRouter = require('./routes/transcribe')
const burnRouter = require('./routes/burn')
const { extractThumbnail } = require('./lib/ffmpeg')

const app = express()
const PORT = process.env.PORT || 3001
const VIDEOS_DIR = path.resolve(process.env.VIDEOS_DIR || './videos')

// Ensure videos directory exists
fs.mkdirSync(VIDEOS_DIR, { recursive: true })

app.use(cors())
app.use(express.json())

// Attach VIDEOS_DIR to every request so routes can access it
app.use((req, _res, next) => {
  req.videosDir = VIDEOS_DIR
  next()
})

app.use('/api/upload', uploadRouter)
app.use('/api/transcribe', transcribeRouter)
app.use('/api/burn', burnRouter)

// List all video sessions with metadata
app.get('/api/videos', (req, res) => {
  try {
    if (!fs.existsSync(VIDEOS_DIR)) return res.json([])

    const videos = []
    for (const id of fs.readdirSync(VIDEOS_DIR)) {
      const dir = path.join(VIDEOS_DIR, id)
      if (!fs.statSync(dir).isDirectory()) continue

      const files = fs.readdirSync(dir)
      const originalFile = files.find(f => f.startsWith('original.'))
      if (!originalFile) continue

      // Read persisted meta (filename, size, uploadedAt) written at upload time
      let meta = {}
      const metaPath = path.join(dir, 'meta.json')
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch (_) {}
      }

      const originalStat = fs.statSync(path.join(dir, originalFile))
      const providers = files
        .filter(f => f.startsWith('transcription_') && f.endsWith('.json'))
        .map(f => f.slice('transcription_'.length, -'.json'.length))

      videos.push({
        id,
        filename: meta.filename || originalFile,
        size: meta.size ?? originalStat.size,
        providers,
        hasBurned: files.some(f => f.startsWith('burned.')),
        uploadedAt: meta.uploadedAt || originalStat.mtime.toISOString(),
        thumbnail: `/api/video/${id}/thumbnail`,
      })
    }

    videos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    res.json(videos)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Return a stored transcription for a given video + provider
app.get('/api/transcription/:id/:provider', (req, res) => {
  const file = path.join(VIDEOS_DIR, req.params.id, `transcription_${req.params.provider}.json`)
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Transcription not found' })
  try {
    res.json(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve original video file
app.get('/api/video/:id', (req, res) => {
  const dir = path.join(VIDEOS_DIR, req.params.id)
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Video not found' })

  const files = fs.readdirSync(dir)
  const original = files.find(f => f.startsWith('original.'))
  if (!original) return res.status(404).json({ error: 'Original file missing' })

  res.sendFile(path.join(dir, original))
})

// Serve burned video file
app.get('/api/video/:id/burned', (req, res) => {
  const dir = path.join(VIDEOS_DIR, req.params.id)
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Video not found' })

  const files = fs.readdirSync(dir)
  const burned = files.find(f => f.startsWith('burned.'))
  if (!burned) return res.status(404).json({ error: 'Burned video not ready' })

  res.sendFile(path.join(dir, burned))
})

// Generate and serve thumbnail for a video
app.get('/api/video/:id/thumbnail', async (req, res) => {
  try {
    const dir = path.join(VIDEOS_DIR, req.params.id)
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Video not found' })

    const files = fs.readdirSync(dir)
    const original = files.find(f => f.startsWith('original.'))
    if (!original) return res.status(404).json({ error: 'Original file missing' })

    const thumbnailPath = path.join(dir, 'thumbnail.jpg')
    
    // If thumbnail already exists, serve it
    if (fs.existsSync(thumbnailPath)) {
      return res.sendFile(thumbnailPath)
    }

    // Generate thumbnail from first frame
    const originalPath = path.join(dir, original)
    await extractThumbnail(originalPath, thumbnailPath)
    
    // Serve the newly generated thumbnail
    res.sendFile(thumbnailPath)
  } catch (err) {
    console.error('Thumbnail generation error:', err)
    res.status(500).json({ error: 'Failed to generate thumbnail' })
  }
})

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Videos directory: ${VIDEOS_DIR}`)
})
