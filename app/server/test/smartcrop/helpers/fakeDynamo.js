/**
 * In-memory DynamoDB behind aws-sdk-client-mock. Evaluates the condition /
 * update / key expressions lib/dynamo.js generates (a small, fixed grammar), so
 * the real conditional-write logic is exercised:
 *
 *   conditions: attribute_exists(p) | attribute_not_exists(p) | p (=|<|<=|>|>=|<>) :v
 *               | p IN (:a, :b) | AND | OR | ( … )
 *   updates:    SET p = :v, …  REMOVE p, …   (nested SET on a missing/non-map
 *               parent throws ValidationException, like DynamoDB)
 *   queries:    partition-key equality only; Limit applies before FilterExpression;
 *               LastEvaluatedKey whenever Limit is hit (even at the very end).
 */

const { mockClient } = require('aws-sdk-client-mock')
const { ConditionalCheckFailedException } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchGetCommand,
} = require('@aws-sdk/lib-dynamodb')

const clone = (v) => (v === undefined ? undefined : structuredClone(v))

// ─── expression parsing ─────────────────────────────────────────────────────

function tokenize(expr) {
  const re = /\s*(attribute_not_exists|attribute_exists|AND|OR|IN|<>|<=|>=|=|<|>|\(|\)|,|#[A-Za-z0-9_]+(?:\.#[A-Za-z0-9_]+)*|:[A-Za-z0-9_]+)\s*/gy
  const out = []
  let m
  let last = 0
  while ((m = re.exec(expr))) { out.push(m[1]); last = re.lastIndex }
  if (last !== expr.length) throw new Error(`fakeDynamo: cannot tokenize at "${expr.slice(last)}" in: ${expr}`)
  return out
}

function resolvePath(token, names) {
  return token.split('.').map(seg => {
    if (!(seg in names)) throw new Error(`fakeDynamo: missing name ${seg}`)
    return names[seg]
  })
}

function getPath(item, path) {
  let cur = item
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object' || !(seg in cur)) return undefined
    cur = cur[seg]
  }
  return cur
}

function evalCondition(expr, item, names, values) {
  const t = tokenize(expr)
  let i = 0
  const peek = () => t[i]
  const take = (x) => { if (x && t[i] !== x) throw new Error(`fakeDynamo: expected ${x} got ${t[i]} in ${expr}`); return t[i++] }
  const val = (tok) => { if (!(tok in values)) throw new Error(`fakeDynamo: missing value ${tok}`); return values[tok] }

  function orExpr() {
    let v = andExpr()
    while (peek() === 'OR') { take('OR'); const r = andExpr(); v = v || r }
    return v
  }
  function andExpr() {
    let v = unary()
    while (peek() === 'AND') { take('AND'); const r = unary(); v = v && r }
    return v
  }
  function unary() {
    const tok = take()
    if (tok === '(') { const v = orExpr(); take(')'); return v }
    if (tok === 'attribute_exists' || tok === 'attribute_not_exists') {
      take('('); const path = resolvePath(take(), names); take(')')
      const exists = getPath(item, path) !== undefined
      return tok === 'attribute_exists' ? exists : !exists
    }
    const left = getPath(item, resolvePath(tok, names))
    const op = take()
    if (op === 'IN') {
      take('(')
      const list = [val(take())]
      while (peek() === ',') { take(','); list.push(val(take())) }
      take(')')
      return list.some(v => v === left)
    }
    const right = val(take())
    if (left === undefined) return false
    switch (op) {
      case '=': return left === right
      case '<>': return left !== right
      case '<': return left < right
      case '<=': return left <= right
      case '>': return left > right
      case '>=': return left >= right
      default: throw new Error(`fakeDynamo: op ${op}`)
    }
  }
  const result = orExpr()
  if (i !== t.length) throw new Error(`fakeDynamo: trailing tokens in ${expr}`)
  return result
}

