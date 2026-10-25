/**
 * Thin Step Functions client for smartcrop (spec 00 §6.1, §6.3). Failures are
 * tagged awsService = 'stepfunctions'.
 */

const {
  SFNClient,
  StartExecutionCommand,
  DescribeExecutionCommand,
  GetExecutionHistoryCommand,
  StopExecutionCommand,
} = require('@aws-sdk/client-sfn')
const { credentials } = require('../config/storage')
const sc = require('../config/smartcrop')

let _client = null
function getClient() {
  if (!_client) _client = new SFNClient({ region: sc.region, credentials })
  return _client
}

async function send(cmd) {
  try {
    return await getClient().send(cmd)
  } catch (err) {
    if (err && typeof err === 'object') err.awsService = 'stepfunctions'
    throw err
  }
}

const isAlreadyExists = (err) => err?.name === 'ExecutionAlreadyExists'
const isDoesNotExist = (err) => err?.name === 'ExecutionDoesNotExist'

// arn:aws:states:<r>:<acct>:stateMachine:<sm>  →  arn:aws:states:<r>:<acct>:execution:<sm>:<name>
function executionArnFor(name) {
  return `${sc.stateMachineArn.replace(':stateMachine:', ':execution:')}:${name}`
}

/**
 * Start (or re-attach to) an execution. Same name + same input returns the
 * running execution; ExecutionAlreadyExists (closed execution, or different
 * input) → describe the deterministic ARN and carry on with it.
 * Returns { executionArn, startDate }.
 */
async function startExecution(name, input) {
  try {
    const out = await send(new StartExecutionCommand({
      stateMachineArn: sc.stateMachineArn,
      name,
      input: JSON.stringify(input),
    }))
    return { executionArn: out.executionArn, startDate: out.startDate }
  } catch (err) {
    if (!isAlreadyExists(err)) throw err
    const desc = await describeExecution(executionArnFor(name))
    return { executionArn: desc.executionArn, startDate: desc.startDate }
  }
}

async function describeExecution(executionArn) {
  return send(new DescribeExecutionCommand({ executionArn }))
}

// Name of the most recent *StateEntered event (newest first, last 30 events), or null.
async function latestStateEntered(executionArn) {
  const out = await send(new GetExecutionHistoryCommand({ executionArn, reverseOrder: true, maxResults: 30 }))
  for (const ev of out.events || []) {
    if (ev.type && ev.type.endsWith('StateEntered')) return ev.stateEnteredEventDetails?.name || null
  }
  return null
}

async function stopExecution(executionArn, { error, cause } = {}) {
  return send(new StopExecutionCommand({ executionArn, ...(error ? { error } : {}), ...(cause ? { cause } : {}) }))
}

module.exports = { getClient, startExecution, describeExecution, latestStateEntered, stopExecution, executionArnFor, isAlreadyExists, isDoesNotExist }
