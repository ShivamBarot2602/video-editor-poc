// requireAuth — gate that rejects requests without a valid session cookie.
const jwt = require('jsonwebtoken')
const { JWT_SECRET, COOKIE_NAME, configured } = require('../config/auth')

function requireAuth(req, res, next) {
  // If auth isn't configured, the server already refused to start (see index.js),
  // so reaching here means it's enforced.
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }
}

module.exports = { requireAuth, authConfigured: configured }
