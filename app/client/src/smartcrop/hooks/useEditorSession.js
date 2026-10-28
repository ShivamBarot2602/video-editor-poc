import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { getEditor, putEdit } from '../../api/smartcrop.js'
import { createAutosave } from '../core/autosave.js'

// Opens the editor (spec 05 §3 "Open editor") and owns the edit document.
//
// → { session, error, loading, document, version, saving, changeDocument, flushEdits }
//   session        { project, media, timing, analysis, capabilities, preview } from GET /editor
//   document       the edit list being shown — updated instantly on every change
//   version        last version the server confirmed (Save renders this, 04)
//   changeDocument replace the document; autosaved (PUT /edit) after 1 s of quiet
//   flushEdits     saves pending changes now → the version the server holds
//                  (Save renders exactly that, 04 §2)

export function useEditorSession(projectId) {
  const [state, setState] = useState({ session: null, error: null, loading: true })
  const [document, setDocument] = useState(null)
  const [version, setVersion] = useState(null)
  const [saving, setSaving] = useState(false)
  const autosaveRef = useRef(null)
  // Mirrors `version` synchronously: right after a flush, state is a render behind.
  const versionRef = useRef(null)

  const confirmVersion = useCallback((v) => {
    versionRef.current = v
    setVersion(v)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setState({ session: null, error: null, loading: true })
    getEditor(projectId, { signal: controller.signal })
      .then(({ edit, ...session }) => {
        setState({ session, error: null, loading: false })
        setDocument(edit.document)
        confirmVersion(edit.version)
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setState({ session: null, error, loading: false })
      })
    return () => controller.abort()
  }, [projectId, confirmVersion])

  useEffect(() => {
    const autosave = createAutosave({
      save: (doc) => putEdit(projectId, doc),
      onSaved: (result) => confirmVersion(result.version),
      onError: (err) => toast.error(`Couldn't save your change: ${err.message}`),
      onBusy: setSaving,
    })
    autosaveRef.current = autosave
    // Leaving the editor saves what's pending instead of dropping it.
    return () => { autosave.flush().catch(() => {}) }
  }, [projectId, confirmVersion])

  const changeDocument = useCallback((doc) => {
    setDocument(doc)
    autosaveRef.current?.schedule(doc)
  }, [])

  const flushEdits = useCallback(async () => {
    await autosaveRef.current?.flush()
    return versionRef.current
  }, [])

  return { ...state, document, version, saving, changeDocument, flushEdits }
}
