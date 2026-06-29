const store = require('../storage/videoStore')

// Persist the original filename/size/time so Recent Videos can display it later.
function recordUpload(videoId, meta) {
  store.writeMeta(videoId, meta)
}

module.exports = { recordUpload }
