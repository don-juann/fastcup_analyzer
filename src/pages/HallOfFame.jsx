import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { useLang } from '../i18n.jsx'
import { scanHallOfFameData } from '../lib/fastcup.js'
import { useMatchScope } from '../lib/useMatchScope.js'
import ScopePicker from '../components/ScopePicker.jsx'

// Scanned hall-of-fame data, keyed by scope (overall range or specific
// session), so switching back to an already-viewed scope is instant.
const scansKey = (uid) => `fc-hof-scans-${uid}`
function loadScans(uid) {
  try { const r = localStorage.getItem(scansKey(uid)); return r ? JSON.parse(r) : {} } catch { return {} }
}
function saveScans(uid, map) {
  try { localStorage.setItem(scansKey(uid), JSON.stringify(map)) } catch { /* quota */ }
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
  const uid = user?.fastcupId

  const { status: listStatus, error: listError, sessions, scope, setScope, activeMatches, scopeKey, rescan } =
    useMatchScope(uid, 'fc-matchlist-hof')

  const [scans, setScans] = useState({})
  const [scanStatus, setScanStatus] = useState('idle') // idle | loading | empty | error
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  useEffect(() => {
    if (uid) setScans(loadScans(uid))
  }, [uid])

  useEffect(() => {
    if (!uid || listStatus !== 'ready') return
    if (scans[scopeKey]) { setScanStatus('ready'); return }
    if (!activeMatches.length) { setScanStatus('empty'); return }

    let cancelled = false
    setScanStatus('loading'); setProgress({ done: 0, total: 0 })
    scanHallOfFameData(activeMatches, { onProgress: (done, total) => !cancelled && setProgress({ done, total }) })
      .then((d) => {
        if (cancelled) return
        setScans((s) => { const next = { ...s, [scopeKey]: d }; saveScans(uid, next); return next })
        setScanStatus('ready')
      })
      .catch(() => { if (!cancelled) setScanStatus('error') })
    return () => { cancelled = true }
  }, [uid, listStatus, scopeKey, activeMatches]) // eslint-disable-line

  function handleRescan() {
    if (uid) { setScans({}); saveScans(uid, {}) }
    rescan()
  }

  if (ready && !user) return <Navigate to="/" replace />

  const data = scans[scopeKey]
  const busy = listStatus === 'loading' || scanStatus === 'loading'
  const cards = data ? buildCards(data, t) : []

  return (
    <div className="hof">
      <div className="tl-head">
        <h1>{t('hof.title')}<span className="dot">.</span></h1>
        {data && (
          <div className="tl-actions">
            <span className="count">{t('hof.scanned', { n: data.matchCount })}</span>
            <button className="load-btn" onClick={handleRescan} disabled={busy}>
              {t('hof.refresh')}
            </button>
          </div>
        )}
      </div>
      <p className="sub">{t('hof.intro')}</p>

      <ScopePicker sessions={sessions} scope={scope} setScope={setScope} />

      {listStatus === 'error' && <p className="error">{listError}</p>}
      {scanStatus === 'loading' && (
        <p className="note">{t('hof.loading', { done: progress.done, total: progress.total || '…' })}</p>
      )}
      {scanStatus === 'empty' && <p className="note">{t('scope.emptyRange')}</p>}

      {data && scanStatus === 'ready' && (
        cards.length ? (
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
        ) : <p className="hof-empty">{t('hof.empty')}</p>
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
