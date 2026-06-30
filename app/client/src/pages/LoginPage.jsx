// Login screen. Shown by App whenever there is no active session.
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Lock } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const canSubmit = username.trim() && password && !busy

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setBusy(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={onSubmit} style={styles.card}>
        <div style={styles.logoRow}>
          <Lock size={20} color="#7c3aed" />
          <span style={styles.title}>SP Video Editor</span>
        </div>
        <p style={styles.sub}>Sign in to continue</p>

        <label style={styles.label}>Username</label>
        <input
          style={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label style={styles.label}>Password</label>
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && <div style={styles.error}>{error}</div>}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{ ...styles.button, opacity: canSubmit ? 1 : 0.6, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

const styles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', backgroundColor: '#1a1a1a',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    display: 'flex', flexDirection: 'column', gap: 8,
    width: 320, padding: 28, backgroundColor: '#222', borderRadius: 12,
    border: '1px solid #2f2f2f',
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { color: '#e4e4e7', fontSize: 18, fontWeight: 600 },
  sub: { color: '#a1a1a1', fontSize: 13, margin: '0 0 12px' },
  label: { color: '#a1a1a1', fontSize: 12, marginTop: 6 },
  input: {
    padding: '10px 12px', borderRadius: 6, border: '1px solid #3a3a3a',
    background: '#1a1a1a', color: '#e4e4e7', fontSize: 14, outline: 'none',
  },
  error: { color: '#ef4444', fontSize: 13, marginTop: 4 },
  button: {
    marginTop: 14, padding: '10px 16px', borderRadius: 6, border: 'none',
    background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
}
