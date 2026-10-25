# 11 — Save edit (autosave)

```
PUT /api/smartcrop/projects/{projectId}/edit
```

Saves the whole edit list. The editor calls this ~1 s after the user stops
changing things (one request in flight at a time). If nothing changed, the
version stays the same (`changed: false`).

- Saving is allowed while a render is running (each render uses its own frozen copy).
- Saving is allowed even when the pipeline `edit` feature is off — that only limits
  [preview](12-preview-plan.md) and [render](13-renders-create.md).
- Last write wins (no cross-tab conflict check in the POC).

**Needs:** project `READY`.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

Body — `{ "document": <edit list> }`, nothing else:

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

A real edit (cut + reorder + per-clip layout) — needs the pipeline `edit`
feature to be previewed/rendered, but always saves:

```json
{
  "document": {
    "schemaVersion": 1,
    "aspect": "9:16",
    "defaultLayout": "fill",
    "options": { "background": "#112233", "fallbackLayout": "fit" },
    "clips": [
      { "id": "c_3", "sourceStartMs": 35000, "sourceEndMs": 50000, "layout": "split" },
      { "id": "c_1", "sourceStartMs": 0, "sourceEndMs": 12000, "layout": null }
    ]
  }
}
```

Full field rules: [README §4.3](README.md#43-edit-document-the-edit-list).
`sourceEndMs` must be ≤ the video's `durationMs` (63000 in these examples — use your video's value).

---

## curl

```bash
# identity edit, different aspect/layout (works with every pipeline feature set)
curl -s -b $COOKIE -X PUT $API/projects/$P/edit \
  -H 'Content-Type: application/json' \
  -d '{"document":{"schemaVersion":1,"aspect":"1:1","defaultLayout":"split","options":{"background":"blur","fallbackLayout":"fill"},"clips":[{"id":"c_1","sourceStartMs":0,"sourceEndMs":63000,"layout":null}]}}' | jq

# take the current edit and change one thing, using jq
DOC=$(curl -s -b $COOKIE $API/projects/$P/edit | jq -c '.document | .aspect="1:1" | .defaultLayout="split"')
curl -s -b $COOKIE -X PUT $API/projects/$P/edit \
  -H 'Content-Type: application/json' -d "{\"document\":$DOC}" | jq
```

---

## Postman

Collection request: **3 Edit → 11 Save edit**

| Tab | Set to |
|---|---|
| Method | `PUT` |
| URL | `{{api}}/projects/{{projectId}}/edit` |
| Headers | `Content-Type: application/json` (already set in the collection) |
| Body | see below |
| Scripts → Post-response | saves the new `editVersion`; logs `version` and `changed` |

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

`{{durationMs}}` is filled from 03 / 06 / 07 (Postman underlines it as invalid JSON — ignore that).
Send twice: first `changed: true`, second `changed: false`. To test other edits,
replace the body with any example from this page.

---

## Success — `200 OK`

Changed:

