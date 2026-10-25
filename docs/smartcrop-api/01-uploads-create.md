# 01 — Create upload

```
POST /api/smartcrop/uploads
```

Creates a **project** (status `UPLOADING`) and an S3 multipart upload, and
returns one presigned URL per part. The browser then `PUT`s the file bytes
straight to S3 — the file never goes through our server.

**Needs:** login cookie ([README §2](README.md#2-terminal-setup-every-new-terminal)).
**Next:** upload the parts, then [03 — Complete upload](03-uploads-complete.md).

---

## Request body

```json
{
  "fileName": "Podcast EP12.mp4",
  "contentType": "video/mp4",
  "sizeBytes": 10582938,
  "title": "Podcast EP12",
  "initialAspect": "9:16",
  "initialLayout": "fill"
}
```

| Field | Required | Rule |
|---|---|---|
| `fileName` | yes | 1–255 chars, no `/`, `\` or control characters. Extension must be `.mp4`, `.m4v`, `.mov`, `.webm` |
| `contentType` | yes | must match the extension: `.mp4` → `video/mp4`; `.m4v` → `video/x-m4v` or `video/mp4`; `.mov` → `video/quicktime`; `.webm` → `video/webm` |
| `sizeBytes` | yes | exact file size in bytes, integer ≥ 1, ≤ 4 GiB (`UPLOAD_MAX_BYTES`) |
| `title` | no | 1–200 chars or `null`. Default: file name without extension |
| `initialAspect` | no | `"9:16"` (default), `"4:5"`, `"1:1"`, `"16:9"` |
| `initialLayout` | no | `"fill"` (default), `"fit"`, `"split"`, `"three"`, `"four"` — must be allowed for the aspect |

No other fields are allowed.

Minimal body:

```json
{ "fileName": "Podcast EP12.mp4", "contentType": "video/mp4", "sizeBytes": 10582938 }
```

---

## curl

```bash
FILE=~/Videos/test.mp4
SIZE=$(stat -f%z "$FILE")          # macOS; on Linux: stat -c%s "$FILE"

RES=$(curl -s -b $COOKIE -X POST $API/uploads \
  -H 'Content-Type: application/json' \
  -d "{\"fileName\":\"$(basename "$FILE")\",\"contentType\":\"video/mp4\",\"sizeBytes\":$SIZE,\"initialAspect\":\"9:16\",\"initialLayout\":\"fill\"}")

echo "$RES" | jq
export P=$(echo "$RES" | jq -r .project.projectId)
echo "project: $P"
```

---

## Postman

Collection request: **1 Upload → 01 Create upload**

| Tab | Set to |
|---|---|
| Method | `POST` |
| URL | `{{api}}/uploads` |
| Headers | `Content-Type: application/json` (already set in the collection) |
| Body | see below |
| Scripts → Post-response | saves `projectId`, `partCount`, `partUrl` (URL of part 1) |

Body → **raw** → **JSON**:

```json
{
  "fileName": "{{fileName}}",
  "contentType": "{{contentType}}",
  "sizeBytes": {{fileSizeBytes}},
  "initialAspect": "9:16",
  "initialLayout": "fill"
}
```

Before sending: set `fileName`, `contentType`, `fileSizeBytes` in the environment
([README §2b](README.md#2b-postman-setup-alternative-to-curl)). Expect **201**.

### Then: upload the file to S3 — request **1 Upload → 01b Upload part 1 (PUT to S3)**

| Tab | Set to |
|---|---|
| Method | `PUT` |
| URL | `{{partUrl}}` (filled by 01) |
| Authorization | **No Auth** |
| Headers | none — don't add any |
| Body | **binary** → **Select File** → your video file |
| Scripts → Post-response | saves the `ETag` response header as `etag` (quotes stripped) |

Expect **200** with an empty body and an `ETag` header (Headers tab of the response).
A **403** means `partUrl` expired → run [02](02-uploads-parts.md), then 01b again.

Postman only handles the 1-part case comfortably — keep the file ≤ 16 MiB
(`partCount` = 1). For bigger files use the curl loop below.

---

## Success — `201 Created`

```json
{
  "project": {
    "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
    "title": "Podcast EP12",
    "status": "UPLOADING",
    "createdAt": "2026-10-23T05:42:52.592Z",
    "updatedAt": "2026-10-23T05:42:52.592Z",
    "initial": { "aspect": "9:16", "layout": "fill" },
    "source": {
      "fileName": "Podcast EP12.mp4",
      "contentType": "video/mp4",
      "sizeBytes": 10582938,
      "durationMs": null,
      "width": null,
      "height": null,
      "fps": null,
      "hasAudio": null,
      "videoCodec": null
    },
    "upload": {
      "partCount": 1,
      "partSizeBytes": 16777216,
      "expiresAt": "2026-10-24T05:42:52.592Z",
      "completedAt": null
    },
    "processing": null,
    "edit": null,
    "activeRenderId": null,
    "lastRender": null,
    "lastSyncedAt": null
  },
  "upload": {
    "partSizeBytes": 16777216,
    "partCount": 1,
    "parts": [
      {
        "partNumber": 1,
        "url": "https://<IN_BUCKET>.s3.us-east-1.amazonaws.com/prj_01m5kmh5d61hkeay5y9cca8k24/source.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&…&partNumber=1&uploadId=…&x-id=UploadPart"
      }
    ],
    "urlsExpireAt": "2026-10-23T06:42:52.593Z",
    "expiresAt": "2026-10-24T05:42:52.592Z"
  }
}
```

- `upload.parts[n].url` — `PUT` part *n* here. Valid until `urlsExpireAt` (1 h).
- `upload.expiresAt` — finish the upload before this (24 h) or the project becomes `UPLOAD_EXPIRED`.
- Part *n* = bytes `[(n-1) × partSizeBytes, min(n × partSizeBytes, sizeBytes))`.
  Files ≤ 16 MiB are always **1 part**.

---

## Uploading the parts (the step between 01 and 03)

The PUT goes to **S3**, not to our API — no cookie, **no `Content-Type` header**.
Keep the `ETag` response header of every part; you need it in step 03.

**Single part (file ≤ 16 MiB):**

```bash
URL=$(echo "$RES" | jq -r '.upload.parts[0].url')
ETAG=$(curl -s -D - -o /dev/null -T "$FILE" "$URL" | grep -i '^etag:' | cut -d' ' -f2 | tr -d '\r')
echo "ETag: $ETAG"                   # e.g. "9b2cf535f27731c974343645a3985328"
export PARTS_JSON="[{\"partNumber\":1,\"etag\":$ETAG}]"
```

**Many parts (file > 16 MiB):**

```bash
PART_SIZE=$(echo "$RES" | jq -r .upload.partSizeBytes)
rm -rf /tmp/sc-parts && mkdir /tmp/sc-parts
split -b $PART_SIZE "$FILE" /tmp/sc-parts/part_
PARTS_JSON="["
N=1
for CHUNK in /tmp/sc-parts/part_*; do
  URL=$(echo "$RES" | jq -r ".upload.parts[$((N-1))].url")
  ETAG=$(curl -s -D - -o /dev/null -T "$CHUNK" "$URL" | grep -i '^etag:' | cut -d' ' -f2 | tr -d '\r')
  PARTS_JSON="$PARTS_JSON{\"partNumber\":$N,\"etag\":$ETAG},"
  N=$((N+1))
done
export PARTS_JSON="${PARTS_JSON%,}]"
echo "$PARTS_JSON"
```

A successful part PUT returns **HTTP 200** from S3 with an `ETag` header.
A **403** from S3 means the URL expired → get new ones with [02](02-uploads-parts.md).

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | missing/invalid field, unknown field, `../x.mp4` |
| 415 | `UNSUPPORTED_VIDEO_TYPE` | `{ "allowed": [".mp4", ".m4v", ".mov", ".webm"] }` | wrong extension, or content type doesn't match it |
| 413 | `FILE_TOO_LARGE` | `{ "maxBytes": 4294967296 }` | `sizeBytes` over the limit |
| 422 | `LAYOUT_NOT_SUPPORTED` | `{ "aspect", "layout", "supported": [] }` | e.g. `16:9` + `three` |
| 502 | `UPSTREAM_ERROR` | `{ "service": "s3" \| "dynamodb" }` | AWS failed |

If several rules fail, the order is: 400 → 415 → 413 → 422.

Examples:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid.",
    "details": {
      "issues": [
        { "path": "fileName", "message": "Must not contain / \\ or control characters." },
        { "path": "owner", "message": "Unknown field." }
      ]
    }
  }
}
```

```json
{
  "error": {
    "code": "UNSUPPORTED_VIDEO_TYPE",
    "message": "This file type is not supported.",
    "details": { "allowed": [".mp4", ".m4v", ".mov", ".webm"] }
  }
}
```

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "This file is too large.",
    "details": { "maxBytes": 4294967296 }
  }
}
```

```json
{
  "error": {
    "code": "LAYOUT_NOT_SUPPORTED",
    "message": "The three layout is not available for 16:9.",
    "details": { "aspect": "16:9", "layout": "three", "supported": ["fill", "fit", "split"] }
  }
}
```

---

## How to test

1. Run the curl → **201**, `project.status = "UPLOADING"`, `upload.parts` has `partCount` URLs.
2. Upload the parts as above → each S3 PUT returns 200 + `ETag`.
3. Negative checks:

```bash
# 415 — extension and type don't match
curl -s -b $COOKIE -X POST $API/uploads -H 'Content-Type: application/json' \
  -d '{"fileName":"a.mp4","contentType":"video/webm","sizeBytes":100}' | jq

# 400 — path in the name + unknown field
curl -s -b $COOKIE -X POST $API/uploads -H 'Content-Type: application/json' \
  -d '{"fileName":"../../x.mp4","contentType":"video/mp4","sizeBytes":100,"owner":"me"}' | jq

# 413 — one byte over 4 GiB
curl -s -b $COOKIE -X POST $API/uploads -H 'Content-Type: application/json' \
  -d '{"fileName":"a.mp4","contentType":"video/mp4","sizeBytes":4294967297}' | jq

# 422 — layout not allowed for the aspect
curl -s -b $COOKIE -X POST $API/uploads -H 'Content-Type: application/json' \
  -d '{"fileName":"a.mp4","contentType":"video/mp4","sizeBytes":100,"initialAspect":"16:9","initialLayout":"three"}' | jq
```

4. `sizeBytes: 33554432` (exactly 2 × 16 MiB) → `partCount: 2` (no empty third part).
