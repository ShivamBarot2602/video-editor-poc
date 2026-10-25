# 02 — Refresh part URLs / resume an upload

```
POST /api/smartcrop/uploads/{projectId}/parts
```

Returns fresh presigned part URLs and the list of parts S3 already has. Use it
when part URLs expired (S3 answers 403) or after a page reload mid-upload.

**Needs:** project in `UPLOADING` (from [01](01-uploads-create.md)).

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

Body — choose one:

```json
{}
```
→ URLs for **every part S3 doesn't have yet** (the usual "resume" case).

```json
{ "partNumbers": [7, 8, 9] }
```
→ URLs for exactly these parts (re-uploading a part S3 already has is allowed).

| Field | Required | Rule |
|---|---|---|
| `partNumbers` | no | `null` / missing = all missing parts. Otherwise an array of 1–1000 integers, each between 1 and `partCount`. Duplicates are removed |

---

## curl

```bash
# all parts that are still missing
curl -s -b $COOKIE -X POST $API/uploads/$P/parts \
  -H 'Content-Type: application/json' -d '{}' | jq

# specific parts
curl -s -b $COOKIE -X POST $API/uploads/$P/parts \
  -H 'Content-Type: application/json' -d '{"partNumbers":[1]}' | jq
```

---

## Postman

Collection request: **1 Upload → 02 Refresh part URLs**

| Tab | Set to |
|---|---|
| Method | `POST` |
| URL | `{{api}}/uploads/{{projectId}}/parts` |
| Headers | `Content-Type: application/json` (already set in the collection) |
| Body | see below |
| Scripts → Post-response | if any part is still missing, saves its URL into `partUrl` (so 01b can be re-sent); logs uploaded / missing parts in the Console |

Body → **raw** → **JSON**:

```json
{}
```

For specific parts change the body to `{ "partNumbers": [1] }`.

---

## Success — `200 OK`

After part 1 of a 1-part upload was PUT, with body `{}`:

```json
{
  "partSizeBytes": 16777216,
  "partCount": 1,
  "uploadedParts": [
    { "partNumber": 1, "etag": "\"9b2cf535f27731c974343645a3985328\"", "sizeBytes": 10582938 }
  ],
  "parts": [],
  "urlsExpireAt": "2026-10-23T06:42:52.597Z",
  "expiresAt": "2026-10-24T05:42:52.592Z"
}
```

Before anything was uploaded (3-part file, body `{}`):

```json
{
  "partSizeBytes": 16777216,
  "partCount": 3,
  "uploadedParts": [],
  "parts": [
    { "partNumber": 1, "url": "https://<IN_BUCKET>.s3.us-east-1.amazonaws.com/prj_…/source.mp4?…&partNumber=1&uploadId=…&x-id=UploadPart" },
    { "partNumber": 2, "url": "https://<IN_BUCKET>.s3.us-east-1.amazonaws.com/prj_…/source.mp4?…&partNumber=2&uploadId=…&x-id=UploadPart" },
    { "partNumber": 3, "url": "https://<IN_BUCKET>.s3.us-east-1.amazonaws.com/prj_…/source.mp4?…&partNumber=3&uploadId=…&x-id=UploadPart" }
  ],
  "urlsExpireAt": "2026-10-23T06:42:52.597Z",
  "expiresAt": "2026-10-24T05:42:52.592Z"
}
```

| Field | Meaning |
|---|---|
| `uploadedParts` | parts S3 already holds, with their ETag (quoted) and size |
| `parts` | fresh URLs for the requested / missing parts |

If you re-upload a part, use the **new** ETag in step 03.

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad project id, bad `partNumbers`, part number > `partCount` |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project (or it is being deleted) |
| 409 | `UPLOAD_NOT_ACTIVE` | `{ "status": "PROCESSING" }` | project is no longer `UPLOADING` |
| 410 | `UPLOAD_EXPIRED` | `null` | past `expiresAt` (24 h), or S3 lost the multipart upload |
| 502 | `UPSTREAM_ERROR` | `{ "service": "s3" }` | AWS failed |

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid.",
    "details": { "issues": [{ "path": "partNumbers", "message": "Part 5 is out of range (1–1)." }] }
  }
}
```

```json
{
  "error": {
    "code": "UPLOAD_NOT_ACTIVE",
    "message": "This upload is no longer active.",
    "details": { "status": "PROCESSING" }
  }
}
```

```json
{
  "error": {
    "code": "UPLOAD_EXPIRED",
    "message": "This upload has expired. Please upload the file again.",
    "details": null
  }
}
```

---

## How to test

1. Right after [01](01-uploads-create.md), before uploading: body `{}` → `uploadedParts: []`, `parts` = all parts.
2. Upload part 1, call again with `{}` → part 1 moves to `uploadedParts`, `parts` no longer has it.
3. `{"partNumbers":[1]}` → a URL for part 1 even though it's uploaded.
4. Negative:

```bash
curl -s -b $COOKIE -X POST $API/uploads/$P/parts -H 'Content-Type: application/json' -d '{"partNumbers":[999]}' | jq   # 400
curl -s -b $COOKIE -X POST $API/uploads/prj_bad/parts -H 'Content-Type: application/json' -d '{}' | jq                 # 400
```

5. After [03](03-uploads-complete.md) succeeds, call it again → **409 `UPLOAD_NOT_ACTIVE`**.
