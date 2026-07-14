import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { getAuthStatus } from '../api'
import { initials } from '../lib/avatar'

export default function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const { data: gmailStatus } = useQuery({ queryKey: ['auth-status'], queryFn: getAuthStatus })

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [menuOpen])

  if (!user) return null

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-brand-mark">L</span>
        <span className="topbar-brand-name">Longlist</span>
      </div>

      <nav className="topbar-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'topbar-link active' : 'topbar-link'}>Home</NavLink>
        <NavLink to="/templates" className={({ isActive }) => isActive ? 'topbar-link active' : 'topbar-link'}>Templates</NavLink>
      </nav>

      <div className="topbar-right">
        <button className="topbar-bell" type="button" aria-label="Notifications">
          🔔
          <span className="topbar-bell-dot" />
        </button>

        <div className="topbar-user" ref={menuRef}>
          <button className="topbar-user-chip" onClick={() => setMenuOpen(v => !v)}>
            <span className="topbar-user-name">{user.name ?? user.email}</span>
            {user.picture
              ? <img src={user.picture} alt={user.name} className="topbar-avatar" referrerPolicy="no-referrer" />
              : <span className="topbar-avatar topbar-avatar-fallback">{initials(user.name ?? user.email)}</span>
            }
            <span className="topbar-caret">▾</span>
          </button>

          {menuOpen && (
            <div className="topbar-dropdown">
              <div className="topbar-dropdown-header">
                {user.picture
                  ? <img src={user.picture} alt={user.name} className="topbar-avatar topbar-avatar-lg" referrerPolicy="no-referrer" />
                  : <span className="topbar-avatar topbar-avatar-fallback topbar-avatar-lg">{initials(user.name ?? user.email)}</span>
                }
                <div>
                  <div className="topbar-dropdown-name">{user.name ?? 'Account'}</div>
                  <div className="topbar-dropdown-email">{user.email}</div>
                </div>
              </div>
              <div className="topbar-dropdown-menu">
                <button className="topbar-dropdown-item" onClick={() => { setMenuOpen(false); navigate('/settings') }}>
                  ⚙ Profile &amp; settings
                </button>
                <button className="topbar-dropdown-item" onClick={() => { setMenuOpen(false); navigate('/settings') }}>
                  <span>✉ Gmail</span>
                  {gmailStatus?.connected
                    ? <span className="topbar-dropdown-badge topbar-dropdown-badge-on">● Connected</span>
                    : <span className="topbar-dropdown-badge">Not connected</span>
                  }
                </button>
              </div>
              <div className="topbar-dropdown-divider" />
              <button className="topbar-dropdown-item topbar-dropdown-logout" onClick={() => { setMenuOpen(false); logout() }}>
                ⤶ Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