```json
{
  "version": 2,
  "updatedAt": "2026-10-23T05:42:52.629Z",
  "changed": true,
  "outputDurationMs": 63000,
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

Same document sent again:

```json
{
  "version": 2,
  "updatedAt": "2026-10-23T05:42:52.629Z",
  "changed": false,
  "outputDurationMs": 63000,
  "document": { "…": "unchanged document" }
}
```

The returned `document` is normalised: missing `options` are filled with
`"blur"` / `"fill"`, missing clip `layout` becomes `null`, clip order is kept exactly.

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | wrong shape: bad aspect/layout name, non-integer ms, empty `clips`, unknown field, bad colour |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project |
| 409 | `INVALID_STATE` | `{ "status", "allowed": ["READY"] }` | project not `READY` |
| 409 | `REQUEST_IN_PROGRESS` | `null` | the version kept changing during the save (retry) |
| 413 | `PAYLOAD_TOO_LARGE` | `null` | body > 1 MiB |
| 422 | `EDIT_INVALID` | `{ "issues": [{ "path", "rule", "message" }] }` | right shape but breaks a rule (all problems listed at once) |
| 502 | `UPSTREAM_ERROR` | `{ "service" }` | AWS failed |

`EDIT_INVALID` rules:

| `rule` | Meaning | `path` example |
|---|---|---|
| `LAYOUT_NOT_SUPPORTED` | layout not allowed for the aspect | `defaultLayout`, `clips.0.layout` |
| `CLIP_ID_DUPLICATE` | two clips share an id | `clips.4.id` |
| `CLIP_RANGE_INVALID` | not `0 ≤ start < end ≤ durationMs` | `clips.2.sourceEndMs` |
| `CLIP_TOO_SHORT` | clip shorter than 200 ms | `clips.7` |
| `CLIPS_OVERLAP` | two clips share source time (end is exclusive, so `0–10000` + `10000–20000` is fine) | `clips.3` |
| `TOO_MANY_CLIPS` | more than 500 clips | `clips` |
| `OUTPUT_TOO_SHORT` | total length under 1000 ms | `clips` |

Examples:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid.",
    "details": {
      "issues": [
        { "path": "document.aspect", "message": "Must be one of 9:16, 4:5, 1:1, 16:9." },
        { "path": "document.clips.0.sourceEndMs", "message": "Must be an integer ≥ 0." }
      ]
    }
  }
}
```

```json
{
  "error": {
    "code": "EDIT_INVALID",
    "message": "The edit breaks one or more rules.",
    "details": {
      "issues": [
        { "path": "clips.0.layout", "rule": "LAYOUT_NOT_SUPPORTED", "message": "The four layout is not available for 4:5." },
        { "path": "clips.1.id", "rule": "CLIP_ID_DUPLICATE", "message": "Clip id \"a\" is used more than once." },
        { "path": "clips.1.sourceEndMs", "rule": "CLIP_RANGE_INVALID", "message": "Clip ends after the video (63000 ms)." }
      ]
    }
  }
}
```

---

## How to test

1. Save the identity 1:1 split body above → **200**, `changed: true`, `version` +1.
2. Send exactly the same body → **200**, `changed: false`, same version.
3. Save the cut + reorder body → **200** (saving always works); [10](10-edit-get.md) shows it.
4. Negative:

```bash
# 400 — aspect that doesn't exist
curl -s -b $COOKIE -X PUT $API/projects/$P/edit -H 'Content-Type: application/json' \
  -d '{"document":{"schemaVersion":1,"aspect":"2:3","defaultLayout":"fill","clips":[{"id":"a","sourceStartMs":0,"sourceEndMs":5000,"layout":null}]}}' | jq

# 400 — empty clips
curl -s -b $COOKIE -X PUT $API/projects/$P/edit -H 'Content-Type: application/json' \
  -d '{"document":{"schemaVersion":1,"aspect":"9:16","defaultLayout":"fill","clips":[]}}' | jq

# 422 — three problems at once (layout, duplicate id, past the end)
curl -s -b $COOKIE -X PUT $API/projects/$P/edit -H 'Content-Type: application/json' \
  -d '{"document":{"schemaVersion":1,"aspect":"4:5","defaultLayout":"fill","clips":[{"id":"a","sourceStartMs":0,"sourceEndMs":5000,"layout":"four"},{"id":"a","sourceStartMs":6000,"sourceEndMs":99999999,"layout":null}]}}' | jq

# 422 — overlap
curl -s -b $COOKIE -X PUT $API/projects/$P/edit -H 'Content-Type: application/json' \
  -d '{"document":{"schemaVersion":1,"aspect":"9:16","defaultLayout":"fill","clips":[{"id":"a","sourceStartMs":0,"sourceEndMs":10000,"layout":null},{"id":"b","sourceStartMs":9999,"sourceEndMs":20000,"layout":null}]}}' | jq
```
