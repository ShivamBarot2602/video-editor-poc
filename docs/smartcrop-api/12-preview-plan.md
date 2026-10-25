# 12 — Preview plan

```
POST /api/smartcrop/projects/{projectId}/preview-plan
```

Builds the **crop plan** for an edit so the browser can preview it live: the
browser plays the video and draws the plan's crop windows on a canvas — no
video is rendered. Behind the scenes the server calls the Plan Lambda
synchronously.

- Results are **cached** per edit: the same edit again returns `cached: true`
  instantly (renaming clip ids doesn't change the cache key).
- 10 identical requests at once → only 1 Lambda call.
- First call after idle can take 5–10 s (Lambda cold start), later ~1 s.

**Needs:** project `READY`.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

Body — **exactly one** of these two forms:

**A. An unsaved edit** (the usual case while the user is editing):

```json
{
  "document": {
    "schemaVersion": 1,
    "aspect": "1:1",
    "defaultLayout": "split",
    "options": { "background": "blur", "fallbackLayout": "fill" },
    "clips": [
      { "id": "c_1", "sourceStartMs": 0, "sourceEndMs": 63000, "layout": null }
    ]
  }
}
```

**B. The saved edit, by version:**

```json
{ "editVersion": 2 }
```

| Field | Rule |
|---|---|
| `document` | an [edit list](README.md#43-edit-document-the-edit-list), same rules as [11](11-edit-save.md) |
| `editVersion` | integer ≥ 1, must equal the current saved version |

While the pipeline `edit` feature is **off**, the document must be the identity
edit (one full-length clip, `layout: null`). Aspect, default layout and options
can still be anything valid.

---

## curl

```bash
# A — unsaved document
curl -s -b $COOKIE -X POST $API/projects/$P/preview-plan \
  -H 'Content-Type: application/json' \
  -d '{"document":{"schemaVersion":1,"aspect":"1:1","defaultLayout":"split","options":{"background":"blur","fallbackLayout":"fill"},"clips":[{"id":"c_1","sourceStartMs":0,"sourceEndMs":63000,"layout":null}]}}' | jq

# B — current saved version
V=$(curl -s -b $COOKIE $API/projects/$P/edit | jq .version)
curl -s -b $COOKIE -X POST $API/projects/$P/preview-plan \
  -H 'Content-Type: application/json' -d "{\"editVersion\":$V}" | jq

# download the plan JSON it points to
PLAN_URL=$(curl -s -b $COOKIE -X POST $API/projects/$P/preview-plan \
  -H 'Content-Type: application/json' -d "{\"editVersion\":$V}" | jq -r .plan.url)
curl -s "$PLAN_URL" | jq '{canvas, analysis_fps, frames, segments: (.segments | length)}'
```

---

## Postman

Collection request: **3 Edit → 12a Preview plan (document)**

| Tab | Set to |
|---|---|
| Method | `POST` |
| URL | `{{api}}/projects/{{projectId}}/preview-plan` |
| Headers | `Content-Type: application/json` (already set in the collection) |
| Body | see below |
| Scripts → Post-response | logs `previewId` and `cached` |

Body → **raw** → **JSON**:

```json
{
  "document": {
    "schemaVersion": 1,
    "aspect": "1:1",
    "defaultLayout": "split",
    "options": { "background": "blur", "fallbackLayout": "fill" },
    "clips": [
      { "id": "c_1", "sourceStartMs": 0, "sourceEndMs": {{durationMs}}, "layout": null }
    ]
  }
}
```

Send it twice — the second response says `"cached": true`.

**12b Preview plan (editVersion)** — same URL and method, body:

```json
{
  "editVersion": {{editVersion}}
}
```

---

## Success — `200 OK`

```json
{
  "previewId": "5c7afdbd0d937fb3c5ac5650553fbe26",
  "cached": false,
  "aspect": "1:1",
  "defaultLayout": "split",
  "canvas": { "width": 1080, "height": 1080 },
  "analysisFps": 25,
  "frames": 1501,
  "outputDurationMs": 63000,
  "layoutFrames": { "split": 1501 },
  "plan": {
    "url": "https://<JOBS_BUCKET>.s3.us-east-1.amazonaws.com/prj_01m5kmh5d61hkeay5y9cca8k24/previews/5c7afdbd0d937fb3c5ac5650553fbe26/1x1_split.plan.json?X-Amz-…&response-content-type=application%2Fjson&x-id=GetObject",
    "sizeBytes": 2203
  },
  "urlsExpireAt": "2026-10-23T06:42:52.632Z",
  "warnings": []
}
```

| Field | Meaning |
|---|---|
| `previewId` | cache key of this edit (32 hex chars). `"initial"` = the plan made during processing (from [07](07-projects-editor.md)) |
| `cached` | `true` = returned from cache, no Lambda call |
| `canvas` | output size in pixels |
| `analysisFps`, `frames` | plan frame *f* = output time *f* × 40 ms |
| `layoutFrames` | how many frames actually use each layout |
| `plan.url` | signed URL of the plan JSON the browser draws from (can be a few MB for 30 min) |
| `warnings` | e.g. faces missing in some shots of a split layout → those shots fell back to fill |

Warning example:

```json
"warnings": [
  {
    "code": "LAYOUT_FALLBACK",
    "layout": "split",
    "fallbackFrames": 75,
    "message": "No faces in some shots; those use fill."
  }
]
```

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | both / neither of `document` and `editVersion`, bad document shape |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project |
| 409 | `INVALID_STATE` | `{ "status", "allowed": ["READY"] }` | project not `READY` |
| 409 | `EDIT_VERSION_CONFLICT` | `{ "currentVersion": 3 }` | `editVersion` isn't the current one |
| 422 | `EDIT_INVALID` | `{ issues }` | document breaks a rule (see [11](11-edit-save.md)) |
| 422 | `FEATURE_NOT_AVAILABLE` | `{ "feature": "edit" }` | cut/trim/reorder/per-clip layout while the pipeline `edit` feature is off |
| 422 | `PREVIEW_FAILED` | `null` | the planner couldn't plan this edit (nothing cached) |
| 429 | `PREVIEW_BUSY` | `{ "retryAfterMs": 1000 }` | 2 other previews for this project are already running, or Lambda is throttled — retry after 1 s |
| 502 | `UPSTREAM_ERROR` | `{ "service": "lambda" \| "s3" \| … }` | Lambda/AWS failed or returned something unexpected |
| 504 | `PREVIEW_TIMEOUT` | `null` | planner took > 30 s. Try again — a later identical call may hit the cache the Lambda filled |

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid.",
    "details": { "issues": [{ "path": "", "message": "Send exactly one of \"document\" or \"editVersion\"." }] }
  }
}
```

```json
{
  "error": {
    "code": "EDIT_VERSION_CONFLICT",
    "message": "The edit has changed since this version.",
    "details": { "currentVersion": 3 }
  }
}
```

```json
{
  "error": {
    "code": "FEATURE_NOT_AVAILABLE",
    "message": "This kind of edit is not available yet.",
    "details": { "feature": "edit" }
  }
}
```

```json
{
  "error": {
    "code": "PREVIEW_BUSY",
    "message": "Too many previews are being built. Try again in a moment.",
    "details": { "retryAfterMs": 1000 }
  }
}
```

```json
{
  "error": { "code": "PREVIEW_FAILED", "message": "We couldn't build a preview for this edit.", "details": null }
}
```

```json
{
  "error": { "code": "PREVIEW_TIMEOUT", "message": "Building the preview took too long. Try again.", "details": null }
}
```

---

## How to test

1. Form A curl → **200**, `cached: false` (takes a few seconds the first time).
2. Same curl again → **200**, `cached: true`, same `previewId`, returns instantly.
3. Same document with `"id":"zz"` instead of `"c_1"` → still `cached: true`, same `previewId`.
4. Open `plan.url` → the plan JSON downloads.
5. Form B with the current version → **200**; with an old version → **409 `EDIT_VERSION_CONFLICT`**.
6. With the `edit` feature off, a cut → **422 `FEATURE_NOT_AVAILABLE`**:

```bash
curl -s -b $COOKIE -X POST $API/projects/$P/preview-plan -H 'Content-Type: application/json' \
  -d '{"document":{"schemaVersion":1,"aspect":"9:16","defaultLayout":"fill","clips":[{"id":"a","sourceStartMs":0,"sourceEndMs":10000,"layout":null}]}}' | jq
```

7. Both forms at once → **400**:

```bash
curl -s -b $COOKIE -X POST $API/projects/$P/preview-plan -H 'Content-Type: application/json' -d '{"editVersion":1,"document":{}}' | jq
```
