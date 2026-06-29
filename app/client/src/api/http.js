// Thin fetch wrappers shared by the resource modules. Each preserves the exact
// behavior of the call sites it replaces — note the variants below.

const jsonHeaders = { 'Content-Type': 'application/json' }

// GET → parsed JSON, no ok-check (the caller's own try/catch handles failures,
// matching the `fetch(url).then(r => r.json())` sites).
export const getJson = (url) => fetch(url).then((r) => r.json())

// GET → parsed JSON when ok, else `fallback` (matches `r.ok ? r.json() : <fallback>`).
export const getJsonOrNull = (url, fallback = null) =>
  fetch(url).then((r) => (r.ok ? r.json() : fallback))

// Write JSON → parsed data; throws Error(data.error || fallbackMsg) on !ok.
async function sendJson(method, url, body, fallbackMsg) {
  const res = await fetch(url, { method, headers: jsonHeaders, body: JSON.stringify(body) })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || fallbackMsg)
  }
  return res.json()
}

export const postJson = (url, body, fallbackMsg) => sendJson('POST', url, body, fallbackMsg)
export const patchJson = (url, body, fallbackMsg) => sendJson('PATCH', url, body, fallbackMsg)

export async function del(url, fallbackMsg) {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || fallbackMsg)
  }
  return res.json()
}

// POST returning the raw Response — for endpoints whose callers branch on
// res.ok / res.status / stream the body themselves.
export const postRaw = (url, body) =>
  fetch(url, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) })
