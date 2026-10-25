# 04 — Cancel upload

```
DELETE /api/smartcrop/uploads/{projectId}
```

Stops an upload that hasn't been completed: aborts the S3 multipart upload,
deletes any partial file, and marks the project `UPLOAD_ABORTED`. The project
record is kept — remove it with [09 — Delete project](09-projects-delete.md).

**Needs:** project in `UPLOADING`.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

No body.

---

## curl

```bash
curl -s -b $COOKIE -X DELETE $API/uploads/$P -w 'HTTP %{http_code}\n'
```

---

## Postman

Collection request: **1 Upload → 04 Cancel upload**

| Tab | Set to |
|---|---|
| Method | `DELETE` |
| URL | `{{api}}/uploads/{{projectId}}` |
| Headers | none |
| Body | none |

Expect **204** (empty body). Only meaningful on an upload you did **not** complete — run **01 Create upload** first (it overwrites `projectId`), then this.

---

## Success — `204 No Content`

Empty body. Afterwards [06 — Get project](06-projects-get.md) shows:

```json
{
  "project": {
    "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
    "status": "UPLOAD_ABORTED",
    "processing": null,
    "…": "rest of the Project object"
  }
}
```

Calling it again (or on an `UPLOAD_EXPIRED` project) also returns **204**.

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad project id |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project |
| 409 | `UPLOAD_NOT_ACTIVE` | `{ "status": "PROCESSING" }` | upload already completed (or `REJECTED`) |
| 409 | `REQUEST_IN_PROGRESS` | `null` | a `complete` call is running right now |
| 502 | `UPSTREAM_ERROR` | `{ "service": "s3" \| "dynamodb" }` | AWS failed — status unchanged, try again |

```json
{
  "error": {
    "code": "UPLOAD_NOT_ACTIVE",
    "message": "This upload is no longer active.",
    "details": { "status": "PROCESSING" }
  }
}
```

---

## How to test

1. Create a new upload with [01](01-uploads-create.md) (don't complete it).
2. Cancel → **204**.
3. [06](06-projects-get.md) → `status: "UPLOAD_ABORTED"`.
4. Cancel again → **204** (idempotent).
5. [03 Complete](03-uploads-complete.md) on it → **409 `UPLOAD_NOT_ACTIVE`** with `status: "UPLOAD_ABORTED"`.
6. Cancel a project that was already completed → **409 `UPLOAD_NOT_ACTIVE`**.
