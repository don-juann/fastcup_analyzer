import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { useLang } from '../i18n.jsx'
import { fetchHallOfFameData } from '../lib/fastcup.js'

const cacheKey = (uid) => `fc-hof-v2-${uid}`
function loadCache(uid) {
  try { const r = localStorage.getItem(cacheKey(uid)); return r ? JSON.parse(r) : null } catch { return null }
}
function saveCache(uid, data) {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify({ ts: Date.now(), data })) } catch { /* quota */ }
}

// Best record across season totals (min matches guards rate stats).
function topBy(players, sel, minMatches = 0) {
  let best = null
  for (const [id, p] of Object.entries(players)) {
    if (p.matches < minMatches) continue
    const v = sel(p)
    if (v != null && (!best || v > best.v)) best = { id, p, v }
  }
  return best
}

export default function HallOfFame() {
  const { user, ready } = useAuth()
  const { t } = useLang()
  const [data, setData] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!ready || !user) return
    const uid = user.fastcupId
    if (nonce === 0) {
      const cached = loadCache(uid)
      if (cached?.data) { setData(cached.data); setStatus('ready'); return }
    }
    let cancelled = false
    setStatus('loading'); setError(''); setProgress({ done: 0, total: 0 })
    fetchHallOfFameData(uid, { onProgress: (done, total) => !cancelled && setProgress({ done, total }) })
      .then((d) => { if (cancelled) return; saveCache(uid, d); setData(d); setStatus('ready') })
      .catch((e) => { if (!cancelled) { setError(e.message || String(e)); setStatus('error') } })
    return () => { cancelled = true }
  }, [ready, user, nonce]) // eslint-disable-line

  if (ready && !user) return <Navigate to="/login" replace />

  const cards = data ? buildCards(data, t) : []

  return (
    <div className="hof">
      <div className="tl-head">
        <h1>{t('hof.title')}<span className="dot">.</span></h1>
        {data && (
          <div className="tl-actions">
            <span className="count">{t('hof.scanned', { n: data.matchCount })}</span>
            <button className="load-btn" onClick={() => setNonce((n) => n + 1)} disabled={status === 'loading'}>
              {t('hof.refresh')}
            </button>
          </div>
        )}
      </div>
      <p className="sub">{t('hof.intro')}</p>

      {status === 'loading' && (
        <p className="note">{t('hof.loading', { done: progress.done, total: progress.total || '…' })}</p>
      )}
      {status === 'error' && <p className="error">{error}</p>}

      {data && (
        <div className="hof-grid">
          {cards.map((c) => (
            <div key={c.key} className={`hof-card ${c.tone || ''}`}>
              <div className="hof-icon">{c.icon}</div>
              <div className="hof-cat">{t(c.key)}</div>
              <div className="hof-val">{c.main}</div>
              <div className="hof-who">{c.who}</div>
              {c.ctx && <div className="hof-ctx">{c.ctx}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '' }
}

function buildCards(data, t) {
  const { players, weapons, weaponNames, best } = data
  const matchRec = (key, icon, rec, tone) => rec && {
    key, icon, tone, main: key === 'hof.bestPlusMinusMatch' && rec.value > 0 ? `+${rec.value}` : rec.value,
    who: rec.nick, ctx: [rec.ctx?.map, fmtDate(rec.ctx?.date)].filter(Boolean).join(' · '),
  }
  const totalRec = (key, icon, top, fmt, tone) => top && {
    key, icon, tone, main: fmt ? fmt(top) : top.v, who: top.p.nick,
  }

  // most used weapon
  let weaponCard = null
  const wEntries = Object.entries(weapons)
  if (wEntries.length) {
    const [wid, count] = wEntries.reduce((b, e) => (e[1] > b[1] ? e : b))
    weaponCard = { key: 'hof.mostUsedWeapon', icon: '🗡️', main: weaponNames[wid] || `weapon #${wid}`, who: `${count} ${t('hof.kills')}` }
  }

  return [
    matchRec('hof.mostKillsMatch', '🎯', best.matchKills, 'good'),
    matchRec('hof.highestAdrMatch', '🔥', best.matchAdr, 'good'),
    matchRec('hof.bestPlusMinusMatch', '➕', best.matchPlusMinus, 'good'),
    matchRec('hof.mostSickMatch', '⚡', best.matchSick, 'good'),
    matchRec('hof.mostAssistsMatch', '🤝', best.matchAssists),
    matchRec('hof.mostDeathsMatch', '💀', best.matchDeaths, 'bad'),
    totalRec('hof.mostClutches', '🧤', topBy(players, (p) => p.clutches), null, 'good'),
    totalRec('hof.mostKillsTotal', '🔫', topBy(players, (p) => p.kills)),
    totalRec('hof.bestKd', '🥇', topBy(players, (p) => (p.deaths ? p.kills / p.deaths : p.kills), 5), (top) => (top.v).toFixed(2), 'good'),
    totalRec('hof.mostFirstKills', '🚀', topBy(players, (p) => p.fk)),
    totalRec('hof.mostFirstDeaths', '🪦', topBy(players, (p) => p.fd), null, 'bad'),
    weaponCard,
  ].filter(Boolean)
}
