/**
 * Thin Lambda client for the synchronous Plan Lambda (spec 00 §6.2).
 *
 * invoke() never throws for function-level errors — it returns
 *   { ok: true, payload }                         success
 *   { ok: false, errorType, errorMessage }        FunctionError (e.g. "StageFailed")
 * and throws for transport/service errors (tagged awsService = 'lambda') or a
 * timeout (err.code = 'LAMBDA_TIMEOUT').
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda')
const { credentials } = require('../config/storage')
const sc = require('../config/smartcrop')

let _client = null
function getClient() {
  // maxAttempts 1: a throttle must surface as 429 PREVIEW_BUSY, not be retried
  // silently past the preview timeout.
  if (!_client) _client = new LambdaClient({ region: sc.region, credentials, maxAttempts: 1 })
  return _client
}

function decode(payload) {
  if (!payload || !payload.length) return null
  const text = Buffer.from(payload).toString('utf-8')
  try { return JSON.parse(text) } catch { return text }
}

async function invoke(functionName, payload, { timeoutMs }) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      const err = new Error(`Lambda invoke timed out after ${timeoutMs}ms`)
      err.code = 'LAMBDA_TIMEOUT'
      reject(err)
    }, timeoutMs)
  })

  const call = Promise.resolve().then(() => getClient().send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify(payload)),
  }), { abortSignal: controller.signal }))

  let out
  try {
    out = await Promise.race([call, timeout])
  } catch (err) {
    if (err?.code === 'LAMBDA_TIMEOUT') throw err
    if (err && typeof err === 'object') err.awsService = 'lambda'
    throw err
  } finally {
    clearTimeout(timer)
  }
  call.catch(() => {}) // the losing promise after a timeout

  const body = decode(out.Payload)
  if (out.FunctionError) {
    return {
      ok: false,
      errorType: body?.errorType || out.FunctionError,
      errorMessage: body?.errorMessage || null,
    }
  }
  return { ok: true, payload: body }
}

module.exports = { getClient, invoke }
