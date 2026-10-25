# SmartCrop API — testing guide

Every endpoint of the SmartCrop API, one file each, with the exact request
body, a ready-to-run `curl` command, the exact success response and every
error it can return.

The response examples were captured from the real code (only ids, timestamps
and signed-URL query strings will differ when you run them).

---

## 1. Before you start (one time)

1. **`app/server/.env`** must contain:
   - working `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`
   - `S3_BUCKET` (the existing app refuses to start without it)
   - `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `JWT_SECRET` (login)
   - `SMARTCROP_ENABLED=true` + the SmartCrop values (`SMARTCROP_IN_BUCKET`,
     `SMARTCROP_JOBS_BUCKET`, `SMARTCROP_OUT_BUCKET`, `PIPELINE_JOBS_TABLE`,
     `STATE_MACHINE_ARN`, `PLAN_LAMBDA_FUNCTION`)
2. **Node 22** in every terminal:
   ```bash
   export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
   ```
3. **Create the two DynamoDB tables** (safe to run again):
   ```bash
   cd app/server
   node scripts/smartcrop-create-tables.js
   ```
4. **Start the server** and leave it running:
   ```bash
   cd app/server
   yarn dev
   ```
   You should see `SmartCrop: enabled at /api/smartcrop`.
5. Install **`jq`** (`brew install jq`) — the curl commands use it to pick values out of responses.
6. Have a **test video**: `.mp4`, `.m4v`, `.mov` or `.webm`, 3 s – 30 min long,
   at least 360p, at most 3840 px on the long side. Under **16 MiB** keeps the
   upload to a single part (easiest).

---

## 2. Terminal setup (every new terminal)

All curl commands in these files use these variables.

```bash
export API=http://localhost:3001/api/smartcrop
export COOKIE=/tmp/smartcrop-cookie.txt

# Log in once — saves the session cookie to $COOKIE (valid 7 days)
curl -s -c $COOKIE \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}' \
  http://localhost:3001/api/auth/login
```

Expected:

```json
{ "username": "admin" }
```

Later files also use:

| Variable | Holds | Set in |
|---|---|---|
| `$P` | project id (`prj_…`) | [01 — Create upload](01-uploads-create.md) |
| `$R` | render id (`rnd_…`) | [13 — Create render](13-renders-create.md) |

Without the cookie every SmartCrop endpoint answers **401**:

```json
{ "error": "Authentication required" }
```

---

## 2b. Postman setup (alternative to curl)

Ready-made files in [`postman/`](postman/):

| File | What |
|---|---|
| `smartcrop.postman_collection.json` | all 17 APIs + Login + the S3 part upload, in testing order, in 5 folders |
| `smartcrop.postman_environment.json` | the variables they use |

### Import

1. Postman → **Import** (top left) → drop both JSON files → **Import**.
2. Top-right environment dropdown → select **SmartCrop local**.
3. Click the eye icon next to it → **Edit** and fill in:

| Variable | Set to | Example |
|---|---|---|
| `baseUrl` | where the server runs | `http://localhost:3001` |
| `api` | leave as is | `{{baseUrl}}/api/smartcrop` |
| `username` / `password` | your login (`AUTH_USERNAME` + the plain password) | `admin` / `••••` |
| `fileName` | name of your test video | `test.mp4` |
| `contentType` | matches the extension | `video/mp4` (`.mov` → `video/quicktime`, `.webm` → `video/webm`) |
| `fileSizeBytes` | exact size in bytes | `10582938` — get it with `stat -f%z test.mp4` (macOS) or Finder → Get Info |

The rest (`projectId`, `partUrl`, `etag`, `durationMs`, `editVersion`,
`renderId`, `partCount`) are **filled automatically** by each request's
post-response script — you never type them.

> Use a video **≤ 16 MiB** in Postman so it uploads as a single part. Bigger
> files need splitting into parts — use the curl loop in [01](01-uploads-create.md)
> or the e2e script instead.

### Login and the cookie

