# 05 — List projects

```
GET /api/smartcrop/projects
```

Newest projects first, paged. Used for the "my videos" list. It does **not**
ask AWS for fresh processing status (use [06](06-projects-get.md) for that),
but an `UPLOADING` project past its 24 h expiry is returned (and saved) as
`UPLOAD_EXPIRED`. Projects being deleted are hidden.

---

## Request

No body. Query parameters (all optional):

| Query | Rule | Default |
|---|---|---|
| `limit` | integer 1–100 | `20` |
| `cursor` | the `nextCursor` from the previous page | — |
| `status` | comma list of `UPLOADING`, `PROCESSING`, `READY`, `FAILED`, `REJECTED`, `UPLOAD_ABORTED`, `UPLOAD_EXPIRED` | all |

No other query parameters are allowed.

---

## curl

```bash
# first page
curl -s -b $COOKIE "$API/projects?limit=20" | jq

# only READY + FAILED
curl -s -b $COOKIE "$API/projects?status=READY,FAILED" | jq '.items[] | {projectId, status, title}'

# next page
CURSOR=$(curl -s -b $COOKIE "$API/projects?limit=2" | jq -r .nextCursor)
curl -s -b $COOKIE "$API/projects?limit=2&cursor=$CURSOR" | jq
```

---

## Postman

Collection request: **2 Projects → 05 List projects**

| Tab | Set to |
|---|---|
| Method | `GET` |
| URL | `{{api}}/projects` |
| Params | `limit` = `20`; tick `status` (e.g. `READY,FAILED`) or `cursor` (paste `nextCursor`) to use them |
| Headers | none |
| Body | none |
| Scripts → Post-response | logs `nextCursor` in the Console |

---

## Success — `200 OK`

```json
{
  "items": [
    {
      "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
      "title": "Podcast EP12",
      "status": "READY",
      "createdAt": "2026-10-23T05:42:52.592Z",
      "updatedAt": "2026-10-23T05:42:52.619Z",
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
        "stage": null,
        "attempt": 1,
        "startedAt": "2026-10-23T05:42:52.601Z",
        "finishedAt": "2026-10-23T05:42:52.618Z",
        "elapsedMs": 17,
        "error": null,
        "retryable": false
      },
      "edit": { "version": 1, "updatedAt": "2026-10-23T05:42:52.619Z" },
      "activeRenderId": null,
      "lastRender": null,
      "lastSyncedAt": "2026-10-23T05:42:52.619Z"
    }
  ],
  "nextCursor": null
}
```

- `items` — [Project objects](README.md#42-project-object), newest first.
- `nextCursor` — pass as `?cursor=` for the next page; `null` on the last page.
- No projects → `{ "items": [], "nextCursor": null }` (200, not 404).

When a project has been rendered, `lastRender` is filled:

```json
"lastRender": {
  "renderId": "rnd_01m5kmh5etz15fq5j5e3kxm1xr",
  "status": "SUCCEEDED",
  "aspect": "1:1",
  "createdAt": "2026-10-23T05:42:52.634Z",
  "finishedAt": "2026-10-23T05:44:58.636Z"
}
```

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | `limit` not 1–100, unknown status, invalid cursor, unknown query param |
| 502 | `UPSTREAM_ERROR` | `{ "service": "dynamodb" }` | DynamoDB failed |

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid.",
    "details": {
      "issues": [
        { "path": "limit", "message": "Must be an integer from 1 to 100." },
        { "path": "status", "message": "Unknown status. Allowed: UPLOADING, PROCESSING, READY, FAILED, REJECTED, UPLOAD_ABORTED, UPLOAD_EXPIRED." }
      ]
    }
  }
}
```

---

## How to test

1. Create 3+ projects (step 01 is enough). `?limit=2` → 2 items + a `nextCursor`;
   follow the cursor → the rest, last `nextCursor` is `null`, no duplicates.
2. `?status=UPLOADING` → only uploading ones.
3. Negative:

```bash
curl -s -b $COOKIE "$API/projects?limit=0" | jq            # 400
curl -s -b $COOKIE "$API/projects?status=DONE" | jq        # 400
curl -s -b $COOKIE "$API/projects?cursor=garbage" | jq     # 400
```
