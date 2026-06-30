// 404 — shown for any route that doesn't match. Rendered inside the Router so
// the Link works for client-side navigation back home.
import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div style={styles.wrap}>
      <Compass size={48} color="#7c3aed" />
      <div style={styles.code}>404</div>
      <h1 style={styles.title}>Page not found</h1>
      <p style={styles.sub}>The page you're looking for doesn't exist or has moved.</p>
      <Link to="/" style={styles.button}>Back to home</Link>
    </div>
  )
}

const styles = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    flex: 1, gap: 10, backgroundColor: '#1a1a1a', color: '#e4e4e7',
    fontFamily: 'system-ui, -apple-system, sans-serif', textAlign: 'center', padding: 20,
  },
  code: { fontSize: 56, fontWeight: 700, color: '#7c3aed', lineHeight: 1 },
  title: { fontSize: 22, margin: '4px 0 0' },
  sub: { color: '#a1a1a1', fontSize: 14, margin: '0 0 16px', maxWidth: 420 },
  button: {
    padding: '10px 18px', borderRadius: 6, background: '#7c3aed', color: '#fff',
    fontSize: 14, fontWeight: 600, textDecoration: 'none',
  },
}
