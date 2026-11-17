// Login screen. Shown by App whenever there is no active session.
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Clapperboard, Eye, EyeOff } from 'lucide-react'

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
      setError(err.message || 'Sign-in failed. Check your username and password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form onSubmit={onSubmit} className="auth-card">
        <span className="auth-mark" aria-hidden="true"><Clapperboard size={20} strokeWidth={2} /></span>
        <h1 className="auth-title">Sign in to SP Video Editor</h1>
        <p className="auth-sub">Captions, clips, thumbnails and reframing for your videos.</p>

        <div className="field">
          <label className="field-label" htmlFor="login-username">Username</label>
          <input
            id="login-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="login-password">Password</label>
          <div className="auth-pw">
            <input
              id="login-password"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="icon-btn auth-pw-toggle"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              title={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <p className="auth-error" aria-live="polite">{error}</p>

        <button type="submit" disabled={!canSubmit} className="btn btn-primary btn-full auth-submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
