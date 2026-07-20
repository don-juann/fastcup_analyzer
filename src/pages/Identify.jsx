import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { useLang } from '../i18n.jsx'
import { parseProfileId, fetchRecentMatchList, fetchMatchRoster } from '../lib/fastcup.js'

// Best-effort: pull the nickname off the roster of the player's most recent
// match. Login still works with no nickname if this can't find one.
async function resolveNickname(fastcupId) {
  try {
    const list = await fetchRecentMatchList(fastcupId, 1)
    if (!list.length) return ''
    const roster = await fetchMatchRoster(list[0].id)
    return roster.find((p) => p.id === fastcupId)?.nick || ''
  } catch {
    return ''
  }
}

export default function Identify() {
  const { user, ready, login } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (ready && user) return <Navigate to="/analyzer" replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const fastcupId = parseProfileId(link)
      const nickname = await resolveNickname(fastcupId)
      await login({ fastcupId, nickname })
      navigate('/analyzer')
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="identify-page">
      <div className="identify">
        <div className="identify-left">
          <form className="identify-form" onSubmit={onSubmit}>
            <label>
              <span>{t('auth.linkLabel')}</span>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://cs2.fastcup.net/idXXXXXX"
                spellCheck={false}
                autoFocus
              />
            </label>

            {error && <p className="error">{error}</p>}

            <button type="submit" className="identify-submit" disabled={busy}>
              <span>{busy ? '…' : t('auth.login')}</span>
              <ArrowIcon />
            </button>
          </form>
        </div>

        <div className="identify-right">
          <span className="corner tl" /><span className="corner tr" />
          <span className="corner bl" /><span className="corner br" />
          <MapGraphic />
        </div>
      </div>
    </div>
  )
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

// Original tactical-map blueprint: rectilinear building outline, two bombsite
// callouts (A/B) joined by a route line. Not a trace of any real CS2 map.
function MapGraphic() {
  const gridH = Array.from({ length: 8 }, (_, i) => i * 60)
  const gridV = Array.from({ length: 7 }, (_, i) => i * 55)

  return (
    <svg className="map-graphic" viewBox="0 0 330 420" xmlns="http://www.w3.org/2000/svg">
      <g className="mg-grid">
        {gridH.map((y) => <line key={`h${y}`} x1="0" y1={y} x2="330" y2={y} />)}
        {gridV.map((x) => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="420" />)}
      </g>

      <path
        className="mg-outline"
        d="M30 30 H180 V70 H230 V130 H295 V220 H230 V285 H160 V345 H90 V285 H30 V190 H70 V120 H30 Z"
      />
      <path className="mg-wall" d="M112 70 V125" />
      <path className="mg-wall" d="M192 130 V220" />
      <rect className="mg-crate" x="128" y="235" width="15" height="15" />
      <rect className="mg-crate" x="205" y="165" width="13" height="13" />

      <path className="mg-route" d="M88 100 C 122 158, 140 200, 160 205 S 202 258, 212 262" />

      <circle className="mg-site" cx="88" cy="100" r="21" />
      <text className="mg-site-label" x="88" y="106" textAnchor="middle">A</text>

      <circle className="mg-site" cx="212" cy="262" r="23" />
      <text className="mg-site-label" x="212" y="268" textAnchor="middle">B</text>

      <circle className="mg-node" cx="160" cy="205" r="4" />
    </svg>
  )
}
