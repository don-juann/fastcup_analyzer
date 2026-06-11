// Temporary sample data so the UI is real before the live queries are wired.
// Shape mirrors what __GetMatch + the (pending) scoreboard query will give us:
// each match has two teams and 10 players tagged with teamId.
const TEAM_A = 49679246
const TEAM_B = 49679247
const ROSTER = [
  ['giovana', TEAM_A], ['shadyman', TEAM_A], ['arkhatiko', TEAM_A], ['hellaguap', TEAM_A], ['VANDAMM', TEAM_A],
  ['a1byn', TEAM_B], ['bmw M3cs', TEAM_B], ['hangoover', TEAM_B], ['AL1ZH', TEAM_B], ['Gunch1k', TEAM_B],
]

function player(nick, teamId, i) {
  const base = teamId === TEAM_A ? 2 : 0
  return {
    playerId: nick, nick, teamId,
    kills: 16 + ((i * 5 + base) % 11), deaths: 14 + ((i * 3) % 8), assists: 3 + (i % 6),
    adr: 70 + ((i * 7 + base * 4) % 45),
    firstKills: 1 + (i % 4), firstDeaths: 1 + ((i + 1) % 4), clutches: i % 3 === 0 ? 1 : 0,
    oneShots: i % 2, noScopes: i % 5 === 0 ? 1 : 0, airShots: 0, wallBangs: i % 4 === 0 ? 1 : 0,
  }
}

function match(id, mapName, startedAt, scoreA, scoreB) {
  return {
    id, mapName, startedAt,
    teams: [
      { id: TEAM_A, name: 'Team A', score: scoreA, isWinner: scoreA > scoreB },
      { id: TEAM_B, name: 'Team B', score: scoreB, isWinner: scoreB > scoreA },
    ],
    players: ROSTER.map(([nick, teamId], i) => player(nick, teamId, i)),
  }
}

const FEB28 = new Date('2026-02-28T20:00:00').getTime()
const JUN04 = new Date('2026-06-04T17:38:00').getTime()
const H = 60 * 60 * 1000

// Feb 28 session (4 matches, one night) and a Jun 4–5 session that spans two
// days (3 on the 4th + 1 just after midnight on the 5th) to exercise the rule.
export const MOCK_MATCHES = [
  match(101, 'Mirage', FEB28, 16, 14),
  match(102, 'Ancient', FEB28 + 1 * H, 8, 13),
  match(103, 'Dust2', FEB28 + 2 * H, 12, 16),
  match(104, 'Nuke', FEB28 + 3.2 * H, 16, 19),
  match(201, 'Inferno', JUN04, 16, 14),
  match(202, 'Anubis', JUN04 + 1.5 * H, 13, 16),
  match(203, 'Mirage', JUN04 + 3 * H, 16, 9),
  match(204, 'Nuke', JUN04 + 7 * H, 19, 16), // tips just past midnight into Jun 5
]
