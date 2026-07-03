import { rewrite, next } from '@vercel/functions'

// Vercel Routing Middleware — runs at the edge in front of the deployed site.
//
// Routes /api/* to the backend named by the BACKEND_URL environment variable,
// which Vercel scopes per environment (Production / Preview / per-branch).
// This is what lets a PR's preview deployment talk to its matching Render
// preview backend instead of production: vercel.json rewrites are static and
// can't read env vars, so the dynamic hop has to happen here.
//
// When BACKEND_URL is unset the middleware falls through (next()) to the
// static /api rewrite in vercel.json — production behavior is unchanged.
//
// Traffic stays same-origin for the browser in every case (cookies, SSE and
// <video> requests need no CORS handling).
export const config = { matcher: '/api/:path*' }

export default function middleware(request) {
  const backend = process.env.BACKEND_URL
  if (!backend) return next()

  const url = new URL(request.url)
  return rewrite(new URL(url.pathname + url.search, backend))
}
