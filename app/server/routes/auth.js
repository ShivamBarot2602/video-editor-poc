// Auth routes — login / logout / me. Mounted at /api/auth, kept public.
const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const {
  AUTH_USERNAME,
  AUTH_PASSWORD_HASH,
  JWT_SECRET,
  TOKEN_TTL,
  COOKIE_NAME,
  COOKIE_OPTS,
} = require('../config/auth')

const router = express.Router()

// POST /api/auth/login — verify credentials, set httpOnly session cookie.
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' })
  }

  // Always run bcrypt.compare even on username mismatch to keep timing uniform
  // (avoids leaking which usernames exist).
  const userOk = username === AUTH_USERNAME
  const passOk = await bcrypt.compare(password, AUTH_PASSWORD_HASH)
  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'Invalid username or password' })
  }

  const token = jwt.sign({ sub: username }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL,
  })
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS)
  return res.json({ username })
})

// POST /api/auth/logout — clear the session cookie.
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS, maxAge: undefined })
  return res.json({ ok: true })
})

// GET /api/auth/me — report current session (used by client to gate UI).
router.get('/me', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    return res.json({ username: decoded.sub })
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }
})

module.exports = router
