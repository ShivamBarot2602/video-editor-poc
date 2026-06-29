import { useState, useEffect } from 'react'

// useState backed by a plain-string localStorage key: initializes from storage
// (falling back to `initial` when absent/empty, matching `getItem(key) || initial`)
// and writes on every change.
//
// For simple string values only — NOT for JSON-encoded state, keys whose init
// depends on other sources (e.g. URL params), or library-managed keys
// (react-resizable-panels layout keys).
export function useLocalStorageState(key, initial) {
  const [value, setValue] = useState(() => localStorage.getItem(key) || initial)
  useEffect(() => {
    localStorage.setItem(key, value)
  }, [key, value])
  return [value, setValue]
}
