import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core'
import { useAuth } from '../auth.jsx'
import { useLang } from '../i18n.jsx'
import { fetchRecentMatchList, scanHallOfFameData, parseProfileId } from '../lib/fastcup.js'
import { ratePlayer, tierOf } from '../lib/rating.js'

const MONTHS_OPTIONS = [3, 6]
const TEAM_SIZE = 5

const poolCacheKey = (uid) => `fc-roster-pool-${uid}`
function loadPoolCache(uid) {
  try { const r = localStorage.getItem(poolCacheKey(uid)); return r ? JSON.parse(r) : null } catch { return null }
}
function savePoolCache(uid, entry) {
  try { localStorage.setItem(poolCacheKey(uid), JSON.stringify(entry)) } catch { /* quota */ }
}

const teamsCacheKey = (uid) => `fc-roster-teams-${uid}`
function loadTeamsCache(uid) {
  try { const r = localStorage.getItem(teamsCacheKey(uid)); return r ? JSON.parse(r) : null } catch { return null }
}
function saveTeamsCache(uid, teams) {
  try { localStorage.setItem(teamsCacheKey(uid), JSON.stringify(teams)) } catch { /* quota */ }
}

function buildPool(playersById) {
  const built = {}
  for (const [id, agg] of Object.entries(playersById)) {
    built[id] = { id, nick: agg.nick, avatar: agg.avatar, agg, rating: ratePlayer(agg) }
  }
  return built
}

