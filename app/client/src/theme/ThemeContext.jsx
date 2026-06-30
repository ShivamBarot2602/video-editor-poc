// Theme state for the SPA. Light is the default. The chosen theme is written to
// <html data-theme> (CSS tokens key off it) and persisted to localStorage so it
// survives reloads. A pre-paint script in index.html applies the stored value
// before React mounts to avoid a flash of the wrong theme.
import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'sp_theme'

function readStoredTheme() {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    return t === 'dark' || t === 'light' ? t : 'light'
  } catch {
    return 'light'
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme)

  // Keep <html data-theme> and localStorage in sync with state.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore (private mode / storage disabled)
    }
  }, [theme])

  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    []
  )

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
