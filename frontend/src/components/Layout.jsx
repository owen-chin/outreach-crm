import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout({ children }) {
  const { user, logout } = useAuth()

  return (
    <div className="layout">
      <nav className="nav">
        <span className="nav-brand">Outreach CRM</span>
        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Projects</NavLink>
          <NavLink to="/templates" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Templates</NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Settings</NavLink>
        </div>
        {user && (
          <div className="nav-user">
            {user.picture
              ? <img src={user.picture} alt={user.name} className="nav-avatar" referrerPolicy="no-referrer" />
              : <div className="nav-avatar nav-avatar-fallback">{user.name?.[0] ?? user.email[0]}</div>
            }
            <span className="nav-user-name">{user.name ?? user.email}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>
          </div>
        )}
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
