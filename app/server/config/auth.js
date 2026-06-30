// Auth config — single user, credentials sourced from env.
//
// AUTH_USERNAME       — login username
// AUTH_PASSWORD_HASH  — bcrypt hash of the password (generate with
//                       `node scripts/gen-password-hash.js <password>`)
// JWT_SECRET          — secret used to sign/verify session tokens
//
// The plaintext password is never stored on disk — only its bcrypt hash.

const AUTH_USERNAME = process.env.AUTH_USERNAME || ''
const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH || ''
const JWT_SECRET = process.env.JWT_SECRET || ''

// Token lifetime + cookie name in one place.
const TOKEN_TTL = '7d'
const COOKIE_NAME = 'sp_auth'

// In production the SPA and API may live on different domains, so the cookie
// must be SameSite=None + Secure to survive cross-site requests. In dev it's
// same-origin (via the Vite proxy), so Lax is fine and Secure would break http.
const isProd = process.env.NODE_ENV === 'production'
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: isProd ? 'none' : 'lax',
  secure: isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7d, matches TOKEN_TTL
}

// Fail loud at startup if auth is half-configured rather than silently allowing
// access. `configured` lets index.js decide whether to enforce auth at all.
const configured = Boolean(AUTH_USERNAME && AUTH_PASSWORD_HASH && JWT_SECRET)

module.exports = {
  AUTH_USERNAME,
  AUTH_PASSWORD_HASH,
  JWT_SECRET,
  TOKEN_TTL,
  COOKIE_NAME,
  COOKIE_OPTS,
  configured,
}
