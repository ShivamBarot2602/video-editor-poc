# 13 — Create render (Save)

```
POST /api/smartcrop/projects/{projectId}/renders
```

The **Save** button. Turns the saved edit list into one MP4: freezes a copy of
the edit, then runs the pipeline from stage 4 (Plan) and stage 5 (Render on
Fargate). Returns at once with status `QUEUED`; poll
[14 — Get render](14-renders-get.md) every 5 s.

Only **one render at a time per project**.

UI flow: flush autosave ([11](11-edit-save.md) → version *n*) →
`POST /renders { "editVersion": n }` → poll → show/download `output`.

**Needs:** project `READY`, no other render running.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

Body:

```json
{ "editVersion": 2 }
```

| Field | Required | Rule |
|---|---|---|
| `editVersion` | no | integer ≥ 1. If given, must equal the current saved version — guarantees you render exactly what you saved. Omit (`{}`) to render the current version |

No other fields allowed.

---

## curl

```bash
V=$(curl -s -b $COOKIE $API/projects/$P/edit | jq .version)

RES=$(curl -s -b $COOKIE -X POST $API/projects/$P/renders \
  -H 'Content-Type: application/json' -d "{\"editVersion\":$V}" -D /tmp/sc-headers.txt)
echo "$RES" | jq
grep -i '^location' /tmp/sc-headers.txt

export R=$(echo "$RES" | jq -r .render.renderId)
echo "render: $R"
```

---

## Postman

Collection request: **4 Render → 13 Create render (Save)**

| Tab | Set to |
|---|---|
| Method | `POST` |
| URL | `{{api}}/projects/{{projectId}}/renders` |
| Headers | `Content-Type: application/json` (already set in the collection) |
| Body | see below |
| Scripts → Post-response | saves `renderId` |

Body → **raw** → **JSON**:

```json
{
  "editVersion": {{editVersion}}
}
```

Expect **202** (the `Location` header is in the response Headers tab). Send again right away → **409 `RENDER_IN_PROGRESS`**.

---

## Success — `202 Accepted`

Header:

```
Location: /api/smartcrop/projects/prj_01m5kmh5d61hkeay5y9cca8k24/renders/rnd_01m5kmh5etz15fq5j5e3kxm1xr
```

Body:

```json
{
  "render": {
    "renderId": "rnd_01m5kmh5etz15fq5j5e3kxm1xr",
    "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
    "status": "QUEUED",
    "editVersion": 2,
    "aspect": "1:1",
    "layouts": ["split"],
    "outputDurationMs": 63000,
    "stage": "PLANNING",
    "createdAt": "2026-10-23T05:42:52.634Z",
    "startedAt": "2026-10-23T05:42:52.634Z",
    "finishedAt": null,
    "elapsedMs": 0,
    "output": null,
    "error": null,
    "cancelRequestedAt": null
  }
}
```

| Field | Meaning |
|---|---|
| `layouts` | distinct layouts the video will use, sorted |
| `outputDurationMs` | final video length |
| `output` | `null` until `SUCCEEDED` |

The project now has `activeRenderId` = this render and `lastRender` filled.

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad project id, `editVersion` not an integer ≥ 1, extra field |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project |
| 409 | `INVALID_STATE` | `{ "status", "allowed": ["READY"] }` | project not `READY` |
| 409 | `RENDER_IN_PROGRESS` | `{ "renderId": "rnd_…" }` | a render is already queued/running — the UI should attach to that `renderId` |
| 409 | `EDIT_VERSION_CONFLICT` | `{ "currentVersion": 3 }` | `editVersion` isn't the current one |
| 422 | `EDIT_INVALID` | `{ issues }` | the stored edit no longer passes the rules (logged as a server error) |
| 422 | `FEATURE_NOT_AVAILABLE` | `{ "feature": "edit" }` | saved edit has cuts/reorder/per-clip layouts but the pipeline `edit` feature is off |
| 502 | `UPSTREAM_ERROR` | `{ "service": "stepfunctions" \| … }` | couldn't start the pipeline — the render is marked `FAILED` (`PIPELINE_FAILED`) and you can Save again |

```json
{
  "error": {
    "code": "RENDER_IN_PROGRESS",
    "message": "A render is already running for this project.",
    "details": { "renderId": "rnd_01m5kmh5etz15fq5j5e3kxm1xr" }
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

---

## How to test

1. Run the curl → **202**, `status: "QUEUED"`, `stage: "PLANNING"`, `Location` header set.
2. Run it again right away → **409 `RENDER_IN_PROGRESS`** with the first `renderId`.
3. Double-click simulation → one 202, one 409:
   ```bash
   for i in 1 2; do curl -s -b $COOKIE -X POST $API/projects/$P/renders \
     -H 'Content-Type: application/json' -d '{}' | jq -c '.render.renderId // .error' & done; wait
   ```
4. Old version → **409 `EDIT_VERSION_CONFLICT`**:
   ```bash
   curl -s -b $COOKIE -X POST $API/projects/$P/renders -H 'Content-Type: application/json' -d '{"editVersion":1}' | jq
   ```
5. Save v5 with [11](11-edit-save.md) while v4 renders → allowed; the running render is unaffected.
6. When the render finishes, Save again → **202** (a new render).
