#!/usr/bin/env node
/**
 * SmartCrop end-to-end check against a running server + real AWS (spec 00 §9, 04 §6):
 *   upload → poll READY → editor → save edit → preview → render → poll → download
 * and prints a timing per step.
 *
 * Usage (from app/server, server running with SMARTCROP_ENABLED=true):
 *   E2E_PASSWORD='<login password>' node scripts/smartcrop-e2e.js <video.mp4> [options]
 *
 * Options:
 *   --base <url>          API origin (default http://localhost:3001)
 *   --aspect <a>          edit aspect for the render (default 9:16)
 *   --layout <l>          edit default layout (default fill)
 *   --project <prj_…>     skip the upload; reuse a READY project (04 §6 check 2)
 *   --cancel              cancel the render once it reaches ENCODING (04 §5 check)
 *   --out <file>          where to save the MP4 (default ./smartcrop-e2e-<renderId>.mp4)
 *
 * Login: E2E_USERNAME (default AUTH_USERNAME from .env) + E2E_PASSWORD.
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const flag = (name) => args.includes(`--${name}`)
const videoPath = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'))

const BASE = (opt('base', 'http://localhost:3001')).replace(/\/+$/, '')
const API = `${BASE}/api/smartcrop`
const ASPECT = opt('aspect', '9:16')
const LAYOUT = opt('layout', 'fill')
const REUSE = opt('project', null)
const CANCEL = flag('cancel')

const CONTENT_TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' }
const PARALLEL_PARTS = 4

let cookie = ''
const t0 = Date.now()
const timings = []
const sec = (ms) => `${(ms / 1000).toFixed(1)}s`
async function step(name, fn) {
  const start = Date.now()
  process.stdout.write(`→ ${name} … `)
  const out = await fn()
  const ms = Date.now() - start
  timings.push([name, ms])
  console.log(`done (${sec(ms)})`)
  return out
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function call(method, url, body, { expect = [200] } = {}) {
  const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  if (!expect.includes(res.status)) {
    throw new Error(`${method} ${url} → ${res.status} ${typeof json === 'string' ? json : JSON.stringify(json)}`)
  }
  return { status: res.status, body: json, headers: res.headers }
}

async function login() {
  const username = process.env.E2E_USERNAME || process.env.AUTH_USERNAME
  const password = process.env.E2E_PASSWORD
  if (!username || !password) throw new Error('Set E2E_PASSWORD (and E2E_USERNAME if it differs from AUTH_USERNAME).')
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  })
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`)
  cookie = (res.headers.get('set-cookie') || '').split(';')[0]
}

async function putPart(url, buf, attempt = 1) {
  const res = await fetch(url, { method: 'PUT', body: buf })
  if (res.ok) return res.headers.get('etag')
  if (attempt < 3) return putPart(url, buf, attempt + 1)
  throw new Error(`part PUT failed: ${res.status} ${await res.text()}`)
}

async function upload(file) {
  const stat = fs.statSync(file)
  const ext = path.extname(file).toLowerCase()
  const contentType = CONTENT_TYPES[ext]
  if (!contentType) throw new Error(`unsupported extension ${ext}`)

  const { body } = await call('POST', '/uploads', {
    fileName: path.basename(file), contentType, sizeBytes: stat.size, initialAspect: '9:16', initialLayout: 'fill',
  }, { expect: [201] })
  const p = body.project.projectId
  const { partSizeBytes, parts } = body.upload
  console.log(`\n  project ${p}: ${parts.length} part(s) of ${(partSizeBytes / 1048576).toFixed(0)} MiB`)

  const fd = fs.openSync(file, 'r')
  const done = []
  try {
    for (let i = 0; i < parts.length; i += PARALLEL_PARTS) {
      const batch = parts.slice(i, i + PARALLEL_PARTS)
      done.push(...await Promise.all(batch.map(async ({ partNumber, url }) => {
        const start = (partNumber - 1) * partSizeBytes
        const len = Math.min(partSizeBytes, stat.size - start)
        const buf = Buffer.alloc(len)
        fs.readSync(fd, buf, 0, len, start)
        return { partNumber, etag: await putPart(url, buf) }
      })))
    }
  } finally {
    fs.closeSync(fd)
  }
  const res = await call('POST', `/uploads/${p}/complete`, { parts: done })
  const s = res.body.project.source
  console.log(`  probed: ${s.width}×${s.height} ${s.fps} fps, ${sec(s.durationMs)}, audio=${s.hasAudio}, ${s.videoCodec}`)
  return p
}

async function pollProject(p) {
  let last = ''
  for (;;) {
    const { body } = await call('GET', `/projects/${p}`)
    const pr = body.project
    const line = `${pr.status}${pr.processing?.stage ? `/${pr.processing.stage}` : ''}`
    if (line !== last) { process.stdout.write(`\n  ${sec(Date.now() - t0)} ${line}`); last = line }
    if (pr.status === 'READY') { process.stdout.write('\n'); return pr }
    if (pr.status !== 'PROCESSING') throw new Error(`processing ended ${pr.status}: ${JSON.stringify(pr.processing?.error)}`)
    await sleep(3000)
  }
}

async function pollRender(p, r) {
  let last = ''
  let cancelled = false
  for (;;) {
    const { body } = await call('GET', `/projects/${p}/renders/${r}`)
    const rd = body.render
    const line = `${rd.status}${rd.stage ? `/${rd.stage}` : ''}`
    if (line !== last) { process.stdout.write(`\n  ${sec(Date.now() - t0)} ${line}`); last = line }
    if (CANCEL && !cancelled && rd.stage === 'ENCODING') {
      cancelled = true
      const c = await call('POST', `/projects/${p}/renders/${r}/cancel`, {}, { expect: [200, 409] })
      process.stdout.write(`\n  cancel → ${c.status} ${c.body.render?.status || c.body.error?.code}`)
    }
    if (!['QUEUED', 'RENDERING'].includes(rd.status)) { process.stdout.write('\n'); return rd }
    await sleep(5000)
  }
}

async function main() {
  if (!videoPath && !REUSE) {
    console.error('usage: node scripts/smartcrop-e2e.js <video> [--aspect 9:16] [--layout fill] [--project prj_…] [--cancel]')
    process.exit(2)
  }
  await step('login', login)
  const p = REUSE || await step('upload + complete', () => upload(videoPath))
  const project = await step('processing → READY', () => pollProject(p))
  const editor = await step('editor', async () => (await call('GET', `/projects/${p}/editor`)).body)
  console.log(`  features: ${JSON.stringify(editor.capabilities.features)}; snap points: ${editor.analysis.snapPointsMs.length}; people: ${editor.analysis.peopleCount}`)

  const document = {
    schemaVersion: 1, aspect: ASPECT, defaultLayout: LAYOUT, options: { background: 'blur', fallbackLayout: 'fill' },
    clips: [{ id: 'c_1', sourceStartMs: 0, sourceEndMs: project.source.durationMs, layout: null }],
  }
  const saved = await step('save edit', async () => (await call('PUT', `/projects/${p}/edit`, { document })).body)
  console.log(`  edit v${saved.version} (changed: ${saved.changed})`)

  const pv = await step('preview-plan', async () => (await call('POST', `/projects/${p}/preview-plan`, { editVersion: saved.version })).body)
  console.log(`  preview ${pv.previewId} cached=${pv.cached} canvas=${pv.canvas?.width}×${pv.canvas?.height} frames=${pv.frames} warnings=${pv.warnings.length}`)
  const pv2 = await step('preview-plan (again → cache)', async () => (await call('POST', `/projects/${p}/preview-plan`, { editVersion: saved.version })).body)
  if (!pv2.cached) console.warn('  ! second preview was not cached')

  const created = await step('render (Save)', async () => (await call('POST', `/projects/${p}/renders`, { editVersion: saved.version }, { expect: [202] })).body.render)
  const r = created.renderId
  const finished = await step('render → finished', () => pollRender(p, r))
  if (finished.status !== 'SUCCEEDED') {
    console.log(`render ended ${finished.status} ${JSON.stringify(finished.error)}`)
    if (!(CANCEL && finished.status === 'CANCELLED')) process.exitCode = 1
  } else {
    const out = opt('out', path.resolve(`smartcrop-e2e-${r}.mp4`))
    await step('download', async () => {
      const redirect = await call('GET', `/projects/${p}/renders/${r}/download`, null, { expect: [302] })
      const res = await fetch(redirect.headers.get('location'))
      if (!res.ok) throw new Error(`download ${res.status}`)
      fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()))
    })
    const size = fs.statSync(out).size
    console.log(`  saved ${out} (${(size / 1048576).toFixed(1)} MiB, ${finished.output.width}×${finished.output.height}, expected ${sec(finished.outputDurationMs)})`)
    if (size !== finished.output.sizeBytes) { console.error('  ! size mismatch'); process.exitCode = 1 }
  }

  console.log('\nTimings:')
  for (const [name, ms] of timings) console.log(`  ${name.padEnd(30)} ${sec(ms)}`)
  console.log(`  ${'total'.padEnd(30)} ${sec(Date.now() - t0)}`)
  console.log(`\nproject ${p} · render ${r}`)
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`)
  process.exit(1)
})
