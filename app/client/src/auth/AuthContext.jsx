// Auth state for the SPA. Checks the session on mount, exposes login/logout,
// and listens for `auth:expired` (fired by the global fetch interceptor when
// any API call returns 401) to drop back to the login screen.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import * as authApi from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Set only when the initial session check can't reach the server (network
  // error, not a 401). Distinguishes "server down" from "logged out".
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await authApi.me() // returns null on 401, throws on network error
      setUser(data?.username || null)
    } catch {
      setUser(null)
      setError('Cannot reach the server. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [refresh])

  const login = useCallback(async (username, password) => {
    const data = await authApi.login(username, password)
    setUser(data.username)
    return data
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, retry: refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
