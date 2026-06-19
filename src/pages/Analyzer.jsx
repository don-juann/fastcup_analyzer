import { useEffect, useMemo, useState } from 'react'
import { groupIntoSessions, aggregateSession } from '../lib/sessions.js'
import { parseProfileId, fetchRecentMatchList, loadSessionMatches } from '../lib/fastcup.js'
import { useLang } from '../i18n.jsx'

export default function Analyzer() {
  const { t } = useLang()
  const [link, setLink] = useState('https://cs2.fastcup.net/id685178')
  const [userId, setUserId] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true); setSessions(null)
    try {
      const uid = parseProfileId(link)
      const list = await fetchRecentMatchList(uid)
      if (!list.length) throw new Error(t('analyzer.noMatches'))
      setUserId(uid)
      setSessions(groupIntoSessions(list))
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <p className="sub page-intro">{t('analyzer.intro')}</p>

      <form className="search" onSubmit={onSubmit}>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://cs2.fastcup.net/idXXXXXX"
          spellCheck={false}
        />
        <button type="submit" disabled={loading}>{loading ? t('analyzer.loading') : t('analyzer.analyze')}</button>
      </form>

      {error && <p className="error">{error}</p>}

      {sessions?.map((s, i) => (
        <SessionCard key={s.id} session={s} userId={userId} autoLoad={i === 0} />
      ))}
    </>
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
  const { t, lang } = useLang()
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
  const dateLabel = d.toLocaleDateString(lang === 'kk' ? 'kk' : 'en', { day: 'numeric', month: 'long', year: 'numeric' })
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
        <span className="count">{t('analyzer.matches', { n: session.matches.length })}</span>
      </div>

      <div className="filters">
        <button
          className={`map all ${selected === 'all' ? 'active' : ''}`}
          onClick={() => pick('all')}
        >
          {t('analyzer.allMaps')}
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

      {status === 'loading' && <p className="note">{t('analyzer.loadingBoards')}</p>}
      {status === 'error' && <p className="error">{err}</p>}
      {!matches && status === 'idle' && (
        <p className="note">{t('analyzer.selectMap')}</p>
      )}

      {agg && (
        <div className="table-wrap">
          <table className="stats">
            <thead>
              <tr>{COLS.map(([k, label]) => (
                <th
                  key={k}
                  className={k === 'nick' ? 'l' : ''}
                  title={k === 'sickFrags' ? t('analyzer.sickTip') : undefined}
                >
                  {k === 'nick' ? t('analyzer.player') : k === 'sickFrags' ? t('analyzer.sick') : label}
                </th>
              ))}</tr>
            </thead>
            {agg.sides.map((side) => (
              <tbody key={side.key} className="team-group">
                <tr className="team-row">
                  <td className="l" colSpan={COLS.length - 1}>
                    {t(side.key === 'you' ? 'analyzer.yourTeam' : 'analyzer.opponents')}
                  </td>
                  <td className="team-record">{t('analyzer.won', { w: side.wins, n: agg.matchCount })}</td>
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
  ['sick.oneShots', 'oneShots'], ['sick.noScopes', 'noScopes'],
  ['sick.airShots', 'airShots'], ['sick.wallBangs', 'wallBangs'],
]

function StatRow({ p, userId }) {
  const { t } = useLang()
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
                  {SICK_KINDS.map(([labelKey, key]) => (
                    <span key={key} className="tip-row">
                      <span>{t(labelKey)}</span><b>{p[key]}</b>
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
