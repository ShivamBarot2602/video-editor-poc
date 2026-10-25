# 03 — Complete upload

```
POST /api/smartcrop/uploads/{projectId}/complete
```

Tells the server every part is uploaded. The server then:

1. asks S3 to assemble the parts into `source.<ext>`,
2. checks the size matches `sizeBytes`,
3. runs **ffprobe** on the file (duration, size, fps, audio, codec),
4. rejects bad files, or starts the processing pipeline (Step Functions),
5. moves the project to `PROCESSING`.

**Needs:** project in `UPLOADING`, all parts PUT to S3 ([01](01-uploads-create.md)).
**Next:** poll [06 — Get project](06-projects-get.md) until `READY`.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

```json
{
  "parts": [
    { "partNumber": 1, "etag": "\"9b2cf535f27731c974343645a3985328\"" },
    { "partNumber": 2, "etag": "\"0d1f3c8e2b4a59f7c6e1d2b3a4f5e6d7\"" }
  ]
}
```

| Field | Rule |
|---|---|
| `parts` | exactly `partCount` items, part numbers 1…`partCount`, each once, any order |
| `parts[].partNumber` | integer ≥ 1 |
| `parts[].etag` | the `ETag` header S3 returned for that part, 1–128 chars. Quotes optional (`"abc"` and `abc` both work) |

---

## curl

```bash
# $PARTS_JSON was built while uploading the parts (see 01)
curl -s -b $COOKIE -X POST $API/uploads/$P/complete \
  -H 'Content-Type: application/json' \
  -d "{\"parts\":$PARTS_JSON}" | jq
```

Or typed by hand:

```bash
curl -s -b $COOKIE -X POST $API/uploads/$P/complete \
  -H 'Content-Type: application/json' \
  -d '{"parts":[{"partNumber":1,"etag":"9b2cf535f27731c974343645a3985328"}]}' | jq
```

---

## Postman

Collection request: **1 Upload → 03 Complete upload**

| Tab | Set to |
|---|---|
| Method | `POST` |
| URL | `{{api}}/uploads/{{projectId}}/complete` |
| Headers | `Content-Type: application/json` (already set in the collection) |
| Body | see below |
| Scripts → Post-response | saves `durationMs` (from `project.source.durationMs`) — used by the edit bodies later |

Body → **raw** → **JSON**:

```json
{
  "parts": [
    { "partNumber": 1, "etag": "{{etag}}" }
  ]
}
```

`{{etag}}` was saved by **01b**. Expect **200** and `project.status: "PROCESSING"`. Then poll [06](06-projects-get.md).

---

## Success — `200 OK`

```json
{
  "project": {
    "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
    "title": "Podcast EP12",
    "status": "PROCESSING",
    "createdAt": "2026-10-23T05:42:52.592Z",
    "updatedAt": "2026-10-23T05:42:52.601Z",
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
      "attempt": 1,
      "startedAt": "2026-10-23T05:42:52.601Z",
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

- `source` now has the probed values. A phone video recorded with rotation 90°
  is stored as portrait (e.g. `1080 × 1920`).
- Calling `complete` again after success returns **200 with the current project**
  and does **not** start a second pipeline run.

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | wrong number of parts, duplicate / out-of-range part number, bad etag |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project |
| 409 | `UPLOAD_NOT_ACTIVE` | `{ "status" }` | project is `REJECTED` or `UPLOAD_ABORTED` |
| 409 | `REQUEST_IN_PROGRESS` | `null` | another `complete` call for this project is running |
| 410 | `UPLOAD_EXPIRED` | `null` | upload expired (24 h) or S3 lost it |
| 422 | `UPLOAD_INCOMPLETE` | `{ "missingParts": [2] }` | a part is missing or its ETag is wrong — status stays `UPLOADING`, re-upload those parts and call again |
| 422 | `UPLOAD_INCOMPLETE` | `{ "missingParts": [] }` | assembled file size ≠ `sizeBytes` → project `REJECTED` |
| 422 | `VIDEO_UNREADABLE` | `null` | not a real video / container doesn't match the extension / ffprobe timed out (30 s) |
| 422 | `VIDEO_NO_VIDEO_STREAM` | `null` | audio-only or cover-art-only file |
| 422 | `VIDEO_TOO_SHORT` | `{ "durationMs", "limitMs" }` | shorter than 3 s |
| 422 | `VIDEO_TOO_LONG` | `{ "durationMs", "limitMs" }` | longer than 30 min |
| 422 | `VIDEO_RESOLUTION_UNSUPPORTED` | `{ "width", "height" }` | short side < 360 px or long side > 3840 px |
| 502 | `UPSTREAM_ERROR` | `{ "service" }` | AWS failed. If the pipeline failed to start, the project stays `UPLOADING`; calling `complete` again resumes **without** re-checking the file |

For every `VIDEO_*` error and the size mismatch: the uploaded file is deleted,
the project becomes **`REJECTED`** (cannot be retried — upload again), and the
error is stored in `project.processing.error`.

Examples:

```json
{
  "error": {
    "code": "UPLOAD_INCOMPLETE",
    "message": "Some parts of the file did not upload. Please upload them again.",
    "details": { "missingParts": [2] }
  }
}
```

```json
{
  "error": {
    "code": "VIDEO_TOO_LONG",
    "message": "This video is 41 minutes long; the limit is 30 minutes.",
    "details": { "durationMs": 2460000, "limitMs": 1800000 }
  }
}
```

```json
{
  "error": {
    "code": "VIDEO_RESOLUTION_UNSUPPORTED",
    "message": "This video is 7680×4320; videos must be at least 360p and at most 3840 pixels wide.",
    "details": { "width": 7680, "height": 4320 }
  }
}
```

```json
{
  "error": {
    "code": "VIDEO_UNREADABLE",
    "message": "We couldn't read this file as a video.",
    "details": null
  }
}
```

```json
{
  "error": {
    "code": "REQUEST_IN_PROGRESS",
    "message": "Another request for this item is in progress. Try again shortly.",
    "details": null
  }
}
```

---

## How to test

1. Happy path: curl above → **200**, `status: "PROCESSING"`, `source.durationMs` etc. filled.
2. Call it again → **200**, same project, still one pipeline run.
3. Wrong part count → **400**:
   ```bash
   curl -s -b $COOKIE -X POST $API/uploads/$P/complete -H 'Content-Type: application/json' -d '{"parts":[]}' | jq
   ```
4. Wrong ETag on a fresh upload → **422 `UPLOAD_INCOMPLETE`** with `missingParts`:
   ```bash
   curl -s -b $COOKIE -X POST $API/uploads/$P/complete -H 'Content-Type: application/json' \
     -d '{"parts":[{"partNumber":1,"etag":"wrong"}]}' | jq
   ```
5. Fake video → **422 `VIDEO_UNREADABLE`**, project becomes `REJECTED`:
   ```bash
   echo "hello" > /tmp/fake.mp4    # then run 01 + part upload + 03 with this file
   ```
6. Two `complete` calls at the same moment → one **200**, one **409 `REQUEST_IN_PROGRESS`**:
   ```bash
   for i in 1 2; do curl -s -b $COOKIE -X POST $API/uploads/$P/complete \
     -H 'Content-Type: application/json' -d "{\"parts\":$PARTS_JSON}" | jq -c '.project.status // .error.code' & done; wait
   ```
