// Login screen. Shown by App whenever there is no active session.
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Lock, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
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
        <div style={styles.brand}>
          <span style={styles.brandIcon}><Lock size={18} /></span>
          <div>
            <div style={styles.title}>SP Video Editor</div>
            <div style={styles.poc}>POC</div>
          </div>
        </div>
        <p style={styles.sub}>Sign in to continue</p>

        <label style={styles.label} htmlFor="login-username">Username</label>
        <input
          id="login-username"
          style={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label style={styles.label} htmlFor="login-password">Password</label>
        <div style={styles.pwWrap}>
          <input
            id="login-password"
            style={{ ...styles.input, paddingRight: 40, width: '100%' }}
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            style={styles.pwToggle}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            title={showPw ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div aria-live="polite" style={styles.errorSlot}>
          {error && <span style={styles.error}>{error}</span>}
        </div>

        <button type="submit" disabled={!canSubmit} className="btn btn-primary" style={styles.submit}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

const styles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', padding: 20, background: 'var(--bg)',
  },
  card: {
    display: 'flex', flexDirection: 'column', gap: 7,
    width: '100%', maxWidth: 360, padding: 'clamp(24px, 5vw, 32px)',
    background: 'var(--surface)', borderRadius: 'var(--radius)',
    border: '1px solid var(--border-sub)', boxShadow: 'var(--shadow-md)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandIcon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 34, height: 34, borderRadius: 'var(--radius-sm)',
    background: 'var(--accent-dim)', color: 'var(--accent)', flexShrink: 0,
  },
  title: { color: 'var(--text-bright)', fontSize: 16, fontWeight: 700, lineHeight: 1.2 },
  poc: { color: 'var(--text-faint)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em' },
  sub: { color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 14px' },
  label: { color: 'var(--text-muted)', fontSize: 12, marginTop: 6 },
  input: {
    padding: '10px 12px', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text-bright)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
    transition: 'border-color var(--transition)',
  },
  pwWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  pwToggle: {
    position: 'absolute', right: 6, display: 'flex', alignItems: 'center',
    justifyContent: 'center', width: 30, height: 30, padding: 0,
    background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
  },
  errorSlot: { minHeight: 18, marginTop: 4 },
  error: { color: 'var(--error)', fontSize: 13 },
  submit: { marginTop: 10, width: '100%', padding: '11px 16px', fontSize: 14 },
}
