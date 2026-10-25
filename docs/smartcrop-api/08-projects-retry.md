# 08 — Retry processing

```
POST /api/smartcrop/projects/{projectId}/retry
```

Restarts processing of a `FAILED` project from the stage that failed (or the
earliest earlier stage whose files still exist). Allowed up to 3 attempts in
total — the UI shows "Try again" when `project.processing.retryable` is `true`.

| `failedStage` | Restarts at |
|---|---|
| `PREPARE` / `OTHER` | stage 1 (Prepare) |
| `ANALYZE` | stage 2 (Analyze) — needs `media.json` + `audio_mfcc.npy` |
| `DECIDE` | stage 3 (Decide) — needs `analysis.npz` |
| `PLAN` | stage 4 (Plan) — needs `decision.json` |

**Needs:** project `FAILED` with `processing.attempt < 3`.
`REJECTED` projects (bad file) can't be retried — upload again.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

Body: none, or an empty object. Any field → 400.

```json
{}
```

---

## curl

```bash
curl -s -b $COOKIE -X POST $API/projects/$P/retry \
  -H 'Content-Type: application/json' -d '{}' -w '\nHTTP %{http_code}\n'
```

---

## Postman

Collection request: **2 Projects → 08 Retry processing**

| Tab | Set to |
|---|---|
| Method | `POST` |
| URL | `{{api}}/projects/{{projectId}}/retry` |
| Headers | `Content-Type: application/json` (already set in the collection) |
| Body | see below |

Body → **raw** → **JSON**:

```json
{}
```

Expect **202** only when the project is `FAILED`; on a `READY` project you get **409 `INVALID_STATE`** (that's correct).

---

## Success — `202 Accepted`

```json
{
  "project": {
    "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
    "title": "Podcast EP12",
    "status": "PROCESSING",
    "createdAt": "2026-10-23T05:42:52.592Z",
    "updatedAt": "2026-10-23T06:01:10.002Z",
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
      "stage": "QUEUED",
      "attempt": 2,
      "startedAt": "2026-10-23T06:01:10.001Z",
      "finishedAt": null,
      "elapsedMs": 1,
      "error": null,
      "retryable": false
    },
    "edit": null,
    "activeRenderId": null,
    "lastRender": null,
    "lastSyncedAt": null
  }
}
```

Then poll [06 — Get project](06-projects-get.md) as usual.

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad project id, body has fields |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project |
| 409 | `INVALID_STATE` | `{ "status": "READY", "allowed": ["FAILED"] }` | project is not `FAILED` (incl. `REJECTED`) |
| 409 | `INVALID_STATE` | `{ "status": "FAILED", "allowed": ["FAILED"] }` | already failed 3 times (message below) |
| 409 | `REQUEST_IN_PROGRESS` | `null` | another retry won the race; the extra pipeline run was stopped |
| 502 | `UPSTREAM_ERROR` | `{ "service": "stepfunctions" }` | couldn't start the pipeline — project stays `FAILED` |

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "This video failed 3 times. Please upload it again.",
    "details": { "status": "FAILED", "allowed": ["FAILED"] }
  }
}
```

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "This can't be done while the item is READY.",
    "details": { "status": "READY", "allowed": ["FAILED"] }
  }
}
```

---

## How to test

A real failure is hard to force. Options:

- **Stop the execution** in the AWS Step Functions console while the project is
  `PROCESSING`. The next [06](06-projects-get.md) call shows `FAILED` with
  `PIPELINE_ABORTED` (`retryable: true`). Then retry → **202**, `attempt: 2`.
- Upload a video the pipeline can't handle, if you have one.

Negative checks you can always do:

```bash
# READY project → 409 INVALID_STATE
curl -s -b $COOKIE -X POST $API/projects/$P/retry -H 'Content-Type: application/json' -d '{}' | jq
# body with a field → 400
curl -s -b $COOKIE -X POST $API/projects/$P/retry -H 'Content-Type: application/json' -d '{"force":true}' | jq
```
