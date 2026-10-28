import { useCallback, useEffect, useRef, useState } from 'react'
import {
  abortUpload,
  completeUpload,
  createUpload,
  putUploadPart,
  refreshUploadParts,
} from '../../api/smartcrop.js'
import {
  completeParts,
  contentTypeFor,
  createByteProgress,
  isSupportedFile,
  uploadParts,
} from '../core/upload.js'
import { fmtSize } from '../../lib/format.js'

// Upload flow for the Upload screen (spec 05 §3): create → PUT parts → complete.
//
// phase: 'idle' → 'uploading' (sentBytes / totalBytes) → 'completing' (server
// checks the file, can take ~30 s) → resolves with the PROCESSING project.
// Failures land back in 'idle' with `error` set; Cancel lands there without one.

const IDLE = { phase: 'idle', sentBytes: 0, totalBytes: 0, error: null }

const api = { putPart: putUploadPart, refreshParts: refreshUploadParts, complete: completeUpload }

const isAbort = (err) => err?.name === 'AbortError'

function errorMessage(err) {
  if (err?.code === 'FILE_TOO_LARGE' && err.details?.maxBytes) {
    return `This file is too large. The limit is ${fmtSize(err.details.maxBytes)}.`
  }
  return err?.message || 'The upload failed. Please try again.'
}

export function useUpload() {
  const [state, setState] = useState(IDLE)
  // The upload in flight: { controller, projectId }. A ref, not state — Cancel
  // and unmount need the current one without re-rendering.
  const runRef = useRef(null)

  const start = useCallback(async (file, { aspect, layout }) => {
    if (runRef.current) return null
    if (!isSupportedFile(file)) {
      setState({ ...IDLE, error: 'Use an MP4, M4V, MOV or WebM video.' })
      return null
    }

    const run = { controller: new AbortController(), projectId: null }
    const { signal } = run.controller
    runRef.current = run
    setState({ phase: 'uploading', sentBytes: 0, totalBytes: file.size, error: null })

    try {
      const created = await createUpload({
        fileName: file.name,
        contentType: contentTypeFor(file),
        sizeBytes: file.size,
        initialAspect: aspect,
        initialLayout: layout,
      })
      run.projectId = created.project.projectId
      signal.throwIfAborted() // Cancel clicked while the project was being created

      const upload = {
        file,
        api,
        signal,
        projectId: run.projectId,
        partSizeBytes: created.upload.partSizeBytes,
        progress: createByteProgress(file.size, (sentBytes) => setState((s) => ({ ...s, sentBytes }))),
      }
      const etags = await uploadParts({ ...upload, parts: created.upload.parts })

      setState((s) => ({ ...s, phase: 'completing', sentBytes: file.size }))
      const { project } = await completeParts({ ...upload, etags })
      return project
    } catch (err) {
      // Release the S3 multipart upload. Best effort: the server also expires
      // abandoned uploads, and a rejected file (422 VIDEO_*) is already closed.
      if (run.projectId) abortUpload(run.projectId).catch(() => {})
      setState(isAbort(err) ? IDLE : { ...IDLE, error: errorMessage(err) })
      return null
    } finally {
      if (runRef.current === run) runRef.current = null
    }
  }, [])

  // Only while bytes are moving: once 'completing', the server owns the file.
  const cancel = useCallback(() => {
    runRef.current?.controller.abort()
  }, [])

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), [])

  // Leaving the page mid-upload cancels it; closing the tab asks first.
  const busy = state.phase !== 'idle'
  useEffect(() => {
    if (!busy) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  useEffect(() => () => runRef.current?.controller.abort(), [])

  return { ...state, start, cancel, clearError }
}