Run **0 Auth → Login** once. The server answers `{"username":"admin"}` and sets
an `sp_auth` cookie. Postman keeps it in its cookie jar (click **Cookies**
under the Send button → `localhost` → you should see `sp_auth`) and sends it
with every later request automatically. It lasts 7 days; on a **401**, run
Login again.

### Running requests

- Go through the folders top to bottom: **1 Upload → 2 Projects → 3 Edit → 4 Render**.
- Each request's **Docs** (the 📄 icon on the right) says what it's for.
- The saved values show in the environment quick-look (eye icon), and the
  scripts print useful lines in the **Console** (bottom left → Console).
- Scripts live in each request's **Scripts → Post-response** tab
  (older Postman: **Tests** tab).
- Bodies with `{{durationMs}}` / `{{editVersion}}` show a red "invalid JSON"
  underline in the editor — that's fine, Postman replaces the variable with a
  number before sending.
- Skip **04 Cancel upload**, **08 Retry** and **09 Delete project** in the
  normal run: 04 only works on an *unfinished* upload, 08 only on a *FAILED*
  project, and 09 deletes everything (run it last).

### Run everything in one go (optional)

Collection **⋯ → Run collection**: untick `01b`, `04`, `08`, `09`, `16`, `17`,
keep the order, set **Delay** to `5000` ms. Polling requests (06, 14) only send
once in a runner, so for a real pipeline run the manual click-through is easier.

Each endpoint file below has a **Postman** section with the exact tab-by-tab settings.

---

## 3. Test in this order

A project moves through statuses, and most endpoints only work in one of them,
so follow the user's journey:

```
UPLOADING ──complete──► PROCESSING ──(pipeline)──► READY ──► edit / preview / render
    │                        │
    └─ cancel → UPLOAD_ABORTED   └─ pipeline fails → FAILED ──retry──► PROCESSING
```

| # | File | Endpoint | Needs project in |
|---|---|---|---|
| 01 | [Create upload](01-uploads-create.md) | `POST /uploads` | — |
| 02 | [Refresh part URLs](02-uploads-parts.md) | `POST /uploads/{projectId}/parts` | UPLOADING |
| 03 | [Complete upload](03-uploads-complete.md) | `POST /uploads/{projectId}/complete` | UPLOADING |
| 04 | [Cancel upload](04-uploads-cancel.md) | `DELETE /uploads/{projectId}` | UPLOADING |
| 05 | [List projects](05-projects-list.md) | `GET /projects` | any |
| 06 | [Get project (status polling)](06-projects-get.md) | `GET /projects/{projectId}` | any |
| 07 | [Open editor](07-projects-editor.md) | `GET /projects/{projectId}/editor` | READY |
| 08 | [Retry processing](08-projects-retry.md) | `POST /projects/{projectId}/retry` | FAILED |
| 09 | [Delete project](09-projects-delete.md) | `DELETE /projects/{projectId}` | any |
| 10 | [Get edit](10-edit-get.md) | `GET /projects/{projectId}/edit` | READY |
| 11 | [Save edit (autosave)](11-edit-save.md) | `PUT /projects/{projectId}/edit` | READY |
| 12 | [Preview plan](12-preview-plan.md) | `POST /projects/{projectId}/preview-plan` | READY |
| 13 | [Create render (Save)](13-renders-create.md) | `POST /projects/{projectId}/renders` | READY |
| 14 | [Get render (status polling)](14-renders-get.md) | `GET /projects/{projectId}/renders/{renderId}` | — |
| 15 | [List renders](15-renders-list.md) | `GET /projects/{projectId}/renders` | — |
| 16 | [Download render](16-renders-download.md) | `GET /projects/{projectId}/renders/{renderId}/download` | render SUCCEEDED |
| 17 | [Cancel render](17-renders-cancel.md) | `POST /projects/{projectId}/renders/{renderId}/cancel` | render QUEUED / RENDERING |

**Shortcut:** `scripts/smartcrop-e2e.js` runs 01 → 03 → 06 → 07 → 11 → 12 → 13 → 14 → 16
automatically and prints timings:

```bash
cd app/server
E2E_PASSWORD='YOUR_PASSWORD' node scripts/smartcrop-e2e.js ~/Videos/test.mp4
```

