import { Link, useLocation } from 'react-router-dom'
import { Clapperboard, LayoutGrid, Crop, FlaskConical, BookOpen, Sun, Moon, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../theme/ThemeContext'

// Project pages (/v/:id/…) live inside the Library.
const LIBRARY_PATHS = /^\/($|v\/)/

export default function Rail() {
  const { pathname } = useLocation()
  const { logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  const items = [
    { to: '/', label: 'Library', icon: LayoutGrid, active: LIBRARY_PATHS.test(pathname) },
    { to: '/smartcrop/projects', label: 'Reframe', icon: Crop, active: pathname.startsWith('/smartcrop') },
    { to: '/playground', label: 'Lab', icon: FlaskConical, active: pathname.startsWith('/playground') },
    { to: '/docs', label: 'Docs', icon: BookOpen, active: pathname.startsWith('/docs') },
  ]

  return (
    <nav className="rail" aria-label="Main">
      <Link to="/" className="rail-mark" aria-label="SP Video Editor home">
        <Clapperboard size={17} strokeWidth={2} />
      </Link>

      {items.map(({ to, label, icon: Icon, active }) => (
        <Link
          key={to}
          to={to}
          className={active ? 'rail-item active' : 'rail-item'}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
        >
          <Icon size={19} strokeWidth={1.8} />
          <span className="rail-tip" aria-hidden="true">{label}</span>
        </Link>
      ))}

      <span className="rail-spacer" />

      <button type="button" className="rail-item" onClick={toggleTheme} aria-label={themeLabel}>
        {theme === 'dark' ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
        <span className="rail-tip" aria-hidden="true">{themeLabel}</span>
      </button>
      <button type="button" className="rail-item" onClick={logout} aria-label="Sign out">
        <LogOut size={18} strokeWidth={1.8} />
        <span className="rail-tip" aria-hidden="true">Sign out</span>
      </button>
    </nav>
  )
}
