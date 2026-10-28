import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { cancelRender, createRender, getRender } from '../../api/smartcrop.js'
import { createRenderTracker } from '../core/renderTracker.js'

// Rendering for the editor (spec 05 §3 "Save"). Rules live in
// core/renderTracker.js; this binds them to the API, React state and toasts.
//
// → { phase, render, receivedAt, error, start(editVersion), cancel(), refresh() }
// `activeRenderId` (project.activeRenderId) is followed on open, so a reload
// mid-render resumes the status chip.

const INITIAL = { phase: 'idle', render: null, receivedAt: 0, error: null }

export function useRender(projectId, activeRenderId) {
  const [state, setState] = useState(INITIAL)
  const trackerRef = useRef(null)

  useEffect(() => {
    const tracker = createRenderTracker({
      api: {
        create: (editVersion) => createRender(projectId, editVersion),
        get: (renderId) => getRender(projectId, renderId),
        cancel: (renderId) => cancelRender(projectId, renderId),
      },
      onChange: setState,
      onError: (err) => toast.error(err.message),
    })
    trackerRef.current = tracker
    setState(INITIAL)
    tracker.attach(activeRenderId)
    return () => tracker.dispose()
  }, [projectId]) // activeRenderId only matters when the editor opens

  // A render that fails or is cancelled while being followed gets a toast;
  // start errors are already reported through onError.
  const renderId = state.render?.renderId
  useEffect(() => {
    if (!renderId) return
    if (state.phase === 'failed') toast.error(state.error.message)
    if (state.phase === 'cancelled') toast('Render cancelled')
  }, [renderId, state.phase]) // state.error always belongs to this phase

  return {
    ...state,
    start: (editVersion) => trackerRef.current?.start(editVersion),
    cancel: () => trackerRef.current?.cancel(),
    refresh: () => trackerRef.current?.refresh(),
  }
}
