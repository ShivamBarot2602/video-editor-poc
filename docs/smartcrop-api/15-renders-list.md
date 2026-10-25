# 15 — List renders (history)

```
GET /api/smartcrop/projects/{projectId}/renders
```

All renders of a project, newest first, paged. Only the currently active render
is refreshed from AWS; finished renders come with freshly signed output URLs.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

Query (all optional):

| Query | Rule | Default |
|---|---|---|
| `limit` | integer 1–100 | `20` |
| `cursor` | `nextCursor` from the previous page | — |
| `status` | comma list of `QUEUED`, `RENDERING`, `SUCCEEDED`, `FAILED`, `CANCELLED` | all |

---

## curl

```bash
curl -s -b $COOKIE "$API/projects/$P/renders?limit=20" | jq

# only successful ones
curl -s -b $COOKIE "$API/projects/$P/renders?status=SUCCEEDED" | jq '.items[] | {renderId, aspect, url: .output.url}'

# next page
CURSOR=$(curl -s -b $COOKIE "$API/projects/$P/renders?limit=1" | jq -r .nextCursor)
curl -s -b $COOKIE "$API/projects/$P/renders?limit=1&cursor=$CURSOR" | jq
```

---

## Postman

Collection request: **4 Render → 15 List renders**

| Tab | Set to |
|---|---|
| Method | `GET` |
| URL | `{{api}}/projects/{{projectId}}/renders` |
| Params | `limit` = `20`; tick `status` (e.g. `SUCCEEDED`) or `cursor` to use them |
| Headers | none |
| Body | none |

---

## Success — `200 OK`

```json
{
  "items": [
    {
      "renderId": "rnd_01m5kmh5etz15fq5j5e3kxm1xr",
      "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
      "status": "SUCCEEDED",
      "editVersion": 2,
      "aspect": "1:1",
      "layouts": ["split"],
      "outputDurationMs": 63000,
      "stage": null,
      "createdAt": "2026-10-23T05:42:52.634Z",
      "startedAt": "2026-10-23T05:42:52.634Z",
      "finishedAt": "2026-10-23T05:44:58.636Z",
      "elapsedMs": 126002,
      "output": {
        "url": "https://<OUT_BUCKET>.s3.us-east-1.amazonaws.com/prj_…/renders/rnd_…/1x1_split.mp4?…",
        "downloadUrl": "https://<OUT_BUCKET>.s3.us-east-1.amazonaws.com/prj_…/renders/rnd_…/1x1_split.mp4?…&response-content-disposition=attachment…",
        "fileName": "Podcast EP12 (1x1).mp4",
        "sizeBytes": 18834221,
        "width": 1080,
        "height": 1080,
        "urlsExpireAt": "2026-10-23T06:44:58.636Z"
      },
      "error": null,
      "cancelRequestedAt": null
    }
  ],
  "nextCursor": null
}
```

- `items` — [Render objects](README.md#44-render-object), newest first.
- `nextCursor` — `null` on the last page. No renders → `{ "items": [], "nextCursor": null }`.

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad id, `limit`, `status` or `cursor` |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project |
| 502 | `UPSTREAM_ERROR` | `{ "service" }` | AWS failed |

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid.",
    "details": {
      "issues": [{ "path": "status", "message": "Unknown status. Allowed: QUEUED, RENDERING, SUCCEEDED, FAILED, CANCELLED." }]
    }
  }
}
```

---

## How to test

1. Render the same project twice (e.g. 9:16 fill, then 1:1 split) → 2 items, newest first; the first render's output is untouched.
2. `?limit=1` → 1 item + `nextCursor`; follow it → the other.
3. `?status=READY` → **400** (that's a project status, not a render status).
