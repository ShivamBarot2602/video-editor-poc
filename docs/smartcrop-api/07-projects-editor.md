# 07 — Open editor

```
GET /api/smartcrop/projects/{projectId}/editor
```

Everything the editor screen needs in one call: the project, a signed video
URL, analysis data (snap points, people count), what the pipeline supports,
the current edit list, and a ready preview plan if one exists.

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
curl -s -b $COOKIE $API/projects/$P/editor | jq

# just the interesting bits
curl -s -b $COOKIE $API/projects/$P/editor | jq '{video: .media.video.kind, features: .capabilities.features, snaps: .analysis.snapPointsMs, edit: .edit.version, preview: .preview.previewId}'
```

---

## Postman

Collection request: **2 Projects → 07 Open editor**

| Tab | Set to |
|---|---|
| Method | `GET` |
| URL | `{{api}}/projects/{{projectId}}/editor` |
| Headers | none |
| Body | none |
| Scripts → Post-response | saves `editVersion` and `durationMs`; logs features and preview id |

Copy `media.video.url` or `preview.plan.url` from the response into a browser tab to open them.

---

## Success — `200 OK`

```json
{
  "project": {
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
  },
  "media": {
    "video": {
      "url": "https://<IN_BUCKET>.s3.us-east-1.amazonaws.com/prj_01m5kmh5d61hkeay5y9cca8k24/source.mp4?X-Amz-…&response-content-type=video%2Fmp4&x-id=GetObject",
      "kind": "source",
      "width": 1280,
      "height": 720,
      "contentType": "video/mp4"
    },
    "waveform": null,
    "thumbnails": null,
    "urlsExpireAt": "2026-10-23T06:42:52.623Z"
  },
  "timing": { "durationMs": 63000, "sourceFps": 25, "analysisFps": 25 },
  "analysis": { "snapPointsMs": [0, 23880, 28840, 51960, 54640], "peopleCount": 47 },
  "capabilities": {
    "aspects": ["9:16", "4:5", "1:1", "16:9"],
    "layoutsByAspect": {
      "9:16": ["fill", "fit", "split", "three", "four"],
      "4:5": ["fill", "fit", "split"],
      "1:1": ["fill", "fit", "split"],
      "16:9": ["fill", "fit", "split"]
    },
    "minClipMs": 200,
    "maxClips": 500,
    "features": { "edit": false, "editorMedia": false }
  },
  "edit": {
    "version": 1,
    "updatedAt": "2026-10-23T05:42:52.619Z",
    "document": {
      "schemaVersion": 1,
      "aspect": "9:16",
      "defaultLayout": "fill",
      "options": { "background": "blur", "fallbackLayout": "fill" },
      "clips": [{ "id": "c_1", "sourceStartMs": 0, "sourceEndMs": 63000, "layout": null }]
    }
  },
  "preview": {
    "previewId": "initial",
    "cached": true,
    "aspect": "9:16",
    "defaultLayout": "fill",
    "canvas": { "width": 1080, "height": 1920 },
    "analysisFps": 25,
    "frames": 1501,
    "outputDurationMs": 63000,
    "layoutFrames": { "fill": 1501 },
    "plan": {
      "url": "https://<JOBS_BUCKET>.s3.us-east-1.amazonaws.com/prj_01m5kmh5d61hkeay5y9cca8k24/plans/9x16_fill.plan.json?X-Amz-…&response-content-type=application%2Fjson&x-id=GetObject",
      "sizeBytes": 2203
    },
    "urlsExpireAt": "2026-10-23T06:42:52.623Z",
    "warnings": []
  }
}
```

| Field | Meaning |
|---|---|
| `media.video` | `kind: "source"` = the uploaded video. `kind: "proxy"` = a small 540p copy (only when pipeline feature `editor_media` is on and the pipeline made one) |
| `media.waveform` | `{ "url" }` of `waveform.json`, or `null` (needs `editor_media`) |
| `media.thumbnails` | `{ "url", "intervalMs", "tileWidth", "tileHeight", "columns", "count" }` sprite sheet, or `null` (needs `editor_media`) |
| `analysis.snapPointsMs` | shot-change times (ms) the timeline can snap to |
| `capabilities.features.edit` | `false` → only the identity edit can be previewed/rendered: disable cut / trim / delete / reorder / per-clip layout in the UI |
| `edit.document` | the saved [edit list](README.md#43-edit-document-the-edit-list) |
| `preview` | same shape as [12 — Preview plan](12-preview-plan.md). `previewId: "initial"` = the plan made during processing. `null` = no preview for the current edit yet → call 12 |

With `editor_media` on (pipeline change P4 deployed):

```json
"media": {
  "video": { "url": "https://<JOBS_BUCKET>…/proxy.mp4?…", "kind": "proxy", "width": 960, "height": 540, "contentType": "video/mp4" },
  "waveform": { "url": "https://<JOBS_BUCKET>…/waveform.json?…" },
  "thumbnails": { "url": "https://<JOBS_BUCKET>…/thumbs.jpg?…", "intervalMs": 2000, "tileWidth": 160, "tileHeight": 90, "columns": 10, "count": 32 },
  "urlsExpireAt": "2026-10-23T06:42:52.623Z"
}
```

---

## Errors

| HTTP | code | details | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `{ issues }` | bad project id |
| 404 | `PROJECT_NOT_FOUND` | `null` | no such project |
| 409 | `INVALID_STATE` | `{ "status": "PROCESSING", "allowed": ["READY"] }` | project is not `READY` yet |
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

1. While the project is `PROCESSING` → **409 `INVALID_STATE`**.
2. Once `READY` → **200**. Open `media.video.url` in a browser — the video plays.
3. Open `preview.plan.url` — you get the plan JSON (crop windows per frame).
4. Save a non-default edit ([11](11-edit-save.md)), build its preview ([12](12-preview-plan.md)),
   call the editor again → `preview.previewId` = that preview, `cached: true`.
5. Save an edit and **don't** preview it → `preview: null`.
