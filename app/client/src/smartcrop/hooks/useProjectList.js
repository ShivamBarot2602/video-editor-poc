import { useCallback, useEffect, useRef, useState } from 'react'
import { listProjects } from '../../api/smartcrop.js'
import { PROJECTS_PAGE_SIZE, mergePage } from '../core/projectList.js'

// Newest-first projects with "load more" paging (GET /projects, spec 02 §2).
// → { items, loading, error, hasMore, loadMore, reload }

export function useProjectList() {
  const [state, setState] = useState({ items: [], cursor: null, hasMore: false, loading: true, error: null })
  const requestRef = useRef(0) // drops responses from a superseded reload

  const fetchPage = useCallback(async (cursor) => {
    const request = ++requestRef.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { items, nextCursor } = await listProjects({ limit: PROJECTS_PAGE_SIZE, cursor })
      if (request !== requestRef.current) return
      setState((s) => ({
        items: cursor ? mergePage(s.items, items) : items,
        cursor: nextCursor,
        hasMore: Boolean(nextCursor),
        loading: false,
        error: null,
      }))
    } catch (error) {
      if (request === requestRef.current) setState((s) => ({ ...s, loading: false, error }))
    }
  }, [])

  useEffect(() => { fetchPage(null) }, [fetchPage])

  const loadMore = useCallback(() => {
    if (state.cursor && !state.loading) fetchPage(state.cursor)
  }, [fetchPage, state.cursor, state.loading])

  const reload = useCallback(() => fetchPage(null), [fetchPage])

  return { items: state.items, loading: state.loading, error: state.error, hasMore: state.hasMore, loadMore, reload }
}
