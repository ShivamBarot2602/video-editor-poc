import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { ThemeProvider } from './theme/ThemeContext'
import './index.css'

// Global fetch interceptor: send the session cookie on every /api call (needed
// for cross-origin in prod) and, on a 401 from a non-auth endpoint, signal the
// app to drop to the login screen. Covers the many direct fetch() call sites.
const origFetch = window.fetch.bind(window)
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || ''
  const isApi = url.includes('/api/')
  const res = await origFetch(input, isApi ? { credentials: 'include', ...init } : init)
  if (isApi && res.status === 401 && !url.includes('/api/auth/')) {
    window.dispatchEvent(new Event('auth:expired'))
  }
  return res
}

// Initialize Sentry
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}

const SentryApp = Sentry.withProfiler(App)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <SentryApp />
      </AuthProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--text-bright)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: 'var(--accent)', secondary: 'var(--text-on-accent)' } },
          error: { iconTheme: { primary: 'var(--error)', secondary: 'var(--text-on-accent)' } },
        }}
      />
    </ThemeProvider>
  </React.StrictMode>
)