export default function RosterBuilder() {
  const { user, ready } = useAuth()
  const { t } = useLang()
  const uid = user?.fastcupId

  const [months, setMonths] = useState(3)
  const [pool, setPool] = useState({})
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')

  const [teamA, setTeamA] = useState([])
  const [teamB, setTeamB] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [addLink, setAddLink] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  )

  // Base candidate pool: everyone seen across the account's recent matches.
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    async function run() {
      setStatus('loading'); setError(''); setProgress({ done: 0, total: 0 })
      const cached = loadPoolCache(uid)
      if (cached?.months === months && cached?.pool) {
        setPool(cached.pool); setStatus('ready'); return
      }
      try {
        const gt = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString()
        const matches = await fetchRecentMatchList(uid, 150, { gt })
        const data = await scanHallOfFameData(matches, {
          onProgress: (done, total) => !cancelled && setProgress({ done, total }),
        })
        if (cancelled) return
        const built = buildPool(data.players)
        setPool(built)
        savePoolCache(uid, { months, pool: built })
        setStatus('ready')
      } catch (e) {
        if (!cancelled) { setError(e.message || String(e)); setStatus('error') }
      }
    }
    run()
    return () => { cancelled = true }
  }, [uid, months])

  // Restore the last team arrangement for this account. `hydrated` is state
  // (not a ref) so it lands in the SAME batched render as the restored
  // teamA/teamB — a ref flips synchronously within this same effect pass,
  // before the save-effect below ever sees the restored values, and the
  // save fires first with the stale empty arrays and clobbers the cache.
  const [teamsHydrated, setTeamsHydrated] = useState(false)
  useEffect(() => {
    if (!uid) return
    const cached = loadTeamsCache(uid)
    if (cached) { setTeamA(cached.teamA || []); setTeamB(cached.teamB || []) }
    setTeamsHydrated(true)
  }, [uid])

  useEffect(() => {
    if (uid && teamsHydrated) saveTeamsCache(uid, { teamA, teamB })
  }, [uid, teamA, teamB, teamsHydrated])

  if (ready && !user) return <Navigate to="/" replace />

  const assigned = new Set([...teamA, ...teamB])
  const poolIds = Object.keys(pool)
    .filter((id) => !assigned.has(id))
    .sort((a, b) => pool[b].rating.score - pool[a].rating.score)

  function removeFromTeams(id) {
    setTeamA((a) => a.filter((x) => x !== id))
    setTeamB((b) => b.filter((x) => x !== id))
  }

  function onDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return
    const id = String(active.id)
    const dest = over.id
    if (dest === 'teamA') {
      if (teamA.includes(id) || teamA.length >= TEAM_SIZE) return
      removeFromTeams(id); setTeamA((a) => [...a, id])
    } else if (dest === 'teamB') {
      if (teamB.includes(id) || teamB.length >= TEAM_SIZE) return
      removeFromTeams(id); setTeamB((b) => [...b, id])
    } else {
      removeFromTeams(id)
    }
  }

  async function addPlayer(e) {
    e.preventDefault()
    const raw = addLink.trim()
    if (!raw) return
    setAdding(true); setAddError('')
    try {
      const id = parseProfileId(raw)
      if (pool[String(id)]) { setAddLink(''); return }
      const gt = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString()
      const matches = await fetchRecentMatchList(id, 60, { gt })
      const data = await scanHallOfFameData(matches)
      const agg = data.players[id]
      if (!agg) throw new Error(t('roster.noMatches'))
      setPool((p) => {
        const next = { ...p, [String(id)]: { id: String(id), nick: agg.nick, avatar: agg.avatar, agg, rating: ratePlayer(agg) } }
        savePoolCache(uid, { months, pool: next })
        return next
      })
      setAddLink('')
    } catch (err) {
      setAddError(err.message || String(err))
    } finally {
      setAdding(false)
    }
  }

  function autoBalance() {
    const ids = [...teamA, ...teamB]
    if (ids.length < 2 || ids.length % 2 !== 0) return
    const half = ids.length / 2
    const scoreOf = (id) => pool[id]?.rating.score ?? 75
    let best = null
    const combo = (start, chosen) => {
      if (chosen.length === half) {
        const rest = ids.filter((id) => !chosen.includes(id))
        const sa = chosen.reduce((s, id) => s + scoreOf(id), 0)
        const sb = rest.reduce((s, id) => s + scoreOf(id), 0)
        const diff = Math.abs(sa - sb)
        if (!best || diff < best.diff) best = { a: chosen, b: rest, diff }
        return
      }
      for (let i = start; i < ids.length; i++) combo(i + 1, [...chosen, ids[i]])
    }
    combo(0, [])
    if (best) { setTeamA(best.a); setTeamB(best.b) }
  }

  function clearTeams() {
    setTeamA([])
    setTeamB([])
  }

  const avgOf = (ids) => (ids.length ? Math.round(ids.reduce((s, id) => s + (pool[id]?.rating.score || 0), 0) / ids.length) : 0)
  const avgA = avgOf(teamA), avgB = avgOf(teamB)
  const assignedCount = teamA.length + teamB.length
  const canBalance = assignedCount >= 2 && assignedCount % 2 === 0

  return (
    <div className="roster">
      <h1>{t('roster.title')}<span className="dot">.</span></h1>
      <p className="sub">{t('roster.intro')}</p>

      <div className="roster-controls-row">
        <form className="add-row roster-add-row" onSubmit={addPlayer}>
          <input
            value={addLink}
            onChange={(e) => setAddLink(e.target.value)}
            placeholder="https://cs2.fastcup.net/idXXXXXX"
            spellCheck={false}
            disabled={adding}
          />
          <button type="submit" disabled={adding}>{adding ? '…' : t('roster.addPlayer')}</button>
        </form>
        <div className="mode-toggle scope-months">
          {MONTHS_OPTIONS.map((n) => (
            <button key={n} className={months === n ? 'active' : ''} onClick={() => setMonths(n)}>
              {t('scope.months', { n })}
            </button>
          ))}
        </div>
      </div>
      {addError && <p className="error">{addError}</p>}

      {status === 'loading' && (
        <p className="note">{t('duels.loadingMatches', { done: progress.done, total: progress.total || '…' })}</p>
      )}
      {status === 'error' && <p className="error">{error}</p>}

      {status === 'ready' && (
        <DndContext
          sensors={sensors}
          onDragStart={({ active }) => setActiveId(active.id)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <ShieldClipDef />

          <div className="roster-workspace-outer">
            <div className="roster-workspace">
              <div className="roster-build">
                <TeamZone id="teamA" label={t('roster.teamA')} ids={teamA} pool={pool} t={t} />

                <div className="roster-compare">
                  <div className="roster-total">
                    <span className="roster-total-label">{t('roster.teamA')}</span>
                    <span className="roster-total-score">{avgA || '—'}</span>
                  </div>
                  <div className="roster-compare-actions">
                    <button className="load-btn" onClick={autoBalance} disabled={!canBalance}>
                      {t('roster.autoBalance')}
                    </button>
                    <button className="load-btn" onClick={clearTeams} disabled={!assignedCount}>
                      {t('roster.clear')}
                    </button>
                  </div>
                  <div className="roster-total">
                    <span className="roster-total-label">{t('roster.teamB')}</span>
                    <span className="roster-total-score">{avgB || '—'}</span>
                  </div>
                </div>

                <TeamZone id="teamB" label={t('roster.teamB')} ids={teamB} pool={pool} t={t} />
              </div>

              <div className="roster-sidebar">
                <div className="pool-head">{t('roster.pool')}</div>
                <Dropzone id="pool" className="pool roster-pool">
                  {poolIds.length
                    ? poolIds.map((id) => <RosterCard key={id} id={id} p={pool[id]} t={t} />)
                    : <span className="pool-empty">{t('roster.poolEmpty')}</span>}
                </Dropzone>
              </div>
            </div>
          </div>

          <DragOverlay>{activeId ? <RosterCard id={activeId} p={pool[activeId]} t={t} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

function TeamZone({ id, label, ids, pool, t }) {
  // Highest rating on the left, descending to the right.
  const sorted = [...ids].sort((a, b) => (pool[b]?.rating.score || 0) - (pool[a]?.rating.score || 0))
  return (
    <div className="roster-team">
      <div className="roster-team-head">{label} <span className="count">{ids.length}/{TEAM_SIZE}</span></div>
      <Dropzone id={id} className="roster-team-drop">
        {sorted.map((pid) => <RosterCard key={pid} id={pid} p={pool[pid]} t={t} />)}
        {Array.from({ length: TEAM_SIZE - ids.length }).map((_, i) => (
          <div key={`empty-${i}`} className="fifa-frame fifa-slot-empty" />
        ))}
      </Dropzone>
    </div>
  )
}

function Dropzone({ id, className, children }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} className={`${className}${isOver ? ' over' : ''}`}>{children}</div>
}

// Original shield/banner silhouette (not a trace of any specific trading-card
// brand's artwork) — referenced by every card via clip-path: url(#...).
function ShieldClipDef() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <clipPath id="fifa-shield-clip" clipPathUnits="objectBoundingBox">
          <path d="M0.06,0.13 C0.06,0.05 0.13,0.02 0.20,0.02 L0.40,0.02 C0.44,0.02 0.47,0.05 0.50,0.07 C0.53,0.05 0.56,0.02 0.60,0.02 L0.80,0.02 C0.87,0.02 0.94,0.05 0.94,0.13 L0.94,0.88 C0.94,0.93 0.91,0.96 0.85,0.98 C0.74,1.0 0.62,1.0 0.50,1.0 C0.38,1.0 0.26,1.0 0.15,0.98 C0.09,0.96 0.06,0.93 0.06,0.88 Z" />
        </clipPath>
      </defs>
    </svg>
  )
}

function RosterCard({ id, p, t, overlay }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  if (!p) return null
  const r = p.rating
  const tier = tierOf(r.score)
  const initials = p.nick.slice(0, 2).toUpperCase()
  const breakdown = [
    `ADR ${Math.round(r.rates.adr)}`,
    `K-D ${r.rates.kd >= 0 ? '+' : ''}${r.rates.kd.toFixed(2)}/rd`,
    `assists ${r.rates.assist.toFixed(2)}/rd`,
    `entry ${r.rates.entry >= 0 ? '+' : ''}${r.rates.entry.toFixed(2)}/rd`,
    `clutches ${r.rates.clutch.toFixed(2)}/rd`,
  ].join(' · ')

  const stat = (g) => Math.round(g * 99)
  const stats = [
    ['KD', stat(r.goodness.kd)],
    ['ADR', stat(r.goodness.adr)],
    ['AST', stat(r.goodness.assist)],
    ['DUEL', stat(r.goodness.entry)],
    ['CLU', stat(r.goodness.clutch)],
    ['SICK', stat(r.goodness.flair)],
  ]

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`fifa-frame tier-${tier}${isDragging ? ' dragging' : ''}${overlay ? ' overlay' : ''}`}
      title={breakdown}
    >
      <div className="fifa-card">
        <div className="fifa-photo-wrap" title={p.nick}>
          {p.avatar
            ? <img className="fifa-avatar" src={p.avatar} alt="" />
            : <span className="fifa-avatar fifa-avatar-fallback">{initials}</span>}
          <span className="fifa-score-badge">{r.score}</span>
        </div>
        <span className="fifa-role">{t(`roster.role.${r.role}`)}</span>
        <div className="fifa-divider" />
        <div className="fifa-stats">
          {stats.map(([label, val]) => (
            <div className="fifa-stat" key={label}>
              <span className="fifa-stat-val">{val}</span>
              <span className="fifa-stat-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
