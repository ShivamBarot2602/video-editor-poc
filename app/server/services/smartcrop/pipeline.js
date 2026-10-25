/**
 * Builds Step Functions inputs and the Plan Lambda event (spec 00 §6.1–6.2).
 * Pure functions over the project item + edit document; every s3:// URI comes
 * from videoStore.smartcrop.uris.
 *
 * `--out-dir` is always LAST: the state machine prepends its own
 * `--out-dir {job_prefix}/plans` and argparse keeps the last value, so render /
 * preview plans never overwrite the initial plan.
 */

const { smartcrop: store } = require('../../storage/videoStore')

const PLAN_ARGS = (doc) => [
  '--aspect', doc.aspect,
  '--layout', doc.defaultLayout,
  '--background', doc.options.background,
  '--fallback', doc.options.fallbackLayout,
]

const processingExecutionName = (projectId, attempt) => `${projectId}-process-${attempt}`
const renderExecutionName = (renderId) => `${renderId}-render`

// Upload complete (start_at 1) and retry (start_at = failed stage).
function processingInput(project, startAt) {
  const p = project.projectId
  return {
    job_id: p,
    input: store.uris.source(p, project.source.ext),
    job_prefix: store.uris.jobPrefix(p),
    out_prefix: store.uris.initialOut(p),
    start_at: startAt,
    plan_args: ['--aspect', project.initial.aspect, '--layout', project.initial.layout],
    skip_render: true,
  }
}

// Render (Save): plan from stage 4 with the frozen edit, then render.
function renderInput(project, renderId, doc, { featureEdit }) {
  const p = project.projectId
  return {
    job_id: renderId,
    input: store.uris.source(p, project.source.ext),
    job_prefix: store.uris.jobPrefix(p),
    out_prefix: store.uris.renderOut(p, renderId),
    start_at: 4,
    plan_args: [
      ...PLAN_ARGS(doc),
      ...(featureEdit ? ['--edit', store.uris.renderEdit(p, renderId)] : []),
      '--out-dir', store.uris.renderPlansDir(p, renderId),
    ],
  }
}

// Synchronous preview plan.
function previewEvent(project, hash, doc, { featureEdit }) {
  const p = project.projectId
  return {
    stage: 'plan',
    args: [
      '--analysis', store.uris.analysis(p),
      '--decision', store.uris.decision(p),
      '--input', store.uris.source(p, project.source.ext),
      ...PLAN_ARGS(doc),
      ...(featureEdit ? ['--edit', store.uris.previewEdit(p, hash)] : []),
      '--out-dir', store.uris.previewDir(p, hash),
    ],
  }
}

module.exports = { PLAN_ARGS, processingExecutionName, renderExecutionName, processingInput, renderInput, previewEvent }
