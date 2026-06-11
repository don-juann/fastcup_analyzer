// Pure logic: group matches into "sessions" and aggregate per-player stats.
//
// Session rule: matches stay in one session while within a ~2-day span of each
// other, capped at 5 matches. A bigger gap or the 6th match starts a new one.
//
// Team grouping is USER-CENTRIC: match team ids change every game, so we split
// players into "your team" vs "opponents" by who shared the viewed user's team
// in each match, then aggregate each player across the whole session.

export const DEFAULT_SPAN_DAYS = 2
export const MAX_MATCHES_PER_SESSION = 5

// matches need: { id, startedAt(ms) } at minimum for grouping.
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
    if (!current || tooFar || tooMany) {
      current = { startedAt: m.startedAt, endedAt: m.startedAt, matches: [] }
      sessions.push(current)
    }
    current.matches.push(m)
    current.endedAt = m.startedAt
  }

  sessions.forEach((s) => {
    s.id = String(s.startedAt)
    s.matches.sort((a, b) => a.startedAt - b.startedAt)
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
