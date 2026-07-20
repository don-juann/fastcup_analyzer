import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { useLang } from '../i18n.jsx'
import { scanDuelData } from '../lib/fastcup.js'
import { useMatchScope } from '../lib/useMatchScope.js'
import ScopePicker from '../components/ScopePicker.jsx'

const short = (nick) => (nick.length > 9 ? nick.slice(0, 8) + '…' : nick)

// Scanned duel data, keyed by scope (overall range or specific session), so
// switching back to an already-viewed scope is instant.
const scansKey = (uid) => `fc-duels-scans-${uid}`
function loadScans(uid) {
  try { const r = localStorage.getItem(scansKey(uid)); return r ? JSON.parse(r) : {} } catch { return {} }
}
function saveScans(uid, map) {
  try { localStorage.setItem(scansKey(uid), JSON.stringify(map)) } catch { /* quota */ }
}

export default function Duels() {
  const { user, ready } = useAuth()
  const { t } = useLang()
  const uid = user?.fastcupId

  const { status: listStatus, error: listError, sessions, scope, setScope, activeMatches, scopeKey, rescan } =
    useMatchScope(uid, 'fc-matchlist-duels')

  const [scans, setScans] = useState({})
  const [scanStatus, setScanStatus] = useState('idle') // idle | loading | empty | error
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    if (uid) setScans(loadScans(uid))
  }, [uid])

  function applySelection(d) {
    const ids = Object.keys(d.appearances).sort((a, b) => d.appearances[b] - d.appearances[a])
    const sel = new Set(ids.slice(0, 12))
    const selfId = String(uid)
    if (d.players[selfId]) sel.add(selfId)
    setSelected(sel)
  }

  // Scan the active scope's matches unless we already have them cached.
  useEffect(() => {
    if (!uid || listStatus !== 'ready') return
    if (scans[scopeKey]) { applySelection(scans[scopeKey]); setScanStatus('ready'); return }
    if (!activeMatches.length) { setScanStatus('empty'); return }

    let cancelled = false
    setScanStatus('loading'); setProgress({ done: 0, total: 0 })
    scanDuelData(activeMatches, { onProgress: (done, total) => !cancelled && setProgress({ done, total }) })
      .then((d) => {
        if (cancelled) return
        setScans((s) => { const next = { ...s, [scopeKey]: d }; saveScans(uid, next); return next })
        applySelection(d)
        setScanStatus('ready')
      })
      .catch(() => { if (!cancelled) setScanStatus('error') })
    return () => { cancelled = true }
  }, [uid, listStatus, scopeKey, activeMatches]) // eslint-disable-line

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function handleRescan() {
    if (uid) { setScans({}); saveScans(uid, {}) }
    rescan()
  }

  if (ready && !user) return <Navigate to="/" replace />

  const data = scans[scopeKey]
  const selfId = uid ? String(uid) : null
  const allPlayers = data ? Object.keys(data.appearances).sort((a, b) => data.appearances[b] - data.appearances[a]) : []
  const selIds = allPlayers.filter((id) => selected.has(id))
  const kills = (a, b) => data?.duels?.[`${a}>${b}`] || 0
  const busy = listStatus === 'loading' || scanStatus === 'loading'

  return (
    <div className="duels">
      <div className="tl-head">
        <h1>{t('duels.title')}<span className="dot">.</span></h1>
        {data && (
          <div className="tl-actions">
            <span className="count">{t('duels.scanned', { n: data.matchCount })}</span>
            <button className="load-btn" onClick={handleRescan} disabled={busy}>
              {t('duels.refresh')}
            </button>
          </div>
        )}
      </div>
      <p className="sub">{t('duels.intro')}</p>

      <ScopePicker sessions={sessions} scope={scope} setScope={setScope} />

      {listStatus === 'error' && <p className="error">{listError}</p>}
      {scanStatus === 'loading' && (
        <p className="note">{t('duels.loadingMatches', { done: progress.done, total: progress.total || '…' })}</p>
      )}
      {scanStatus === 'empty' && <p className="note">{t('scope.emptyRange')}</p>}

      {data && scanStatus === 'ready' && (
        <>
          <div className="pool-head">{t('duels.players')}</div>
          <div className="duel-players">
            {allPlayers.map((id) => (
              <button
                key={id}
                className={`map ${selected.has(id) ? 'active' : ''} ${id === selfId ? 'self' : ''}`}
                onClick={() => toggle(id)}
                title={`${data.players[id]} · ${data.appearances[id]}`}
              >
                {data.players[id]}
              </button>
            ))}
          </div>

          {selIds.length < 2 ? (
            <p className="note">{t('duels.empty')}</p>
          ) : (
            <div className="table-wrap">
              <table className="duel-matrix">
                <thead>
                  <tr>
                    <th className="l corner">
                      <span className="corner-k">{t('duels.killer')} ↓</span>
                      <span className="corner-v">{t('duels.victim')} →</span>
                    </th>
                    {selIds.map((c) => (
                      <th key={c} className={c === selfId ? 'self' : ''} title={data.players[c]}>{short(data.players[c])}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selIds.map((r) => (
                    <tr key={r}>
                      <td className={`l ${r === selfId ? 'self' : ''}`} title={data.players[r]}>{data.players[r]}</td>
                      {selIds.map((c) => {
                        if (r === c) return <td key={c} className="diag" />
                        const f = kills(r, c), a = kills(c, r), net = f - a
                        return (
                          <td
                            key={c}
                            className={net > 0 ? 'pos' : net < 0 ? 'neg' : ''}
                            title={`${data.players[r]} ${f} : ${a} ${data.players[c]}`}
                          >
                            {f}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