function validationError(message) {
  const err = new Error(message)
  err.name = 'ValidationException'
  err.$metadata = { httpStatusCode: 400 }
  return err
}

function applyUpdate(item, expr, names, values) {
  const [setPart, removePart] = (() => {
    const idx = expr.indexOf(' REMOVE ')
    if (expr.startsWith('REMOVE ')) return ['', expr.slice(7)]
    return idx >= 0 ? [expr.slice(4, idx), expr.slice(idx + 8)] : [expr.startsWith('SET ') ? expr.slice(4) : '', '']
  })()
  for (const assignment of setPart ? setPart.split(', ') : []) {
    const [lhs, rhs] = assignment.split(' = ')
    const path = resolvePath(lhs.trim(), names)
    const v = clone(values[rhs.trim()])
    let cur = item
    for (let k = 0; k < path.length - 1; k++) {
      const next = cur[path[k]]
      if (next === null || typeof next !== 'object' || Array.isArray(next)) {
        throw validationError(`The document path provided in the update expression is invalid for update (${path.join('.')})`)
      }
      cur = next
    }
    cur[path[path.length - 1]] = v
  }
  for (const p of removePart ? removePart.split(', ') : []) {
    const path = resolvePath(p.trim(), names)
    const parent = getPath(item, path.slice(0, -1))
    if (parent && typeof parent === 'object') delete parent[path[path.length - 1]]
  }
}

const condFail = () => new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: { httpStatusCode: 400 } })

// ─── tables ─────────────────────────────────────────────────────────────────

const SCHEMAS = {
  'smartcrop-api-projects': { pk: 'projectId', indexes: { byCreated: { pk: 'listPk', sk: 'createdAt' } } },
  'smartcrop-api-renders': { pk: 'projectId', sk: 'renderId', indexes: {} },
  'pipeline-jobs': { pk: 'job_id', indexes: {} },
}

