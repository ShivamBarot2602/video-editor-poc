/**
 * Thin DynamoDB (DocumentClient) access for smartcrop. Every call goes through
 * send(), which tags failures with awsService = 'dynamodb' (→ 502 UPSTREAM_ERROR)
 * — except conditional-check failures, which callers handle as state races.
 *
 * Update helper: callers pass dotted attribute paths ("upload.completingAt") and
 * conditions written with `#n_<segment>` name placeholders; names are collected
 * automatically so call sites stay readable.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchGetCommand,
} = require('@aws-sdk/lib-dynamodb')
const { credentials } = require('../config/storage')
const sc = require('../config/smartcrop')

let _doc = null
function getDoc() {
  if (!_doc) {
    const base = new DynamoDBClient({ region: sc.region, credentials })
    _doc = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
    })
  }
  return _doc
}

function isConditionalFail(err) {
  return err?.name === 'ConditionalCheckFailedException'
}

async function send(cmd) {
  try {
    return await getDoc().send(cmd)
  } catch (err) {
    if (err && typeof err === 'object' && !isConditionalFail(err)) err.awsService = 'dynamodb'
    throw err
  }
}

// "upload.completingAt" → "#n_upload.#n_completingAt"
const n = (path) => path.split('.').map(seg => `#n_${seg}`).join('.')

function collectNames(...exprs) {
  const names = {}
  for (const e of exprs) {
    if (!e) continue
    for (const m of e.matchAll(/#n_([A-Za-z0-9_]+)/g)) names[m[0]] = m[1]
  }
  return names
}

async function get(TableName, Key) {
  const out = await send(new GetCommand({ TableName, Key, ConsistentRead: true }))
  return out.Item || null
}

async function put(TableName, Item, { condition, values } = {}) {
  await send(new PutCommand({
    TableName,
    Item,
    ...(condition ? {
      ConditionExpression: condition,
      ExpressionAttributeNames: collectNames(condition),
      ...(values && Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
    } : {}),
  }))
}

/**
 * update(table, key, {
 *   set:    { 'status': 'READY', 'processing.stage': null },   // dotted paths
 *   remove: ['upload.completingAt'],
 *   condition: '#n_status = :c_status',                         // optional
 *   values: { ':c_status': 'PROCESSING' },                      // condition values
 * }) → the updated item (ALL_NEW)
 */
async function update(TableName, Key, { set = {}, remove = [], condition, values = {} } = {}) {
  const parts = []
  const attrValues = { ...values }
  const setEntries = Object.entries(set)
  if (setEntries.length) {
    parts.push('SET ' + setEntries.map(([path, v], i) => {
      attrValues[`:s${i}`] = v
      return `${n(path)} = :s${i}`
    }).join(', '))
  }
  if (remove.length) parts.push('REMOVE ' + remove.map(n).join(', '))
  const UpdateExpression = parts.join(' ')
  const out = await send(new UpdateCommand({
    TableName,
    Key,
    UpdateExpression,
    ...(condition ? { ConditionExpression: condition } : {}),
    ExpressionAttributeNames: collectNames(UpdateExpression, condition),
    ...(Object.keys(attrValues).length ? { ExpressionAttributeValues: attrValues } : {}),
    ReturnValues: 'ALL_NEW',
  }))
  return out.Attributes
}

async function del(TableName, Key, { condition, values } = {}) {
  await send(new DeleteCommand({
    TableName,
    Key,
    ...(condition ? {
      ConditionExpression: condition,
      ExpressionAttributeNames: collectNames(condition),
      ...(values && Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
    } : {}),
  }))
}

/**
 * One Query page. `keyCondition` / `filter` use the #n_ convention.
 * Returns { items, lastKey }.
 */
async function query(TableName, { index, keyCondition, filter, values, limit, startKey, forward = true, consistent = false }) {
  const out = await send(new QueryCommand({
    TableName,
    ...(index ? { IndexName: index } : {}),
    KeyConditionExpression: keyCondition,
    ...(filter ? { FilterExpression: filter } : {}),
    ExpressionAttributeNames: collectNames(keyCondition, filter),
    ExpressionAttributeValues: values,
    ...(limit ? { Limit: limit } : {}),
    ...(startKey ? { ExclusiveStartKey: startKey } : {}),
    ScanIndexForward: forward,
    ...(consistent && !index ? { ConsistentRead: true } : {}),
  }))
  return { items: out.Items || [], lastKey: out.LastEvaluatedKey || null }
}

// BatchGet for one table (≤ 100 keys per call; retries unprocessed keys once).
async function batchGet(TableName, keys) {
  const items = []
  for (let i = 0; i < keys.length; i += 100) {
    let RequestItems = { [TableName]: { Keys: keys.slice(i, i + 100) } }
    for (let attempt = 0; attempt < 3 && RequestItems; attempt++) {
      const out = await send(new BatchGetCommand({ RequestItems }))
      items.push(...(out.Responses?.[TableName] || []))
      const un = out.UnprocessedKeys?.[TableName]?.Keys
      RequestItems = un && un.length ? { [TableName]: { Keys: un } } : null
    }
  }
  return items
}

module.exports = { getDoc, send, isConditionalFail, n, get, put, update, del, query, batchGet }
