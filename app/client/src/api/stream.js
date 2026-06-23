// Streaming primitives. These WRAP the existing hand-tuned stream handling —
// the buffering and EventSource lifecycle are reproduced exactly; callers keep
// their own event-type switches, refs, teardown, and readyState checks.

// Consume a fetch ReadableStream of `data: {json}` SSE-style lines, invoking
// onEvent(parsed) per complete line. A throw from onEvent propagates out (so the
// caller's surrounding try/catch still handles an in-band `error` event).
export async function readJsonLines(response, onEvent) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      onEvent(JSON.parse(line.slice(5).trim()))
    }
  }
}

// Open an SSE EventSource and return the RAW handle — the caller owns all
// teardown (close, refs, readyState checks). onMessage receives the parsed event
// object; malformed `data:` lines are skipped. onError is attached only if given.
export function openEventStream(url, { onMessage, onError } = {}) {
  const es = new EventSource(url)
  es.onmessage = (msg) => {
    let ev
    try { ev = JSON.parse(msg.data) } catch { return }
    onMessage?.(ev)
  }
  if (onError) es.onerror = onError
  return es
}
