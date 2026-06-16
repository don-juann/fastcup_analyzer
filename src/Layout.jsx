import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from './auth.jsx'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('fc-theme') || 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('fc-theme', theme)
  }, [theme])

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand">fastcup<span className="dot">.</span></Link>

        <nav className="tabs">
          <NavLink to="/" end>analyzer</NavLink>
          <NavLink to="/tierlist">tierlist</NavLink>
        </nav>

        <div className="topbar-right">
          {user ? (
            <>
              <span className="who">{user.nickname}</span>
              <button className="linkbtn" onClick={async () => { await logout(); navigate('/') }}>
                log out
              </button>
            </>
          ) : (
            <NavLink to="/login" className="linkbtn">log in</NavLink>
          )}
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? '☾' : '☀'}
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  )
}
