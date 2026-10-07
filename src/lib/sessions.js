// Pure logic: group matches into "sessions" and aggregate per-player stats.
//
// Session rule: matches stay in one session while within a ~2-day span of each
// other, capped at 5 matches, AND (when roster data is available — see below)
// while the same 10 players keep playing together. Any one of a bigger gap,
// the 6th match, or the roster changing starts a new session. Time/count
// alone would let two genuinely unrelated get-togethers a day and a half
// apart — zero overlapping players — land in one group, with the 5-match cap
// then slicing the boundary at an arbitrary point inside it rather than where
// the players actually changed.
//
// A BO3/BO5 series always forms a session of its own, apart from the BO1s
// played before or after it.
//
// Roster-awareness is opt-in: pass each match's `.rosterIds` (all participant
// ids) if you have them. Callers that don't fetch rosters (cheaper, but blind
// to this failure mode) just get the old time/count-only behavior — matches
// with no `.rosterIds` are treated as "unknown, don't split on this".
//
// Team grouping is USER-CENTRIC: match team ids change every game, so we split
// players into "your team" vs "opponents" by who shared the viewed user's team
// in each match, then aggregate each player across the whole session.

export const DEFAULT_SPAN_DAYS = 2
export const MAX_MATCHES_PER_SESSION = 5

const sameRoster = (a, b) => {
  if (!a || !b) return true // unknown roster (not fetched) — don't split on missing data
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((id) => setA.has(id))
}

// A best-of-3/5 series (one fastcup match holding several maps), as opposed to
// a plain single-map match.
const isSeries = (m) => (m.bestOf ?? 1) > 1 || (m.maps?.length ?? 0) > 1

// matches need: { id, startedAt(ms) } at minimum for grouping, plus optional
// `.rosterIds` (array of participant ids) to also split on roster changes.
export function groupIntoSessions(matches, {
  spanDays = DEFAULT_SPAN_DAYS,
  maxMatches = MAX_MATCHES_PER_SESSION,
} = {}) {
  const gapMs = spanDays * 24 * 60 * 60 * 1000
  const sorted = [...matches].sort((a, b) => a.startedAt - b.startedAt)

  const sessions = []
  let current = null
  for (const m of sorted) {
    const tooFar = current && m.startedAt - current.endedAt > gapMs
    const tooMany = current && current.matches.length >= maxMatches
    const rosterChanged = current && !sameRoster(current.lastRosterIds, m.rosterIds)
    // a BO3/BO5 is its own session: never merged with the matches before or after it
    const seriesBreak = current && (current.series || isSeries(m))
    if (!current || tooFar || tooMany || rosterChanged || seriesBreak) {
      current = { startedAt: m.startedAt, endedAt: m.startedAt, matches: [], series: isSeries(m) }
      sessions.push(current)
    }
    current.matches.push(m)
    current.endedAt = m.startedAt
    current.lastRosterIds = m.rosterIds
  }

  sessions.forEach((s) => {
    s.id = String(s.startedAt)
    s.matches.sort((a, b) => a.startedAt - b.startedAt)
    delete s.lastRosterIds
    delete s.series
  })
  return sessions.reverse() // newest session first
}

const SUM_KEYS = [
  'kills', 'deaths', 'assists', 'headshots',
  'firstKills', 'firstDeaths', 'clutches',
  'oneShots', 'noScopes', 'airShots', 'wallBangs',
]

// session.matches must be FULL normalized matches (with .players and .teams).
// userId = the viewed profile's user id, used to anchor "your team".
export function aggregateSession(session, userId) {
  const byPlayer = new Map()
  const wins = { you: 0, opp: 0 }
  const scoreline = []

  for (const match of session.matches) {
    const me = match.players.find((p) => p.playerId === userId)
    const myTeamId = me ? me.teamId : null
    const myTeam = match.teams.find((t) => t.id === myTeamId)
    const oppTeam = match.teams.find((t) => t.id !== myTeamId)
    const won = !!myTeam?.isWinner
    if (won) wins.you++; else wins.opp++

    scoreline.push({
      mapName: match.mapName,
      you: myTeam?.score ?? 0,
      opp: oppTeam?.score ?? 0,
      won,
    })

    const rounds = match.rounds ?? match.teams.reduce((n, t) => n + (t.score || 0), 0)
    for (const p of match.players) {
      const side = myTeamId != null && p.teamId === myTeamId ? 'you' : 'opp'
      let row = byPlayer.get(p.playerId)
      if (!row) {
        row = { playerId: p.playerId, nick: p.nick, matches: 0, _side: { you: 0, opp: 0 }, _dmg: 0, _rounds: 0 }
        for (const k of SUM_KEYS) row[k] = 0
        byPlayer.set(p.playerId, row)
      }
      row.nick = p.nick || row.nick
      row.matches += 1
      row._side[side] += 1
      row._dmg += p.dmg || 0
      row._rounds += rounds
      for (const k of SUM_KEYS) row[k] += p[k] || 0
    }
  }

  const finalize = (row) => {
    row.plusMinus = row.kills - row.deaths
    row.sickFrags = row.oneShots + row.noScopes + row.airShots + row.wallBangs
    row.adr = row._rounds > 0 ? row._dmg / row._rounds : null
    row.side = row._side.you >= row._side.opp ? 'you' : 'opp'
    delete row._side; delete row._dmg; delete row._rounds
    return row
  }
  const all = [...byPlayer.values()].map(finalize)
  const sortRows = (a, b) => b.plusMinus - a.plusMinus || b.kills - a.kills

  const sides = [
    { key: 'you', label: 'Your team', wins: wins.you, players: all.filter((p) => p.side === 'you').sort(sortRows) },
    { key: 'opp', label: 'Opponents', wins: wins.opp, players: all.filter((p) => p.side === 'opp').sort(sortRows) },
  ]

  return { sides, scoreline, matchCount: session.matches.length }
}

// Every played map of a session as { matchId, mapName, you, opp, won }, in
// play order, from lightweight match-list entries (no per-player detail
// needed). A BO3/BO5 contributes one row per map; an entry without per-map
// data falls back to its match-level score.
export function sessionMaps(session) {
  return session.matches.flatMap((m) => {
    const maps = m.maps?.length ? m.maps : [{ id: m.id, mapName: m.mapName, teams: m.teams }]
    return maps.map((mp) => {
      const mine = mp.teams.find((t) => t.id === m.myTeamId)
      const opp = mp.teams.find((t) => t.id !== m.myTeamId)
      return {
        key: `${m.id}:${mp.id}`, matchId: m.id, matchMapId: mp.id,
        mapName: mp.mapName, bestOf: m.bestOf,
        you: mine?.score ?? 0, opp: opp?.score ?? 0, won: !!mine?.isWinner,
      }
    })
  })
}

// Cheap per-session record (map count + W/L per map). Used for session-picker
// summaries.
export function summarizeSession(session) {
  const maps = sessionMaps(session)
  const wins = maps.filter((m) => m.won).length
  return { mapCount: maps.length, wins, losses: maps.length - wins }
}
