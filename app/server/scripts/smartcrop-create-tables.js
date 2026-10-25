#!/usr/bin/env node
/**
 * Create the two SmartCrop API tables if they don't exist (spec 00 §4, §9):
 *   PROJECTS_TABLE  key projectId; GSI byCreated (listPk, createdAt), projection ALL
 *   RENDERS_TABLE   key projectId + renderId
 * Both on-demand. Safe to run repeatedly (existing tables are left alone).
 *
 * Usage (from app/server):  node scripts/smartcrop-create-tables.js
 * Reads AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / PROJECTS_TABLE /
 * RENDERS_TABLE from .env.
 */

require('dotenv').config()
const {
  DynamoDBClient, DescribeTableCommand, CreateTableCommand, waitUntilTableExists,
} = require('@aws-sdk/client-dynamodb')

const region = process.env.AWS_REGION
if (!region) {
  console.error('AWS_REGION is required')
  process.exit(1)
}
const credentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
  : undefined
const client = new DynamoDBClient({ region, credentials })

const PROJECTS = (process.env.PROJECTS_TABLE || '').trim() || 'smartcrop-api-projects'
const RENDERS = (process.env.RENDERS_TABLE || '').trim() || 'smartcrop-api-renders'

const TABLES = [
  {
    TableName: PROJECTS,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'projectId', AttributeType: 'S' },
      { AttributeName: 'listPk', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'projectId', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [{
      IndexName: 'byCreated',
      KeySchema: [
        { AttributeName: 'listPk', KeyType: 'HASH' },
        { AttributeName: 'createdAt', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    }],
  },
  {
    TableName: RENDERS,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'projectId', AttributeType: 'S' },
      { AttributeName: 'renderId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'projectId', KeyType: 'HASH' },
      { AttributeName: 'renderId', KeyType: 'RANGE' },
    ],
  },
]

async function exists(TableName) {
  try {
    const out = await client.send(new DescribeTableCommand({ TableName }))
    return out.Table
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return null
    throw err
  }
}

async function main() {
  for (const def of TABLES) {
    const table = await exists(def.TableName)
    if (table) {
      const gsis = (table.GlobalSecondaryIndexes || []).map(g => g.IndexName)
      if (def.GlobalSecondaryIndexes && !gsis.includes('byCreated')) {
        console.warn(`! ${def.TableName} exists but has no byCreated GSI — add it manually (list endpoint needs it).`)
      } else {
        console.log(`= ${def.TableName} already exists (${table.TableStatus})`)
      }
      continue
    }
    console.log(`+ creating ${def.TableName} …`)
    await client.send(new CreateTableCommand(def))
    await waitUntilTableExists({ client, maxWaitTime: 300 }, { TableName: def.TableName })
    console.log(`  ${def.TableName} ACTIVE`)
  }
}

main().catch((err) => {
  console.error('Failed:', err.name, err.message)
  process.exit(1)
})
