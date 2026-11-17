# 06 — Reframe a Library video

Status: **postponed** (2026-11-17). Reframe stays a separate section with its own uploads; Library videos and SmartCrop sources live in different S3 buckets and copying between them is out of scope for now. Kept as a reference for later; nothing here is built.

Today a SmartCrop project can only start from a browser upload (spec 01). The app shell now opens every
tool from a Library video (`/v/:videoId/…`), so Reframe should start from a video that is already
uploaded without sending the file again. This spec adds one endpoint, one project field and one list
filter. Shared rules from 00 (auth, error envelope, 1 MiB body, `ROUTE_NOT_FOUND`) apply unchanged.

## 1. `POST /api/smartcrop/projects/from-video`

Creates a project whose source is the original of a Library video and starts processing it. Answers
when processing has started, the same moment `POST /uploads/:id/complete` answers.

### Request

```json
{ "videoId": "5ef899a3-4254-4652-985c-e34d046a70cc", "title": null, "initialAspect": "9:16", "initialLayout": "fill" }
```

| Field | Rule | Default |
|---|---|---|
| `videoId` | required string, lowercase UUID v4 | — |
| `title` | `null` or 1–200 chars after trim | the video's original filename without its extension |
| `initialAspect` | one of `ASPECTS` | `9:16` |
| `initialLayout` | one of `LAYOUTS` | `fill` |

Unknown fields are a 400, as in 01.

### Checks, in this order

When a request breaks several rules, the first one wins:

1. **400 `VALIDATION_ERROR`**: body shape, unknown fields, bad `videoId` format, bad values.
2. **404 `VIDEO_NOT_FOUND`** (new code): no Library video with that id, or it has no original.
3. **415 `UNSUPPORTED_VIDEO_TYPE`**: the original's extension is not in `VIDEO_TYPES`. The Library takes `.mkv` and `.avi`; SmartCrop does not. `details` match 01.
4. **413 `FILE_TOO_LARGE`**: the original is larger than `UPLOAD_MAX_BYTES`.
5. **422 `LAYOUT_NOT_SUPPORTED`**: same rule and `details` as 01.

### Steps

1. **Read the original's metadata** from the videos bucket (`videoStore.statOriginal`): key, size, extension.
2. **Create the project item.** Use the same shape as 01 §create, with these differences:
   - `status: UPLOADING`
   - `source.videoId: <videoId>`
   - `source.fileName` is the original's filename.
   - `source.contentType` is the first type listed for its extension.
   - `upload` is `{ source: 'library', s3UploadId: null, partSizeBytes: null, partCount: null, expiresAt: now + 1 h, completedAt: null }`.

   The short expiry lets the usual expiry sweep (`expireIfNeeded`) clean up a project whose request died mid-copy.
3. **Copy the original** into the IN bucket at `keys.source(projectId, ext)` with S3 `CopyObject`. The copy is server-side and never streams through this server. Rules:
   - A single `CopyObject` covers up to 5 GB. The Library caps uploads at 500 MB, so multipart copy is not needed. If the original is over 5 GB the request fails with 413, as in check 4.
   - The S3 key is built only in `storage/videoStore.js`, like every other SmartCrop key.
   - If the copy fails, delete the project item and answer 502 `UPSTREAM_ERROR` (`awsService: 's3'`).
4. **Size check, probe, analyse.** Run steps 5–6 of 01 §complete unchanged. A file that fails `analyseProbe` becomes `REJECTED` and gets the same 422 response as an upload, with the code from `analyseProbe` (too short, too long, resolution and so on).
5. **Start processing** and move the project from `UPLOADING` to `PROCESSING`, as in steps 7–8 of 01 §complete. Set `upload.completedAt`.
6. **Respond 201** with `{ project }`, the Project shape from 02.

### Corner cases

- **Repeat calls:** there is no idempotency key. Two calls make two projects. The client disables its button while a request is in flight.
- **Video deleted mid-copy:** if the Library video is deleted while the copy runs, `CopyObject` fails with `NoSuchKey`. Delete the project item and answer 404 `VIDEO_NOT_FOUND`.
- **Server dies before step 5:** the project stays `UPLOADING` until `upload.expiresAt`, then expires to `UPLOAD_EXPIRED` (410 everywhere, per the existing decision). Expiry skips the multipart abort when `upload.source === 'library'`, and deletes the copied source object if there is one.
- **Upload endpoints:** `POST /uploads/:id/parts`, `/complete` and `DELETE /uploads/:id` on a library project answer 409 `UPLOAD_NOT_ACTIVE`, because there is no multipart upload to act on.
- **Project lifecycle:** retry, editing, renders and delete work exactly as for uploaded projects. The project owns its own copy of the file.
- **Deleting things:** deleting the Library video does not touch its projects, and deleting a project does not touch the Library video.

## 2. Project shape (02): `source.videoId`

`source.videoId` is the Library video id, or `null` for projects that started from an upload. `toProject` returns it for every project.

## 3. `GET /api/smartcrop/projects?videoId=<uuid>`

This is an optional filter on the existing list.
- It combines with `status`, `limit` and `cursor`.
- A `videoId` that is not a lowercase UUID v4 is a 400.
- An unknown id returns an empty list, not a 404.
- It is implemented as a `FilterExpression` on `source.videoId` over the existing `byCreated` query. That is fine at this volume; add a GSI on `source.videoId` if lists grow large.

## 4. Client (05 addendum)

- **Reframe tab:** the project bar gains a fourth tab, `/v/:videoId/reframe`. It shows two things:
  - This video's reframes, from the list with `?videoId=`, as the same cards as the Reframe page.
  - A "New reframe" panel with the aspect and layout pickers and a Start button. Start calls the new endpoint, then opens `/smartcrop/:projectId`.
- **Tab dot:** the dot shows "has results" when the video has at least one `READY` project, and "running" while one is `PROCESSING`.
- **Reframe page (rail):** stays as the list of every project. "New reframe" there still uploads a file (01). Cards for library projects link back to their video.
- **415 handling:** the panel shows the 415 message and links to the upload flow.

## 5. Tests (`test/smartcrop/`)

Every error code and corner case above gets a test, with AWS mocked as today:
- `VALIDATION_ERROR` (each field), `VIDEO_NOT_FOUND`, `UNSUPPORTED_VIDEO_TYPE`, `FILE_TOO_LARGE`, `LAYOUT_NOT_SUPPORTED`, and the order those checks run in.
- The happy path: item written, `CopyObject` called with the right buckets and keys, execution started, 201 with `source.videoId`.
- Copy fails → 502 and no project left behind. Copy fails with `NoSuchKey` → 404.
- A probe that fails analysis → `REJECTED` + 422 with the analyseProbe code.
- Expiry of a stuck library project: no multipart abort, and the source object is deleted.
- Upload endpoints on a library project → 409 `UPLOAD_NOT_ACTIVE`.
- The list with `videoId`: matches, no matches, combined with `status` and `cursor`, and a bad id → 400.

The in-memory S3 fake needs `CopyObjectCommand` support.

## 6. Open questions

1. **IAM:** the server's credentials need `s3:GetObject` on the videos bucket and `s3:PutObject` on the IN bucket. Both buckets must be in `AWS_REGION`. Is that true in every deployed environment?
2. **Default title:** is the filename without its extension right, or should it get a suffix such as "· 9:16"?
3. **Rail entry:** should Reframe stay a rail entry once it is a tab inside each video? My suggestion is to keep it: it is the only place that lists every project.
