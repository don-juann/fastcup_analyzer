import { useEffect, useMemo, useState } from 'react'
import { groupIntoSessions, aggregateSession } from './lib/sessions.js'
import { parseProfileId, fetchRecentMatchList, loadSessionMatches } from './lib/fastcup.js'

export default function App() {
  const [link, setLink] = useState('https://cs2.fastcup.net/id685178')
  const [userId, setUserId] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState('light')

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true); setSessions(null)
    try {
      const uid = parseProfileId(link)
      const list = await fetchRecentMatchList(uid)
      if (!list.length) throw new Error('No recent matches found for this profile')
      setUserId(uid)
      setSessions(groupIntoSessions(list))
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <header className="head">
        <div>
          <h1>fastcup session analyzer<span className="dot">.</span></h1>
          <p className="sub">recent matches, grouped into sessions, combined into one table</p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? '☾ dark' : '☀ light'}
        </button>
      </header>

      <form className="search" onSubmit={onSubmit}>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://cs2.fastcup.net/idXXXXXX"
          spellCheck={false}
        />
        <button type="submit" disabled={loading}>{loading ? 'loading…' : 'analyze'}</button>
      </form>

      {error && <p className="error">{error}</p>}

      {sessions?.map((s, i) => (
        <SessionCard key={s.id} session={s} userId={userId} autoLoad={i === 0} />
      ))}
    </div>
  )
}

const COLS = [
  ['nick', 'player'], ['kills', 'K'], ['deaths', 'D'], ['assists', 'A'],
  ['plusMinus', '+/-'], ['adr', 'ADR'], ['sickFrags', 'sick'],
  ['firstKills', 'FK'], ['firstDeaths', 'FD'], ['clutches', 'CL'],
]

function lightScoreline(session, userId) {
  return session.matches.map((m) => {
    const mine = m.teams.find((t) => t.id === m.myTeamId)
    const opp = m.teams.find((t) => t.id !== m.myTeamId)
    return { mapName: m.mapName, you: mine?.score ?? 0, opp: opp?.score ?? 0, won: !!mine?.isWinner }
  })
}

function SessionCard({ session, userId, autoLoad }) {
  const [matches, setMatches] = useState(null) // normalized full matches
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [err, setErr] = useState('')
  const [selected, setSelected] = useState('all') // 'all' | match index

  async function ensureLoaded() {
    if (matches || status === 'loading') return
    setStatus('loading'); setErr('')
    try {
      setMatches(await loadSessionMatches(session))
      setStatus('done')
    } catch (e) {
      setErr(e.message || String(e)); setStatus('error')
    }
  }

  useEffect(() => { if (autoLoad) ensureLoaded() }, []) // eslint-disable-line

  function pick(sel) { setSelected(sel); ensureLoaded() }

  const d = new Date(session.startedAt)
  const dateLabel = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const chips = lightScoreline(session, userId) // every map, always shown

  const agg = useMemo(() => {
    if (!matches) return null
    const subset = selected === 'all' ? matches : [matches[selected]]
    return aggregateSession({ ...session, matches: subset }, userId)
  }, [matches, selected, userId, session])

  return (
    <section className="session">
      <div className="session-head">
        <h2>{dateLabel}</h2>
        <span className="count">{session.matches.length} matches</span>
      </div>

      <div className="filters">
        <button
          className={`map all ${selected === 'all' ? 'active' : ''}`}
          onClick={() => pick('all')}
        >
          all maps
        </button>
        {chips.map((m, i) => (
          <button
            key={i}
            className={`map ${m.won ? 'win' : 'loss'} ${selected === i ? 'active' : ''}`}
            onClick={() => pick(i)}
          >
            {m.mapName} <b>{m.you}:{m.opp}</b>
          </button>
        ))}
      </div>

      {status === 'loading' && <p className="note">loading scoreboards…</p>}
      {status === 'error' && <p className="error">{err}</p>}
      {!matches && status === 'idle' && (
        <p className="note">select a map (or “all maps”) to load player stats</p>
      )}

      {agg && (
        <div className="table-wrap">
          <table className="stats">
            <thead>
              <tr>{COLS.map(([k, label]) => (
                <th
                  key={k}
                  className={k === 'nick' ? 'l' : ''}
                  title={k === 'sickFrags' ? 'one-shots + no-scopes + airshots + wallbangs' : undefined}
                >
                  {label}
                </th>
              ))}</tr>
            </thead>
            {agg.sides.map((side) => (
              <tbody key={side.key} className="team-group">
                <tr className="team-row">
                  <td className="l" colSpan={COLS.length - 1}>{side.label}</td>
                  <td className="team-record">{side.wins}/{agg.matchCount} won</td>
                </tr>
                {side.players.map((p) => <StatRow key={p.playerId} p={p} userId={userId} />)}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  )
}

const SICK_KINDS = [
  ['one-shots', 'oneShots'], ['no-scopes', 'noScopes'],
  ['airshots', 'airShots'], ['wallbangs', 'wallBangs'],
]

function StatRow({ p, userId }) {
  const [tip, setTip] = useState(null)

  function showTip(e) {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ x: r.left + r.width / 2, y: r.top })
  }

  return (
    <tr className={p.playerId === userId ? 'me' : ''}>
      {COLS.map(([k]) => {
        if (k === 'nick') return <td key={k} className="l">{p.nick}</td>
        if (k === 'adr') {
          const ok = Number.isFinite(p.adr)
          return <td key={k} className={ok ? '' : 'muted'}>{ok ? Math.round(p.adr) : '—'}</td>
        }
        if (k === 'plusMinus') {
          const v = p.plusMinus
          return <td key={k} className={v > 0 ? 'pos' : v < 0 ? 'neg' : ''}>{v > 0 ? `+${v}` : v}</td>
        }
        if (k === 'sickFrags') {
          return (
            <td
              key={k}
              className="sick-cell"
              onMouseEnter={showTip}
              onMouseLeave={() => setTip(null)}
            >
              {p.sickFrags}
              {tip && (
                <span className="tip" style={{ left: tip.x, top: tip.y }}>
                  {SICK_KINDS.map(([label, key]) => (
                    <span key={key} className="tip-row">
                      <span>{label}</span><b>{p[key]}</b>
                    </span>
                  ))}
                </span>
              )}
            </td>
          )
        }
        return <td key={k}>{p[k]}</td>
      })}
    </tr>
  )
}
