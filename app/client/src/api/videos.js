import { getJson } from './http'

// GET /api/videos — list all video sessions.
export const listVideos = () => getJson('/api/videos')

// POST /api/upload (multipart) with upload progress, via XHR.
// Resolves with the parsed response ({ videoId, ... }); rejects on HTTP error
// (server error message) or network failure.
export function uploadVideo(file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('video', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed'))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(formData)
  })
}
