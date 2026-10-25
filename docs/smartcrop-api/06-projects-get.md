# 06 — Get project (status polling)

```
GET /api/smartcrop/projects/{projectId}
```

Returns one project. This is the endpoint the loader screen polls **every 3 s**
while processing. Each call (at most once per 3 s per project) asks Step
Functions for the latest state and updates the project:

| Pipeline | Project becomes |
|---|---|
| running | `PROCESSING`, `processing.stage` = `QUEUED` / `PREPARING` / `ANALYZING` / `PLANNING` / `FINALIZING` (never moves backwards) |
| succeeded | `READY` — snap points, people count and edit v1 are created |
| failed | `FAILED` with `processing.error` |
| timed out / aborted | `FAILED` (`PIPELINE_TIMED_OUT` / `PIPELINE_ABORTED`) |

If the project has a running render, that render is refreshed too.
An `UPLOADING` project past its expiry becomes `UPLOAD_EXPIRED`.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

No body, no query.

---

## curl

```bash
curl -s -b $COOKIE $API/projects/$P | jq

# poll until processing finishes (Ctrl-C to stop)
while true; do
  curl -s -b $COOKIE $API/projects/$P | jq -c '{status: .project.status, stage: .project.processing.stage, error: .project.processing.error.code}'
  sleep 3
done
```

---

## Postman

Collection request: **2 Projects → 06 Get project (poll)**

| Tab | Set to |
|---|---|
| Method | `GET` |
| URL | `{{api}}/projects/{{projectId}}` |
| Headers | none |
| Body | none |
| Scripts → Post-response | saves `durationMs`; logs status / stage / error code in the Console |

Click **Send** every few seconds until `project.status` is `READY` (watch `processing.stage` move forward).

---

## Success — `200 OK`

While processing:

```json
{
  "project": {
    "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
    "title": "Podcast EP12",
    "status": "PROCESSING",
    "createdAt": "2026-10-23T05:42:52.592Z",
    "updatedAt": "2026-10-23T05:42:52.604Z",
    "initial": { "aspect": "9:16", "layout": "fill" },
    "source": {
      "fileName": "Podcast EP12.mp4",
      "contentType": "video/mp4",
      "sizeBytes": 10582938,
      "durationMs": 63000,
      "width": 1280,
      "height": 720,
      "fps": 25,
      "hasAudio": true,
      "videoCodec": "h264"
    },
    "upload": {
      "partCount": 1,
      "partSizeBytes": 16777216,
      "expiresAt": "2026-10-24T05:42:52.592Z",
      "completedAt": "2026-10-23T05:42:52.601Z"
    },
    "processing": {
      "stage": "ANALYZING",
      "attempt": 1,
      "startedAt": "2026-10-23T05:42:52.601Z",
      "finishedAt": null,
      "elapsedMs": 101393,
      "error": null,
      "retryable": false
    },
    "edit": null,
    "activeRenderId": null,
    "lastRender": null,
    "lastSyncedAt": "2026-10-23T05:44:34.000Z"
  }
}
```

When ready (only the changed fields shown):

```json
{
  "project": {
    "status": "READY",
    "processing": {
      "stage": null,
      "attempt": 1,
      "startedAt": "2026-10-23T05:42:52.601Z",
      "finishedAt": "2026-10-23T05:45:10.618Z",
      "elapsedMs": 138017,
      "error": null,
      "retryable": false
    },
    "edit": { "version": 1, "updatedAt": "2026-10-23T05:45:10.619Z" }
  }
}
```

When failed:

```json
{
  "project": {
    "status": "FAILED",
    "processing": {
      "stage": null,
      "attempt": 1,
      "startedAt": "2026-10-23T05:42:52.601Z",
      "finishedAt": "2026-10-23T05:44:30.100Z",
      "elapsedMs": 97499,
      "error": {
        "code": "ANALYZE_FAILED",
        "message": "We couldn't analyse this video. Try again, or upload a different file.",
        "failedStage": "ANALYZE"
      },
      "retryable": true
    }
  }
}
```

Possible `processing.error.code` values: `PREPARE_FAILED`, `ANALYZE_FAILED`,
`DECIDE_FAILED`, `PLAN_FAILED`, `RENDER_FAILED`, `PIPELINE_FAILED`,
`PIPELINE_TIMED_OUT`, `PIPELINE_ABORTED`. For a `REJECTED` project it holds the
upload check error (`VIDEO_TOO_LONG`, …) with `failedStage: null`.

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad project id |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project, or it is being deleted |
| 502 | `UPSTREAM_ERROR` | `{ "service": "dynamodb" }` | only if reading the project fails. If AWS status checks fail, you still get **200** with the last stored status |

```json
{
  "error": { "code": "PROJECT_NOT_FOUND", "message": "Project not found.", "details": null }
}
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid.",
    "details": { "issues": [{ "path": "projectId", "message": "Must look like prj_ followed by 26 lowercase letters or digits." }] }
  }
}
```

---

## How to test

1. Right after [03](03-uploads-complete.md): run the poll loop. Watch
   `QUEUED → PREPARING → ANALYZING → PLANNING → FINALIZING → READY`.
2. Once `READY`: `edit.version = 1`, `processing.stage = null`.
3. Poll very fast (10 calls in a row) → still fine; AWS is asked at most once per 3 s.
4. Negative:

```bash
curl -s -b $COOKIE $API/projects/prj_00000000000000000000000000 | jq   # 404
curl -s -b $COOKIE $API/projects/hello | jq                             # 400
```