---

## 4. Shared objects

### 4.1 Error response (every non-2xx)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid.",
    "details": {
      "issues": [
        { "path": "sizeBytes", "message": "Required integer ≥ 1." }
      ]
    }
  }
}
```

- `details` is an object or `null`.
- **400** = wrong shape/type (`VALIDATION_ERROR`), **422** = right shape but breaks a rule.

Errors that any endpoint can return:

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ "issues": [{ "path", "message" }] }` | bad id in the URL, bad body / query, body is not JSON |
| 401 | — (`{ "error": "Authentication required" }`) | — | no / expired login cookie |
| 404 | `ROUTE_NOT_FOUND` | `null` | URL doesn't exist under `/api/smartcrop` |
| 413 | `PAYLOAD_TOO_LARGE` | `null` | body larger than 1 MiB |
| 500 | `INTERNAL_ERROR` | `null` | unexpected server bug |
| 502 | `UPSTREAM_ERROR` | `{ "service": "s3" \| "dynamodb" \| "stepfunctions" \| "lambda" }` | an AWS call failed |

Body that is not valid JSON:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid.",
    "details": { "issues": [{ "path": "", "message": "Body is not valid JSON." }] }
  }
}
```

### 4.2 `Project` object

Returned by uploads, `GET /projects`, `GET /projects/{id}`, editor and retry.

```json
{
  "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
  "title": "Podcast EP12",
  "status": "READY",
  "createdAt": "2026-10-23T05:42:52.592Z",
  "updatedAt": "2026-10-23T05:42:52.619Z",
  "initial": { "aspect": "9:16", "layout": "fill" },
  "source": {
    "fileName": "Podcast EP12.mp4",
    "contentType": "video/mp4",
    "sizeBytes": 10582938,
    "durationMs": 63000,
    "width": 1280,
    "height": 720,
    "fps": 25,
    "hasAudio": true,
    "videoCodec": "h264"
  },
  "upload": {
    "partCount": 1,
    "partSizeBytes": 16777216,
    "expiresAt": "2026-10-24T05:42:52.592Z",
    "completedAt": "2026-10-23T05:42:52.601Z"
  },
  "processing": {
    "stage": null,
    "attempt": 1,
    "startedAt": "2026-10-23T05:42:52.601Z",
    "finishedAt": "2026-10-23T05:42:52.618Z",
    "elapsedMs": 17,
    "error": null,
    "retryable": false
  },
  "edit": { "version": 1, "updatedAt": "2026-10-23T05:42:52.619Z" },
  "activeRenderId": null,
  "lastRender": null,
  "lastSyncedAt": "2026-10-23T05:42:52.619Z"
}
```

| Field | Meaning |
|---|---|
| `status` | `UPLOADING`, `PROCESSING`, `READY`, `FAILED`, `REJECTED` (file failed checks), `UPLOAD_ABORTED`, `UPLOAD_EXPIRED` |
| `source.*` media fields | `null` until the upload is completed and checked |
| `processing` | `null` while `UPLOADING` / `UPLOAD_ABORTED` / `UPLOAD_EXPIRED` |
| `processing.stage` | only while `PROCESSING`: `QUEUED` → `PREPARING` → `ANALYZING` → `PLANNING` → `FINALIZING` |
| `processing.error` | `{ "code", "message", "failedStage" }` when `FAILED` or `REJECTED` |
| `processing.retryable` | `true` when `FAILED` and fewer than 3 attempts |
| `edit` | `{ version, updatedAt }` once `READY`, else `null` |
| `lastRender` | `{ renderId, status, aspect, createdAt, finishedAt }` or `null` |

Failed processing looks like:

```json
"processing": {
  "stage": null,
  "attempt": 1,
  "startedAt": "2026-10-23T05:42:52.601Z",
  "finishedAt": "2026-10-23T05:44:30.100Z",
  "elapsedMs": 97499,
  "error": {
    "code": "ANALYZE_FAILED",
    "message": "We couldn't analyse this video. Try again, or upload a different file.",
    "failedStage": "ANALYZE"
  },
  "retryable": true
}
```

### 4.3 Edit document (the "edit list")

Used by [10](10-edit-get.md), [11](11-edit-save.md), [12](12-preview-plan.md), [13](13-renders-create.md).

```json
{
  "schemaVersion": 1,
  "aspect": "9:16",
  "defaultLayout": "fill",
  "options": { "background": "blur", "fallbackLayout": "fill" },
  "clips": [
    { "id": "c_3", "sourceStartMs": 35000, "sourceEndMs": 50000, "layout": "split" },
    { "id": "c_1", "sourceStartMs": 0, "sourceEndMs": 12000, "layout": null }
  ]
}
```

| Field | Rule |
|---|---|
| `schemaVersion` | must be `1` |
| `aspect` | `"9:16"`, `"4:5"`, `"1:1"`, `"16:9"` |
| `defaultLayout` | `"fill"`, `"fit"`, `"split"`, `"three"`, `"four"` (`three`/`four` only for `9:16`) |
| `options` | optional. `background`: `null`, `"blur"`, `"black"` or `"#RRGGBB"`. `fallbackLayout`: `null`, `"fill"`, `"fit"`. Missing / `null` → `"blur"` / `"fill"` |
| `clips` | 1–500 clips, **in timeline order**. Times are integer **milliseconds of the source video**; end is exclusive |
| `clips[].id` | 1–40 chars of `A-Z a-z 0-9 _ -`, unique |
| `clips[].layout` | `null` (= `defaultLayout`) or a layout allowed for the aspect |
| | clips must not overlap, each ≥ 200 ms, total ≥ 1000 ms, end ≤ video duration |

**Identity edit** = one clip from `0` to the full duration with no own layout
(`"layout": null`). While the pipeline `edit` feature is off
(`PIPELINE_FEATURES` without `edit`), preview and render only accept the
identity edit — you can still change `aspect`, `defaultLayout` and `options`.

### 4.4 `Render` object

```json
{
  "renderId": "rnd_01m5kmh5etz15fq5j5e3kxm1xr",
  "projectId": "prj_01m5kmh5d61hkeay5y9cca8k24",
  "status": "SUCCEEDED",
  "editVersion": 2,
  "aspect": "1:1",
  "layouts": ["split"],
  "outputDurationMs": 63000,
  "stage": null,
  "createdAt": "2026-10-23T05:42:52.634Z",
  "startedAt": "2026-10-23T05:42:52.634Z",
  "finishedAt": "2026-10-23T05:44:58.636Z",
  "elapsedMs": 126002,
  "output": {
    "url": "https://<OUT_BUCKET>.s3.us-east-1.amazonaws.com/prj_…/renders/rnd_…/1x1_split.mp4?X-Amz-…&response-content-type=video%2Fmp4…",
    "downloadUrl": "https://<OUT_BUCKET>.s3.us-east-1.amazonaws.com/prj_…/renders/rnd_…/1x1_split.mp4?X-Amz-…&response-content-disposition=attachment…",
    "fileName": "Podcast EP12 (1x1).mp4",
    "sizeBytes": 18834221,
    "width": 1080,
    "height": 1080,
    "urlsExpireAt": "2026-10-23T06:44:58.636Z"
  },
  "error": null,
  "cancelRequestedAt": null
}
```

| Field | Meaning |
|---|---|
| `status` | `QUEUED` → `RENDERING` → `SUCCEEDED` / `FAILED` / `CANCELLED` |
| `stage` | `PLANNING` (QUEUED), `ENCODING` (RENDERING), else `null` |
| `output` | only when `SUCCEEDED`, else `null`. URLs are signed per request and expire at `urlsExpireAt` |
| `error` | `{ "code", "message", "failedStage" }` when `FAILED` |

---

## 5. Signed URLs

Every URL the API returns (part uploads, video, plan JSON, render output) is a
**presigned S3 URL** valid for `SIGNED_URL_TTL_SEC` (default 1 hour). They work
without the login cookie. If one expires, call the endpoint again for a fresh one.
