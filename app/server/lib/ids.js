// SmartCrop IDs (spec 00 §2): prefix + lowercase ULID (time-sortable).
const { ulid } = require('ulid')

const newProjectId = () => `prj_${ulid().toLowerCase()}`
const newRenderId = () => `rnd_${ulid().toLowerCase()}`

module.exports = { newProjectId, newRenderId }