function createFakeDynamo() {
  const tables = new Map(Object.keys(SCHEMAS).map(n => [n, new Map()]))
  const failNext = [] // [{ command, error }]
  const keyOf = (table, key) => {
    const s = SCHEMAS[table]
    return s.sk ? `${key[s.pk]}|${key[s.sk]}` : String(key[s.pk])
  }
  const tbl = (name) => {
    if (!tables.has(name)) throw new Error(`fakeDynamo: unknown table ${name}`)
    return tables.get(name)
  }
  const maybeFail = (command) => {
    const idx = failNext.findIndex(f => f.command === command)
    if (idx >= 0) { const [f] = failNext.splice(idx, 1); throw f.error }
  }

  const mock = mockClient(DynamoDBDocumentClient)

  mock.on(GetCommand).callsFake((input) => {
    maybeFail('Get')
    const item = tbl(input.TableName).get(keyOf(input.TableName, input.Key))
    return { Item: clone(item) }
  })

  mock.on(PutCommand).callsFake((input) => {
    maybeFail('Put')
    const t = tbl(input.TableName)
    const k = keyOf(input.TableName, input.Item)
    if (input.ConditionExpression && !evalCondition(input.ConditionExpression, t.get(k) || {}, input.ExpressionAttributeNames || {}, input.ExpressionAttributeValues || {})) {
      throw condFail()
    }
    t.set(k, clone(input.Item))
    return {}
  })

  mock.on(UpdateCommand).callsFake((input) => {
    maybeFail('Update')
    const t = tbl(input.TableName)
    const k = keyOf(input.TableName, input.Key)
    const current = t.get(k)
    const names = input.ExpressionAttributeNames || {}
    const values = input.ExpressionAttributeValues || {}
    if (input.ConditionExpression && !evalCondition(input.ConditionExpression, current || {}, names, values)) throw condFail()
    const next = clone(current) || clone(input.Key)
    applyUpdate(next, input.UpdateExpression, names, values)
    t.set(k, next)
    return { Attributes: clone(next) }
  })

  mock.on(DeleteCommand).callsFake((input) => {
    maybeFail('Delete')
    const t = tbl(input.TableName)
    const k = keyOf(input.TableName, input.Key)
    if (input.ConditionExpression && !evalCondition(input.ConditionExpression, t.get(k) || {}, input.ExpressionAttributeNames || {}, input.ExpressionAttributeValues || {})) throw condFail()
    t.delete(k)
    return {}
  })

  mock.on(QueryCommand).callsFake((input) => {
    maybeFail('Query')
    const schema = SCHEMAS[input.TableName]
    const keys = input.IndexName ? schema.indexes[input.IndexName] : { pk: schema.pk, sk: schema.sk }
    const names = input.ExpressionAttributeNames || {}
    const values = input.ExpressionAttributeValues || {}
    const [pkTok, pkVal] = input.KeyConditionExpression.split(' = ')
    const pkName = resolvePath(pkTok.trim(), names)[0]
    if (pkName !== keys.pk) throw new Error(`fakeDynamo: query on ${pkName}, expected ${keys.pk}`)
    const pk = values[pkVal.trim()]

    let rows = [...tbl(input.TableName).values()].filter(it => it[keys.pk] === pk && (!keys.sk || it[keys.sk] !== undefined))
    const tie = schema.sk || schema.pk
    rows.sort((a, b) => (a[keys.sk] < b[keys.sk] ? -1 : a[keys.sk] > b[keys.sk] ? 1 : a[tie] < b[tie] ? -1 : a[tie] > b[tie] ? 1 : 0))
    if (input.ScanIndexForward === false) rows.reverse()

    if (input.ExclusiveStartKey) {
      const sk = input.ExclusiveStartKey
      const idx = rows.findIndex(r => r[schema.pk] === sk[schema.pk] && (!schema.sk || r[schema.sk] === sk[schema.sk]))
      if (idx < 0) throw validationError('fakeDynamo: ExclusiveStartKey not found')
      rows = rows.slice(idx + 1)
    }

    const limit = input.Limit || Infinity
    const evaluated = rows.slice(0, limit)
    const Items = evaluated
      .filter(r => !input.FilterExpression || evalCondition(input.FilterExpression, r, names, values))
      .map(clone)
    let LastEvaluatedKey
    if (evaluated.length === limit) {
      const last = evaluated[evaluated.length - 1]
      LastEvaluatedKey = { [schema.pk]: last[schema.pk] }
      if (schema.sk) LastEvaluatedKey[schema.sk] = last[schema.sk]
      if (input.IndexName) { LastEvaluatedKey[keys.pk] = last[keys.pk]; LastEvaluatedKey[keys.sk] = last[keys.sk] }
    }
    return { Items, LastEvaluatedKey }
  })

  mock.on(BatchGetCommand).callsFake((input) => {
    maybeFail('BatchGet')
    const Responses = {}
    for (const [name, req] of Object.entries(input.RequestItems)) {
      Responses[name] = req.Keys.map(k => tbl(name).get(keyOf(name, k))).filter(Boolean).map(clone)
    }
    return { Responses, UnprocessedKeys: {} }
  })

  return {
    mock,
    tables,
    // Direct access for arranging / asserting state.
    get: (table, key) => clone(tbl(table).get(keyOf(table, key))),
    put: (table, item) => tbl(table).set(keyOf(table, item), clone(item)),
    patch: (table, key, fields) => {
      const k = keyOf(table, key)
      tbl(table).set(k, { ...tbl(table).get(k), ...clone(fields) })
    },
    all: (table) => [...tbl(table).values()].map(clone),
    // Fail the next call of a command type ('Get' | 'Put' | 'Update' | 'Delete' | 'Query' | 'BatchGet').
    failNext: (command, error) => failNext.push({ command, error }),
    reset() {
      for (const t of tables.values()) t.clear()
      failNext.length = 0
    },
  }
}

module.exports = { createFakeDynamo, evalCondition, applyUpdate }
