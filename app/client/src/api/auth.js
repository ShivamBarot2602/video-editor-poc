// Auth API. All requests send the session cookie (same-origin in dev via the
// Vite proxy, cross-origin in prod via credentials:'include').
const opts = (extra = {}) => ({ credentials: 'include', ...extra })

export async function login(username, password) {
  const res = await fetch('/api/auth/login', opts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }))
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Login failed')
  return data
}

export async function logout() {
  await fetch('/api/auth/logout', opts({ method: 'POST' })).catch(() => {})
}

// Returns { username } when authenticated, null when not logged in (401).
// Throws on any other failure (5xx, dev-proxy 504, network) so the caller can
// distinguish "server unreachable" from "logged out".
export async function me() {
  const res = await fetch('/api/auth/me', opts())
  if (res.status === 401) return null
  if (!res.ok) throw new Error('Server unreachable')
  return res.json().catch(() => null)
}
