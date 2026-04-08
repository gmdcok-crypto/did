import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const nav = [
  { to: '/dashboard', label: '대시보드' },
  { to: '/contents', label: '미디어' },
  { to: '/campaigns', label: '캠페인' },
  { to: '/schedules', label: '스케줄' },
  { to: '/devices', label: '디바이스' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <aside className="layout-rail" aria-hidden="true" />
      <div className="layout-content">
        <header className="header">
          <span className="logo">디지털 광고 CMS</span>
          <nav className="nav">
            {nav.map(({ to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="header-right">
            <span className="user">{user?.email}</span>
            <button type="button" className="btn btn-sm" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
