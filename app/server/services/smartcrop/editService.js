/**
 * Edit list GET / PUT (spec 03 §2–3). The document lives in the project item.
 */

const sc = require('../../config/smartcrop')
const dynamo = require('../../lib/dynamo')
const { E } = require('../../lib/apiError')
const repo = require('./projectRepo')
const { loadAndSync } = require('./projectLoader')
const { canonicalJson } = require('./previewService')
const { validateEditDocument, outputDurationMs } = require('../../validators/smartcrop/editDocument')
const { PROJECT_STATUS } = require('../../config/smartcropConstants')

function assertReady(item) {
  if (item.status !== PROJECT_STATUS.READY) throw E.invalidState(item.status, [PROJECT_STATUS.READY])
}

const view = (edit, extra = {}) => ({
  version: edit.version,
  updatedAt: edit.updatedAt,
  ...extra,
  outputDurationMs: outputDurationMs(edit.document),
  document: edit.document,
})

async function getEdit(projectId) {
  const item = await loadAndSync(projectId)
  assertReady(item)
  return view(item.edit)
}

async function putEdit(projectId, { document }) {
  let item = await loadAndSync(projectId)
  assertReady(item)

  const v = validateEditDocument(document, {
    durationMs: item.source.durationMs, minClipMs: sc.minClipMs, maxClips: sc.maxClips,
  })
  if (v.issues.length) throw E.validation(v.issues)
  if (v.ruleIssues.length) throw E.editInvalid(v.ruleIssues)
  const doc = v.value

  // Last write wins; the conditional write only guards against a concurrent
  // bump between our read and write — re-read and retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (canonicalJson(doc) === canonicalJson(item.edit.document)) {
      return view(item.edit, { changed: false })
    }
    const nextEdit = { version: item.edit.version + 1, updatedAt: new Date().toISOString(), document: doc }
    try {
      const updated = await repo.updateProject(projectId, {
        set: { edit: nextEdit },
        expect: { status: PROJECT_STATUS.READY },
        and: '#n_edit.#n_version = :ver',
        values: { ':ver': item.edit.version },
      })
      return view(updated.edit, { changed: true })
    } catch (err) {
      if (!dynamo.isConditionalFail(err)) throw err
      item = await repo.getProject(projectId)
      if (!item || item.deletedAt) throw E.projectNotFound()
      assertReady(item)
    }
  }
  throw E.requestInProgress()
}

module.exports = { getEdit, putEdit }
