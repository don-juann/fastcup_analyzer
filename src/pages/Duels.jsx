import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { useLang } from '../i18n.jsx'
import { fetchDuelData } from '../lib/fastcup.js'

const short = (nick) => (nick.length > 9 ? nick.slice(0, 8) + '…' : nick)

// Per-account cache so the tab loads instantly without re-hitting the API.
const cacheKey = (uid) => `fc-duels-${uid}`
function loadCache(uid) {
  try { const r = localStorage.getItem(cacheKey(uid)); return r ? JSON.parse(r) : null } catch { return null }
}
function saveCache(uid, data) {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify({ ts: Date.now(), data })) } catch { /* quota */ }
}

export default function Duels() {
  const { user, ready } = useAuth()
  const { t } = useLang()
  const [data, setData] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [nonce, setNonce] = useState(0)

  function applyData(d) {
    setData(d)
    const ids = Object.keys(d.appearances).sort((a, b) => d.appearances[b] - d.appearances[a])
    const sel = new Set(ids.slice(0, 12))
    const selfId = String(user.fastcupId)
    if (d.players[selfId]) sel.add(selfId)
    setSelected(sel)
    setStatus('ready')
  }

  useEffect(() => {
    if (!ready || !user) return
    const uid = user.fastcupId

    // On a normal visit (not a manual rescan), use the cached scan if present.
    if (nonce === 0) {
      const cached = loadCache(uid)
      if (cached?.data) { applyData(cached.data); return }
    }

    let cancelled = false
    setStatus('loading'); setError(''); setProgress({ done: 0, total: 0 })
    fetchDuelData(uid, { onProgress: (done, total) => !cancelled && setProgress({ done, total }) })
      .then((d) => { if (cancelled) return; saveCache(uid, d); applyData(d) })
      .catch((e) => { if (!cancelled) { setError(e.message || String(e)); setStatus('error') } })
    return () => { cancelled = true }
  }, [ready, user, nonce]) // eslint-disable-line

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  if (ready && !user) return <Navigate to="/" replace />

  const selfId = user ? String(user.fastcupId) : null
  const allPlayers = data ? Object.keys(data.appearances).sort((a, b) => data.appearances[b] - data.appearances[a]) : []
  const selIds = allPlayers.filter((id) => selected.has(id))
  const kills = (a, b) => data?.duels?.[`${a}>${b}`] || 0

  return (
    <div className="duels">
      <div className="tl-head">
        <h1>{t('duels.title')}<span className="dot">.</span></h1>
        {data && (
          <div className="tl-actions">
            <span className="count">{t('duels.scanned', { n: data.matchCount })}</span>
            <button className="load-btn" onClick={() => setNonce((n) => n + 1)} disabled={status === 'loading'}>
              {t('duels.refresh')}
            </button>
          </div>
        )}
      </div>
      <p className="sub">{t('duels.intro')}</p>

      {status === 'loading' && (
        <p className="note">{t('duels.loadingMatches', { done: progress.done, total: progress.total || '…' })}</p>
      )}
      {status === 'error' && <p className="error">{error}</p>}

      {data && status !== 'loading' && (
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
