// Shared by Duels and Hall of Fame: fetch the raw recent-match list once,
// group it into sessions, and let the page pick either an "overall" window
// (last 3/6 months) or one specific session to scan stats for.
import { useEffect, useMemo, useState } from 'react'
import { fetchRecentMatchList } from './fastcup.js'
import { groupIntoSessions } from './sessions.js'

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

  const sessions = useMemo(() => (matchList ? groupIntoSessions(matchList) : []), [matchList])

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
