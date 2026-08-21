// Shared by Duels and Hall of Fame: fetch the raw recent-match list once,
// group it into sessions, and let the page pick either an "overall" window
// (last 3/6 months) or one specific session to scan stats for.
import { useEffect, useMemo, useState } from 'react'
import { fetchRecentMatchList, fetchMatchRoster, mapPool } from './fastcup.js'
import { groupIntoSessions, DEFAULT_SPAN_DAYS } from './sessions.js'

export const MONTHS_OPTIONS = [3, 6]
export const DEFAULT_MONTHS = 3
const MAX_MATCHES = 150
const MAX_MONTHS = 6 // raw fetch window — covers both the 3- and 6-month views without refetching

function loadCache(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null } catch { return null }
}
function saveCache(key, matchList) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), matchList })) } catch { /* quota */ }
}

export function scopeKeyOf(scope) {
  return scope.type === 'session' ? `session:${scope.id}` : `overall:${scope.months}`
}

export function useMatchScope(uid, cacheName) {
  const cacheKey = `${cacheName}-${uid}`
  const [matchList, setMatchList] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [scope, setScope] = useState({ type: 'overall', months: DEFAULT_MONTHS })

  useEffect(() => {
    if (!uid) return
    if (nonce === 0) {
      const cached = loadCache(cacheKey)
      if (cached?.matchList) { setMatchList(cached.matchList); setStatus('ready'); return }
    }
    let cancelled = false
    setStatus('loading'); setError('')
    const gt = new Date(Date.now() - MAX_MONTHS * 30 * 24 * 60 * 60 * 1000).toISOString()
    fetchRecentMatchList(uid, MAX_MATCHES, { gt })
      .then((list) => {
        if (cancelled) return
        saveCache(cacheKey, list)
        setMatchList(list)
        setStatus('ready')
      })
      .catch((e) => { if (!cancelled) { setError(e.message || String(e)); setStatus('error') } })
    return () => { cancelled = true }
  }, [uid, nonce]) // eslint-disable-line

  // Roster-aware session splitting needs each match's actual participant
  // list, which the lightweight match list doesn't carry. Fetching it for
  // all (up to 150) matches would be expensive, so only fetch it for matches
  // within DEFAULT_SPAN_DAYS of another match — an isolated match always
  // forms its own session regardless of roster, so it never needs one.
  const [rostersReady, setRostersReady] = useState(false)
  useEffect(() => {
    if (!matchList || !matchList.length) return
    let cancelled = false
    setRostersReady(false)
    const gapMs = DEFAULT_SPAN_DAYS * 24 * 60 * 60 * 1000
    const sorted = [...matchList].sort((a, b) => a.startedAt - b.startedAt)
    const candidates = sorted.filter((m, i) => {
      const prev = sorted[i - 1]
      const next = sorted[i + 1]
      return (prev && m.startedAt - prev.startedAt <= gapMs) || (next && next.startedAt - m.startedAt <= gapMs)
    })
    if (!candidates.length) { setRostersReady(true); return }
    mapPool(candidates, 6, async (m) => {
      try {
        const roster = await fetchMatchRoster(m.id)
        m.rosterIds = roster.map((p) => p.id)
      } catch { /* leave rosterIds unset — treated as "unknown, don't split" */ }
    }).then(() => { if (!cancelled) setRostersReady(true) })
    return () => { cancelled = true }
  }, [matchList])

  const sessions = useMemo(() => (matchList ? groupIntoSessions(matchList) : []), [matchList, rostersReady])

  const activeMatches = useMemo(() => {
    if (!matchList) return []
    if (scope.type === 'session') {
      return sessions.find((s) => s.id === scope.id)?.matches || []
    }
    const cutoff = Date.now() - scope.months * 30 * 24 * 60 * 60 * 1000
    return matchList.filter((m) => m.startedAt >= cutoff)
  }, [matchList, sessions, scope])

  return {
    status, error, sessions, scope, setScope, activeMatches,
    scopeKey: scopeKeyOf(scope),
    rescan: () => setNonce((n) => n + 1),
  }
}
