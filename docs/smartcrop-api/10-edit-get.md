# 10 — Get edit

```
GET /api/smartcrop/projects/{projectId}/edit
```

Returns the saved edit list (the clips, aspect and layouts the user chose) and
its version. Version 1 is created automatically when processing finishes: one
clip covering the whole video with the initial aspect/layout.

**Needs:** project `READY`.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

No body, no query.

---

## curl

```bash
curl -s -b $COOKIE $API/projects/$P/edit | jq
```

---

## Postman

Collection request: **3 Edit → 10 Get edit**

| Tab | Set to |
|---|---|
| Method | `GET` |
| URL | `{{api}}/projects/{{projectId}}/edit` |
| Headers | none |
| Body | none |
| Scripts → Post-response | saves `editVersion` |

---

## Success — `200 OK`

```json
{
  "version": 1,
  "updatedAt": "2026-10-23T05:42:52.619Z",
  "outputDurationMs": 63000,
  "document": {
    "schemaVersion": 1,
    "aspect": "9:16",
    "defaultLayout": "fill",
    "options": { "background": "blur", "fallbackLayout": "fill" },
    "clips": [
      { "id": "c_1", "sourceStartMs": 0, "sourceEndMs": 63000, "layout": null }
    ]
  }
}
```

| Field | Meaning |
|---|---|
| `version` | goes up by 1 on every real change ([11](11-edit-save.md)) |
| `outputDurationMs` | length of the final video = sum of clip lengths |
| `document` | the [edit list](README.md#43-edit-document-the-edit-list) |

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad project id |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project |
| 409 | `INVALID_STATE` | `{ "status", "allowed": ["READY"] }` | project not `READY` |
| 502 | `UPSTREAM_ERROR` | `{ "service" }` | AWS failed |

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "This can't be done while the item is PROCESSING.",
    "details": { "status": "PROCESSING", "allowed": ["READY"] }
  }
}
```

---

## How to test

1. Fresh READY project → `version: 1`, one clip `0 → durationMs`, `layout: null`.
2. After a save with [11](11-edit-save.md) → `version: 2` and your document.
3. On a `PROCESSING` project → **409 `INVALID_STATE`**.
