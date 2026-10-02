// Client for fastcup's GraphQL (allowlisted ops), routed through our proxy.
// The three query strings in queries.json are byte-exact captures from the
// real frontend — they must NOT be edited or the allowlist rejects them.
import QUERIES from './queries.json'
import { computeMapStats, playedMaps } from './stats.js'
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

// The API returns just a bare filename (e.g. "1373933_888nf422a.webp") — the
// real site serves these from fastcup's own avatar CDN.
const avatarUrl = (filename) => (filename ? `https://cdn.fastcup.net/avatars/users/${filename}` : null)

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
      // one entry per match (a BO3/BO5 is a single match), but with each
      // played map's own result so callers can show/split them per map
      const maps = playedMaps(match).map((u) => ({
        id: u.id, number: u.number, mapId: u.mapId, mapName: mapName(u.mapId),
        teams: u.teams.map((t) => ({ id: t.id, score: t.score, isWinner: t.isWinner })),
      }))
      return {
        id: match.id,
        startedAt: ms(match.finishedAt),
        bestOf: match.bestOf,
        maps,
        mapName: maps.map((x) => x.mapName).join(' / ') || '—',
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

// Everything needed to compute stats for one match: the match itself (roster,
// teams, maps) plus the raw kill/damage/clutch events.
async function fetchMatchBundle(matchId) {
  const [detailData, killsData, damagesData, clutchesData] = await Promise.all([
    gql(QUERIES.getMatch, { matchId, gameId: GAME_ID }),
    gql(QUERIES.getMatchKills, { matchId }),
    gql(QUERIES.getMatchDamages, { matchId }),
    gql(QUERIES.getMatchClutches, { matchId }),
  ])
  const match = detailData.match
  const roster = (match?.members || [])
    .map((mem) => {
      const u = mem.private?.user
      return u ? { userId: u.id, nick: u.nickName, teamId: mem.matchTeamId, avatar: avatarUrl(u.avatar) } : null
    })
    .filter(Boolean)
  return {
    match, roster,
    kills: killsData.kills || [],
    damages: damagesData.damages || [],
    clutches: clutchesData.clutches || [],
  }
}

// Full per-player breakdown for one match, SPLIT BY MAP: a BO1 gives one entry,
// a BO3/BO5 gives one per played map, each with its own scoreline, round count
// and per-player stats (so ADR is per round of that map, not of the series).
export async function fetchMatchMaps(matchId) {
  const { match, roster, kills, damages, clutches } = await fetchMatchBundle(matchId)
  return computeMapStats(match, roster, kills, damages, clutches).map((u) => ({
    ...u,
    matchId: match.id,
    bestOf: match.bestOf,
    startedAt: ms(u.startedAt || match.startedAt || match.finishedAt),
    mapName: mapName(u.mapId),
  }))
}

// Load the per-map entries for every match in a session (list-level matches
// in -> one detailed entry per played map out, in play order), ready for
// aggregateSession().
export async function loadSessionMatches(session) {
  const perMatch = await Promise.all(session.matches.map((m) => fetchMatchMaps(m.id)))
  return perMatch.flat()
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
export async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const worker = async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// Scan a given list of matches (any subset — a whole history window, or a
// single session) and build a duel dataset:
//   players      id -> nick
//   appearances  id -> # matches the player was in
//   duels        "killerId>victimId" -> kill count (teamkills/suicides excluded)
export async function scanDuelData(matchList, { onProgress } = {}) {
  const players = {}
  const appearances = {}
  const duels = {}
  let done = 0

  await mapPool(matchList, 6, async (m) => {
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
    onProgress?.(++done, matchList.length)
  })

  return { players, appearances, duels, matchCount: matchList.length }
}

// Scan a given list of matches (any subset — a whole history window, or a
// single session) and compute Hall-of-Fame records:
//   players  id -> season totals (kills/deaths/assists/clutches/sick/fk/dmg/rounds/matches)
//   weapons  weaponId -> total kill count    weaponNames weaponId -> name (from highlights)
//   best     single-match record holders (matchKills, matchDeaths, …)
export async function scanHallOfFameData(matchList, { onProgress } = {}) {
  const players = {}
  const weapons = {}
  const weaponNames = {}
  const best = {}
  const consider = (key, value, holder) => {
    if (value == null) return
    const cur = best[key]
    if (!cur || value > cur.value) best[key] = { value, ...holder }
  }
  let done = 0

  await mapPool(matchList, 6, async (m) => {
    try {
      const { match, roster, kills, damages, clutches } = await fetchMatchBundle(m.id)
      if (!match) return

      // weapon names from highlights
      for (const mp of match.maps || []) {
        for (const h of mp.highlights || []) {
          for (const w of [h.primaryWeapon, h.secondaryWeapon]) {
            if (w?.id && w.name) weaponNames[w.id] = w.name
          }
        }
      }

      // Stats are per MAP, not per match: in a BO3/BO5 the match-level score is
      // the series score (e.g. 1:2), so using it as the round count would blow
      // ADR up, and single-map records would really be whole-series totals.
      for (const u of computeMapStats(match, roster, kills, damages, clutches)) {
        const rounds = u.rounds
        const ctx = { map: mapName(u.mapId), date: u.startedAt || match.startedAt }
        for (const p of u.players) {
          const tot = players[p.playerId] || (players[p.playerId] = { nick: p.nick, avatar: p.avatar, matches: 0, kills: 0, deaths: 0, assists: 0, clutches: 0, sick: 0, fk: 0, fd: 0, dmg: 0, rounds: 0 })
          tot.nick = p.nick || tot.nick
          tot.avatar = p.avatar || tot.avatar
          tot.matches++; tot.kills += p.kills; tot.deaths += p.deaths; tot.assists += p.assists
          tot.clutches += p.clutches; tot.sick += p.sickFrags; tot.fk += p.firstKills; tot.fd += p.firstDeaths
          tot.dmg += p.dmg; tot.rounds += rounds
          const h = { nick: p.nick, playerId: p.playerId, ctx }
          consider('matchKills', p.kills, h)
          consider('matchDeaths', p.deaths, h)
          consider('matchAssists', p.assists, h)
          consider('matchAdr', rounds > 0 ? Math.round(p.dmg / rounds) : null, h)
          consider('matchPlusMinus', p.kills - p.deaths, h)
          consider('matchSick', p.sickFrags, h)
        }
      }

      for (const k of kills) {
        if (!k.isTeamkill && k.weaponId && k.killerId && k.killerId !== k.victimId) {
          weapons[k.weaponId] = (weapons[k.weaponId] || 0) + 1
        }
      }
    } catch { /* skip failed match */ }
    onProgress?.(++done, matchList.length)
  })

  return { players, weapons, weaponNames, best, matchCount: matchList.length }
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
