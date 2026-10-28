import { useCallback, useEffect, useState } from 'react'
import { getProject, retryProject } from '../../api/smartcrop.js'
import { POLL_INTERVAL_MS } from '../core/projectStatus.js'

// Loads a project and polls it every 3 s while PROCESSING (spec 05 §3).
//
// → { project, receivedAt, error, notFound, loading, retry }
// A failed poll keeps the last project and polls again; `error` is only for
// when there is nothing to show yet. 400/404 stop polling (`notFound`).

const isAbort = (err) => err?.name === 'AbortError'
const isMissing = (err) => err?.status === 404 || err?.status === 400

const INITIAL = { project: null, receivedAt: 0, error: null, notFound: false, loading: true }

export function useProjectStatus(projectId) {
  const [state, setState] = useState(INITIAL)
  // Bumped to restart polling after a retry puts the project back in PROCESSING.
  const [generation, setGeneration] = useState(0)

  // A different project starts from a blank state, not the previous one's.
  useEffect(() => { setState(INITIAL) }, [projectId])

  useEffect(() => {
    const controller = new AbortController()
    let timer = null

    async function poll() {
      let keepPolling = true
      try {
        const { project } = await getProject(projectId, { signal: controller.signal })
        setState({ project, receivedAt: Date.now(), error: null, notFound: false, loading: false })
        keepPolling = project.status === 'PROCESSING'
      } catch (err) {
        if (isAbort(err)) return
        keepPolling = !isMissing(err)
        setState((s) => ({ ...s, error: err, notFound: isMissing(err), loading: false }))
      }
      if (keepPolling) timer = setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [projectId, generation])

  // POST /retry → back to PROCESSING. Throws the API error for the caller to show.
  const retry = useCallback(async () => {
    const { project } = await retryProject(projectId)
    setState({ project, receivedAt: Date.now(), error: null, notFound: false, loading: false })
    setGeneration((g) => g + 1)
  }, [projectId])

  return { ...state, retry }
}
