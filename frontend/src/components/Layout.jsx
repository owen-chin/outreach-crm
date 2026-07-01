import { NavLink } from 'react-router-dom'

export default function Layout({ children }) {
  return (
    <div className="layout">
      <nav className="nav">
        <span className="nav-brand">Outreach CRM</span>
        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Projects</NavLink>
          <NavLink to="/templates" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Templates</NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Settings</NavLink>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
