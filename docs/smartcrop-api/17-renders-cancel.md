# 17 — Cancel render

```
POST /api/smartcrop/projects/{projectId}/renders/{renderId}/cancel
```

Stops a queued or running render: stops the Step Functions execution (which
stops the Fargate task), marks the render `CANCELLED`, frees the project for a
new Save, and deletes any partial output files.

If the render finishes at the exact moment you cancel, you get **either**
`CANCELLED` **or** a 409 saying it `SUCCEEDED` — never both.

**Needs:** render `QUEUED` or `RENDERING`.

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |
| `renderId` | `rnd_` + 26 lowercase letters/digits |

No body (or `{}`).

---

## curl

```bash
curl -s -b $COOKIE -X POST $API/projects/$P/renders/$R/cancel \
  -H 'Content-Type: application/json' -d '{}' | jq
```

---

## Postman

Collection request: **4 Render → 17 Cancel render**

| Tab | Set to |
|---|---|
| Method | `POST` |
| URL | `{{api}}/projects/{{projectId}}/renders/{{renderId}}/cancel` |
| Headers | `Content-Type: application/json` (already set in the collection) |
| Body | see below |
| Scripts → Post-response | logs the new render status |

Body → **raw** → **JSON**:

```json
{}
```

Run **13** first, poll **14** until `RENDERING`, then send this → `CANCELLED`.

---

## Success — `200 OK`

```json
{
  "render": {
    "renderId": "rnd_01m5kmh5etz15fq5j5e3kxm1xr",
    "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
    "status": "CANCELLED",
    "editVersion": 2,
    "aspect": "1:1",
    "layouts": ["split"],
    "outputDurationMs": 63000,
    "stage": null,
    "createdAt": "2026-10-23T05:42:52.634Z",
    "startedAt": "2026-10-23T05:42:52.634Z",
    "finishedAt": "2026-10-23T05:43:40.120Z",
    "elapsedMs": 47486,
    "output": null,
    "error": null,
    "cancelRequestedAt": "2026-10-23T05:43:40.020Z"
  }
}
```

Cancelling an already `CANCELLED` render returns the same **200** again.

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad id |
| 404 | `PROJECT_NOT_FOUND` / `RENDER_NOT_FOUND` | `null` | no such project / render |
| 409 | `INVALID_STATE` | `{ "status": "SUCCEEDED", "allowed": ["QUEUED", "RENDERING"] }` | render already `SUCCEEDED` or `FAILED` (its output is kept) |
| 502 | `UPSTREAM_ERROR` | `{ "service": "stepfunctions" }` | couldn't stop it. Only `cancelRequestedAt` was saved — call cancel again, or the next [14](14-renders-get.md) poll completes the cancel |

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "This can't be done while the item is SUCCEEDED.",
    "details": { "status": "SUCCEEDED", "allowed": ["QUEUED", "RENDERING"] }
  }
}
```

---

## How to test

1. Start a render ([13](13-renders-create.md)), wait until [14](14-renders-get.md) shows
   `RENDERING/ENCODING`, then cancel → **200**, `status: "CANCELLED"`.
2. Within a minute the ECS/Fargate task shows **STOPPED** in the AWS console.
3. Cancel again → **200** (same result).
4. [06 Get project](06-projects-get.md) → `activeRenderId: null`.
   Save again ([13](13-renders-create.md)) → **202**, starts normally.
5. Cancel a `SUCCEEDED` render → **409 `INVALID_STATE`**.

The e2e script can do steps 1–2 for you:

```bash
cd app/server
E2E_PASSWORD='YOUR_PASSWORD' node scripts/smartcrop-e2e.js ~/Videos/test.mp4 --cancel
```
