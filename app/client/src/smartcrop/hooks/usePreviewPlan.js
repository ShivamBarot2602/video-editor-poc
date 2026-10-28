import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { fetchPlan, previewPlan } from '../../api/smartcrop.js'
import { createPreviewLoader } from '../core/previewLoader.js'

// The plan the preview canvas draws, kept in step with the edit document
// (spec 05 §3). The rules (debounce, latest-only, busy retry, cache) live in
// core/previewLoader.js.
//
// → { preview, plan, pending }
//   preview  the POST /preview-plan response shown (canvas, warnings, …)
//   plan     the plan JSON it points at
//   pending  a newer plan is on its way (the current one stays on screen)
//
// `initialPreview` (from GET /editor) is used for the first document when
// present; otherwise that one is requested straight away.

export function usePreviewPlan(projectId, document, initialPreview) {
  const [state, setState] = useState({ preview: null, plan: null, pending: true })
  const loaderRef = useRef(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const loader = createPreviewLoader({
      api: {
        requestPreview: (doc, opts) => previewPlan(projectId, { document: doc }, opts),
        fetchPlan,
      },
      onChange: setState,
      onError: (err) => toast.error(err.message || "Couldn't update the preview."),
    })
    loaderRef.current = loader
    startedRef.current = false
    return () => loader.dispose()
  }, [projectId])

  useEffect(() => {
    if (!document) return
    const loader = loaderRef.current
    if (startedRef.current) {
      loader.load(document)
      return
    }
    startedRef.current = true
    if (initialPreview) loader.show(initialPreview, document)
    else loader.load(document, { immediate: true })
  }, [document]) // initialPreview only matters for the first document

  return state
}
