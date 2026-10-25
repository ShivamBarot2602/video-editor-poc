// Project endpoint validators (spec 02).

const { PROJECT_STATUSES, PROJECT_ID_RE, LIST_PK } = require('../../config/smartcropConstants')
const { validateListQuery, isKeyShape } = require('./common')

// Cursor = base64url JSON of the GSI byCreated key of the last returned item.
const isProjectCursorKey = (k) =>
  isKeyShape(k, ['projectId', 'listPk', 'createdAt']) && PROJECT_ID_RE.test(k.projectId) && k.listPk === LIST_PK

function validateProjectListQuery(query) {
  return validateListQuery(query, { statuses: PROJECT_STATUSES, checkCursorKey: isProjectCursorKey })
}

module.exports = { validateProjectListQuery, isProjectCursorKey }
