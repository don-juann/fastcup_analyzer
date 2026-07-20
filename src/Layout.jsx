import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { useLang } from './i18n.jsx'
import { WALLPAPERS, applyTheme, applyWallpaper } from './theme.js'

export default function Layout() {
  const { user, logout } = useAuth()
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('fc-theme') || 'dark')
  const [wallpaper, setWallpaper] = useState(() => localStorage.getItem('fc-wallpaper') || 'inferno')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('fc-theme', theme)
  }, [theme])

  useEffect(() => {
    applyWallpaper(wallpaper)
    localStorage.setItem('fc-wallpaper', wallpaper)
  }, [wallpaper])

  const cycleWallpaper = () =>
    setWallpaper((w) => WALLPAPERS[(WALLPAPERS.indexOf(w) + 1) % WALLPAPERS.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand">Bo5 by Jan<span className="dot">.</span></Link>

        <nav className="tabs">
          <NavLink to="/analyzer">{t('nav.analyzer')}</NavLink>
          <NavLink to="/duels">{t('nav.duels')}</NavLink>
          <NavLink to="/tierlist">{t('nav.tierlist')}</NavLink>
          <NavLink to="/hall-of-fame">{t('nav.hallOfFame')}</NavLink>
        </nav>

        <div className="topbar-right">
          {user && <span className="who">{user.nickname}</span>}

          <div className="settings" ref={ref}>
            <button className="gear" onClick={() => setOpen((o) => !o)} aria-label="Settings">
              <GearIcon />
            </button>

            {open && (
              <div className="settings-menu">
                <button className="settings-row" onClick={() => setTheme((tm) => (tm === 'light' ? 'dark' : 'light'))}>
                  <span>{t('settings.darkMode')}</span>
                  <span className={`switch ${theme === 'dark' ? 'on' : ''}`}><span className="knob" /></span>
                </button>

                <button className="settings-row" onClick={cycleWallpaper}>
                  <span>{t('settings.wallpaper')}</span>
                  <span className="settings-val">{wallpaper} ›</span>
                </button>

                <button className="settings-row" onClick={() => setLang(lang === 'en' ? 'kk' : 'en')}>
                  <span>{t('settings.language')}</span>
                  <span className="settings-val">{lang === 'en' ? 'English ›' : 'Қазақша ›'}</span>
                </button>

                <div className="settings-divider" />

                {user ? (
                  <button
                    className="settings-row act"
                    onClick={async () => { setOpen(false); await logout(); navigate('/') }}
                  >
                    {t('settings.logout')}
                  </button>
                ) : (
                  <Link className="settings-row act" to="/" onClick={() => setOpen(false)}>
                    {t('settings.login')}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <Outlet />
    </div>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
