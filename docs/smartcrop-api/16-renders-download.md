# 16 — Download render

```
GET /api/smartcrop/projects/{projectId}/renders/{renderId}/download
```

Redirects (**302**) to a freshly signed download URL of the finished MP4. Meant
for curl, scripts and other backends — the browser can simply use
`output.downloadUrl` from [14](14-renders-get.md).

**Needs:** render `SUCCEEDED`.

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
# see the redirect
curl -s -b $COOKIE -o /dev/null -D - $API/projects/$P/renders/$R/download

# follow it and save the file
curl -s -b $COOKIE -L -o render.mp4 $API/projects/$P/renders/$R/download
ls -lh render.mp4
ffprobe -v error -show_entries stream=width,height -show_entries format=duration render.mp4
```

---

## Postman

Collection request: **4 Render → 16 Download render**

| Tab | Set to |
|---|---|
| Method | `GET` |
| URL | `{{api}}/projects/{{projectId}}/renders/{{renderId}}/download` |
| Headers | none |
| Body | none |

Postman follows the 302 automatically and receives the MP4:

- To **save the file**: click the arrow next to **Send** → **Send and Download** → choose where to save.
- To **see the 302** itself: request **Settings** tab → turn off **Automatically follow redirects**,
  then Send → status `302`, Headers tab shows `Location` and `Cache-Control: no-store`.

---

## Success — `302 Found`

No body. Headers:

```
HTTP/1.1 302 Found
Cache-Control: no-store
Location: https://<OUT_BUCKET>.s3.us-east-1.amazonaws.com/prj_01m5kmh5d61hkeay5y9cca8k24/renders/rnd_01m5kmh5etz15fq5j5e3kxm1xr/1x1_split.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&…&response-content-disposition=attachment%3B%20filename%2A%3DUTF-8%27%27Podcast%2520EP12%2520%25281x1%2529.mp4&response-content-type=video%2Fmp4&x-id=GetObject
```

Following the `Location` gives the MP4 (S3 answers 200, `Content-Disposition: attachment; filename*=UTF-8''Podcast%20EP12%20%281x1%29.mp4`).

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad id |
| 404 | `PROJECT_NOT_FOUND` / `RENDER_NOT_FOUND` | `null` | no such project / render |
| 409 | `OUTPUT_NOT_READY` | `{ "status": "RENDERING" }` | render isn't `SUCCEEDED` (still running, failed or cancelled) |
| 502 | `UPSTREAM_ERROR` | `{ "service" }` | AWS failed |

```json
{
  "error": {
    "code": "OUTPUT_NOT_READY",
    "message": "The video is not ready yet.",
    "details": { "status": "RENDERING" }
  }
}
```

---

## How to test

1. While the render is still running → **409 `OUTPUT_NOT_READY`**.
2. After `SUCCEEDED` → **302** with `Cache-Control: no-store`; `-L` saves the MP4.
3. `ffprobe` the file: width/height = `output.width`/`output.height`,
   duration ≈ `outputDurationMs`, file size = `output.sizeBytes`.
