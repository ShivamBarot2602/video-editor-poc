# 14 — Get render (status polling)

```
GET /api/smartcrop/projects/{projectId}/renders/{renderId}
```

Returns one render. Poll it **every 5 s** after [13](13-renders-create.md).
While the render isn't finished, each call (at most once per 3 s) asks Step
Functions for the latest state:

| Pipeline | Render becomes |
|---|---|
| running, planning states | `QUEUED`, `stage: "PLANNING"` |
| running, render states | `RENDERING`, `stage: "ENCODING"` |
| succeeded + one MP4 in the output folder | `SUCCEEDED` with `output` (signed URLs) |
| succeeded but no MP4 | `FAILED` — `OUTPUT_MISSING` |
| failed in Plan | `FAILED` — `PLAN_FAILED` |
| failed in Render | `FAILED` — `RENDER_FAILED` |
| other failure | `FAILED` — `PIPELINE_FAILED` |
| timed out | `FAILED` — `PIPELINE_TIMED_OUT` |
| stopped after cancel | `CANCELLED` |
| stopped from the AWS console | `FAILED` — `PIPELINE_ABORTED` |

When it finishes, the project's `activeRenderId` is cleared.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |
| `renderId` | `rnd_` + 26 lowercase letters/digits |

No body.

---

## curl

```bash
curl -s -b $COOKIE $API/projects/$P/renders/$R | jq

# poll until finished (Ctrl-C to stop)
while true; do
  curl -s -b $COOKIE $API/projects/$P/renders/$R | jq -c '{status: .render.status, stage: .render.stage, error: .render.error.code}'
  sleep 5
done
```

---

## Postman

Collection request: **4 Render → 14 Get render (poll)**

| Tab | Set to |
|---|---|
| Method | `GET` |
| URL | `{{api}}/projects/{{projectId}}/renders/{{renderId}}` |
| Headers | none |
| Body | none |
| Scripts → Post-response | logs status / stage / error code / downloadUrl in the Console |

Click **Send** every ~5 s until `render.status` is `SUCCEEDED`, then paste `output.url` into a browser to watch it.

---

## Success — `200 OK`

Running:

```json
{
  "render": {
    "renderId": "rnd_01m5kmh5etz15fq5j5e3kxm1xr",
    "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
    "status": "RENDERING",
    "editVersion": 2,
    "aspect": "1:1",
    "layouts": ["split"],
    "outputDurationMs": 63000,
    "stage": "ENCODING",
    "createdAt": "2026-10-23T05:42:52.634Z",
    "startedAt": "2026-10-23T05:42:52.634Z",
    "finishedAt": null,
    "elapsedMs": 84210,
    "output": null,
    "error": null,
    "cancelRequestedAt": null
  }
}
```

Succeeded:

```json
{
  "render": {
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
      "url": "https://<OUT_BUCKET>.s3.us-east-1.amazonaws.com/prj_01m5kmh5d61hkeay5y9cca8k24/renders/rnd_01m5kmh5etz15fq5j5e3kxm1xr/1x1_split.mp4?X-Amz-…&response-content-type=video%2Fmp4&x-id=GetObject",
      "downloadUrl": "https://<OUT_BUCKET>.s3.us-east-1.amazonaws.com/prj_01m5kmh5d61hkeay5y9cca8k24/renders/rnd_01m5kmh5etz15fq5j5e3kxm1xr/1x1_split.mp4?X-Amz-…&response-content-disposition=attachment%3B%20filename%2A%3DUTF-8%27%27Podcast%2520EP12%2520%25281x1%2529.mp4&response-content-type=video%2Fmp4&x-id=GetObject",
      "fileName": "Podcast EP12 (1x1).mp4",
      "sizeBytes": 18834221,
      "width": 1080,
      "height": 1080,
      "urlsExpireAt": "2026-10-23T06:44:58.636Z"
    },
    "error": null,
    "cancelRequestedAt": null
  }
}
```

- `output.url` — play in a `<video>` tag.
- `output.downloadUrl` — browser downloads it as `fileName`.
- Both are signed fresh on every GET and expire at `urlsExpireAt` (1 h).

Failed:

```json
{
  "render": {
    "renderId": "rnd_01m5kmh5etz15fq5j5e3kxm1xr",
    "status": "FAILED",
    "stage": null,
    "finishedAt": "2026-10-23T05:44:58.636Z",
    "output": null,
    "error": {
      "code": "RENDER_FAILED",
      "message": "We couldn't create the video. Please try saving again.",
      "failedStage": "RENDER"
    },
    "…": "rest of the Render object"
  }
}
```

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad project or render id |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project |
| 404 | `RENDER_NOT_FOUND` | `null` | no such render in this project |
| 502 | `UPSTREAM_ERROR` | `{ "service": "dynamodb" }` | only if reading fails. If the AWS status check fails you still get **200** with the stored status |

```json
{
  "error": { "code": "RENDER_NOT_FOUND", "message": "Render not found.", "details": null }
}
```

---

## How to test

1. Right after [13](13-renders-create.md), run the poll loop:
   `QUEUED/PLANNING → RENDERING/ENCODING → SUCCEEDED`.
2. Open `output.url` in a browser → plays. Open `output.downloadUrl` → downloads as `Podcast EP12 (1x1).mp4`.
3. Check the video: right size (e.g. 1080×1080 for 1:1) and length ≈ `outputDurationMs`.
4. [06 Get project](06-projects-get.md) → `activeRenderId: null`, `lastRender.status: "SUCCEEDED"`.
5. Negative:

```bash
curl -s -b $COOKIE $API/projects/$P/renders/rnd_00000000000000000000000000 | jq   # 404 RENDER_NOT_FOUND
curl -s -b $COOKIE $API/projects/$P/renders/abc | jq                             # 400
```
