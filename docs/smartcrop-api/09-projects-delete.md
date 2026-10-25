# 09 — Delete project

```
DELETE /api/smartcrop/projects/{projectId}
```

Deletes a project in **any** status, in this order:

1. marks it as deleting (every other endpoint now answers 404 for it),
2. stops spending: aborts an unfinished upload, stops a running processing
   execution and any running render,
3. deletes every file under `{projectId}/` in the IN, JOBS and OUT buckets,
4. deletes the render records, then the project record.

**This cannot be undone.**

---

## Request

| Path param | Rule |
|---|---|
| `projectId` | `prj_` + 26 lowercase letters/digits |

No body.

---

## curl

```bash
curl -s -b $COOKIE -X DELETE $API/projects/$P -w 'HTTP %{http_code}\n'
```

---

## Postman

Collection request: **2 Projects → 09 Delete project**

| Tab | Set to |
|---|---|
| Method | `DELETE` |
| URL | `{{api}}/projects/{{projectId}}` |
| Headers | none |
| Body | none |

Expect **204** (or **202** `{"status":"DELETING"}` for big projects). Deletes everything for `{{projectId}}` — run it last.

---

## Success

**`204 No Content`** — everything deleted. Empty body.

**`202 Accepted`** — deletion took longer than 25 s and is finishing in the background:

```json
{ "status": "DELETING" }
```

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad project id |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project (also on a second DELETE once the first finished) |
| 502 | `UPSTREAM_ERROR` | `{ "service" }` | AWS failed part-way. The project stays hidden (404 elsewhere); **call DELETE again to finish** |

```json
{
  "error": { "code": "PROJECT_NOT_FOUND", "message": "Project not found.", "details": null }
}
```

---

## How to test

1. Delete a READY project with a finished render → **204**.
2. [06 Get project](06-projects-get.md) → **404**. [05 List](05-projects-list.md) no longer shows it.
3. In the AWS console: nothing left under `prj_…/` in the three SmartCrop buckets.
4. Delete it again → **404**.
5. Delete a project that is still `PROCESSING` → **204**, and the Step Functions
   execution shows as `ABORTED` in the console.
6. Delete a project that is still `UPLOADING` → **204**.
