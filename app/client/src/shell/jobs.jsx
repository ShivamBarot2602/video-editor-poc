// App-wide registry of long-running work (transcribing, burning, clip
// analysis/export, thumbnail generation) so one tray in the project bar can
// show it all the same way. Pages still own the work itself; they describe
// what is running with useJob() and the tray renders it.
import { createContext, useContext, useEffect, useState } from 'react'

const JobsContext = createContext(null)

export function JobsProvider({ children }) {
  const [jobs, setJobs] = useState({})
  return <JobsContext.Provider value={{ jobs, setJobs }}>{children}</JobsContext.Provider>
}

// All registered jobs, optionally only one video's.
export function useJobs(videoId) {
  const { jobs } = useContext(JobsContext)
  const list = Object.entries(jobs).map(([key, job]) => ({ key, ...job }))
  return videoId ? list.filter(j => j.videoId === videoId) : list
}

// Register a running job while `job` is non-null; it disappears when `job`
// becomes null or the caller unmounts.
// job: { videoId, tool: 'captions'|'clips'|'thumbnails', label, detail?, progress? (0–100, omit if unknown) }
export function useJob(key, job) {
  const { setJobs } = useContext(JobsContext)
  const serialized = job ? JSON.stringify(job) : null
  useEffect(() => {
    if (!serialized) return
    // startedAt survives progress updates so the tray can show elapsed time.
    setJobs(prev => ({ ...prev, [key]: { ...JSON.parse(serialized), startedAt: prev[key]?.startedAt ?? Date.now() } }))
    return () => setJobs(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [key, serialized, setJobs])
}
