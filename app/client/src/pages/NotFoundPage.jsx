// 404 — shown for any route that doesn't match. Rendered inside the Router so
// the Link works for client-side navigation back home.
import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div style={styles.wrap}>
      <span style={styles.icon}><Compass size={30} /></span>
      <div style={styles.code}>404</div>
      <h1 style={styles.title}>Page not found</h1>
      <p style={styles.sub}>The page you're looking for doesn't exist or has moved.</p>
      <Link to="/" className="btn btn-primary" style={styles.button}>Back to home</Link>
    </div>
  )
}

const styles = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    flex: 1, gap: 12, background: 'var(--bg)', textAlign: 'center', padding: 24,
  },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 56, height: 56, borderRadius: '50%',
    background: 'var(--accent-dim)', color: 'var(--accent)', marginBottom: 4,
  },
  code: { fontSize: 'clamp(44px, 12vw, 60px)', fontWeight: 700, color: 'var(--accent)', lineHeight: 1 },
  title: { fontSize: 20, margin: '2px 0 0', color: 'var(--text-bright)' },
  sub: { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 14px', maxWidth: 420 },
  button: { textDecoration: 'none', padding: '10px 18px' },
}
