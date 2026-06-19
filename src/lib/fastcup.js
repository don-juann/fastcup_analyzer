// Client for fastcup's GraphQL (allowlisted ops), routed through our proxy.
// The three query strings in queries.json are byte-exact captures from the
// real frontend — they must NOT be edited or the allowlist rejects them.
import QUERIES from './queries.json'
import { computeMatchPlayers } from './stats.js'
import { mapName, setMaps } from './maps.js'

const GAME_ID = 3 // CS2

// Fetch the map id->name table once and cache it.
let mapsPromise = null
export function ensureMaps() {
  if (!mapsPromise) {
    mapsPromise = gql(QUERIES.getMaps, { gameId: GAME_ID })
      .then((d) => setMaps(d.maps))
      .catch(() => {}) // fall back to the static seed in maps.js
  }
  return mapsPromise
}

async function gql(query, variables) {
  const res = await fetch('/api/gql/hasura', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '))
  return json.data
}

const ms = (iso) => new Date(iso).getTime()

// "https://cs2.fastcup.net/id685178" | "id685178" | "685178" -> 685178
export function parseProfileId(input) {
  const m = String(input).trim().match(/(?:id)?(\d+)\D*$/)
  if (!m) throw new Error('Could not find a user id in that link')
  return Number(m[1])
}

// Lightweight recent-matches list: enough to draw scorelines and group into
// sessions without fetching every scoreboard up front.
export async function fetchRecentMatchList(userId, limit = 16, { gt } = {}) {
  await ensureMaps()
  const data = await gql(QUERIES.getUserMatches, {
    userId, gameId: GAME_ID, hasWinner: true, order: 'desc', limit, gt,
  })
  return data.matchMemberships
    .filter((mm) => mm.match && mm.match.finishedAt)
    .map((mm) => {
      const match = mm.match
      const maps = (match.maps || []).map((x) => x.mapId)
      return {
        id: match.id,
        startedAt: ms(match.finishedAt),
        mapName: maps.map(mapName).join(' / ') || '—',
        teams: [...(match.teams || [])].map((t) => ({ id: t.id, score: t.score, isWinner: t.isWinner })),
        myTeamId: mm.matchTeamId,
        userKda: {
          k: match.killsAggregate?.aggregate?.count ?? 0,
          d: match.deathsAggregate?.aggregate?.count ?? 0,
          a: match.assistsAggregate?.aggregate?.count ?? 0,
        },
      }
    })
}

// Full per-player breakdown for one match: roster + team names from __GetMatch,
// per-player stats computed from the raw kill events.
export async function fetchMatchFull(matchId) {
  const [detailData, killsData, damagesData, clutchesData] = await Promise.all([
    gql(QUERIES.getMatch, { matchId, gameId: GAME_ID }),
    gql(QUERIES.getMatchKills, { matchId }),
    gql(QUERIES.getMatchDamages, { matchId }),
    gql(QUERIES.getMatchClutches, { matchId }),
  ])
  const match = detailData.match
  const kills = killsData.kills || []
  const damages = damagesData.damages || []
  const clutches = clutchesData.clutches || []

  const roster = (match.members || [])
    .map((mem) => {
      const u = mem.private?.user
      return u ? { userId: u.id, nick: u.nickName, teamId: mem.matchTeamId } : null
    })
    .filter(Boolean)

  const players = computeMatchPlayers(roster, kills, damages, clutches)
  const maps = (match.maps || []).map((x) => x.mapId)
  const teams = [...(match.teams || [])].map((t) => ({
    id: t.id, name: t.name, score: t.score, isWinner: t.isWinner,
  }))
  const rounds = teams.reduce((n, t) => n + (t.score || 0), 0)

  return {
    id: match.id,
    startedAt: ms(match.startedAt || match.finishedAt),
    mapName: maps.map(mapName).join(' / ') || '—',
    teams,
    rounds,
    players,
  }
}

// Load full normalized matches for a session (list-level matches in -> detailed
// matches out), ready for aggregateSession().
export async function loadSessionMatches(session) {
  return Promise.all(session.matches.map((m) => fetchMatchFull(m.id)))
}

// Just the roster of a match (lightweight — no kills/damages).
export async function fetchMatchRoster(matchId) {
  const data = await gql(QUERIES.getMatch, { matchId, gameId: GAME_ID })
  return (data.match?.members || [])
    .map((mem) => {
      const u = mem.private?.user
      return u ? { id: u.id, nick: u.nickName } : null
    })
    .filter(Boolean)
}

// Raw kill events for a match.
export async function fetchMatchKills(matchId) {
  const data = await gql(QUERIES.getMatchKills, { matchId })
  return data.kills || []
}

// Run async tasks with bounded concurrency.
async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const worker = async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// Scan the user's matches over the last `months` and build a duel dataset:
//   players      id -> nick
//   appearances  id -> # matches the player was in
//   duels        "killerId>victimId" -> kill count (teamkills/suicides excluded)
export async function fetchDuelData(userId, { months = 6, maxMatches = 60, onProgress } = {}) {
  const gt = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString()
  const list = await fetchRecentMatchList(userId, maxMatches, { gt })

  const players = {}
  const appearances = {}
  const duels = {}
  let done = 0

  await mapPool(list, 6, async (m) => {
    try {
      const [roster, kills] = await Promise.all([fetchMatchRoster(m.id), fetchMatchKills(m.id)])
      for (const p of roster) {
        players[p.id] = p.nick
        appearances[p.id] = (appearances[p.id] || 0) + 1
      }
      for (const k of kills) {
        if (k.isTeamkill || !k.killerId || !k.victimId || k.killerId === k.victimId) continue
        const key = `${k.killerId}>${k.victimId}`
        duels[key] = (duels[key] || 0) + 1
      }
    } catch { /* skip a failed match */ }
    onProgress?.(++done, list.length)
  })

  return { players, appearances, duels, matchCount: list.length }
}

// Distinct players the user has recently played with (teammates + opponents),
// excluding the user themselves. Scans the rosters of recent matches.
export async function fetchPlayedWith(userId, maxMatches = 12) {
  const list = await fetchRecentMatchList(userId, maxMatches)
  const rosters = await Promise.all(
    list.slice(0, maxMatches).map((m) => fetchMatchRoster(m.id).catch(() => [])),
  )
  const byId = new Map()
  for (const roster of rosters) {
    for (const p of roster) {
      if (p.id !== userId && !byId.has(p.id)) byId.set(p.id, p.nick)
    }
  }
  return [...byId].map(([id, nick]) => ({ id, nick }))
}
