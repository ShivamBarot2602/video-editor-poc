import { getJson } from './http'

// GET /api/videos — list all video sessions.
export const listVideos = () => getJson('/api/videos')

// uploadVideo (XHR with progress) is added in api/videos alongside this list call.
