// Compute per-player stats for a single match from its raw events.
//   kills    -> K/D/A, sick frags, FK/FD (verified vs fastcup's own aggregates)
//   damages  -> ADR (sum of normalized/round-capped damage)
//   clutches -> real clutch wins (match_clutches.success)
//
// Per-player `dmg` (normalized damage) and the match `rounds` count are kept
// raw so the session aggregator can compute round-weighted ADR across matches.

export function computeMatchPlayers(roster, kills, damages = [], clutches = []) {
  const players = new Map()
  const teamOf = new Map()
  const blank = (id, nick, teamId, avatar) => ({
    playerId: id, nick: nick ?? String(id), teamId: teamId ?? null, avatar: avatar ?? null,
    kills: 0, deaths: 0, assists: 0, headshots: 0,
    firstKills: 0, firstDeaths: 0, clutches: 0,
    oneShots: 0, noScopes: 0, airShots: 0, wallBangs: 0,
    dmg: 0,
  })
  for (const r of roster) {
    teamOf.set(r.userId, r.teamId)
    players.set(r.userId, blank(r.userId, r.nick, r.teamId, r.avatar))
  }
  const ensure = (id) => {
    if (!players.has(id)) players.set(id, blank(id, null, teamOf.get(id)))
    return players.get(id)
  }

  // Kills -> K/D/A, headshots, sick frags
  for (const k of kills) {
    if (!k.isTeamkill && k.killerId && k.killerId !== k.victimId) {
      const p = ensure(k.killerId)
      p.kills++
      if (k.isHeadshot) p.headshots++
      if (k.isOneshot) p.oneShots++
      if (k.isNoscope) p.noScopes++
      if (k.isAirshot) p.airShots++
      if (k.isWallbang) p.wallBangs++
    }
    if (k.victimId) ensure(k.victimId).deaths++
    if (!k.isTeamkill && k.assistantId) ensure(k.assistantId).assists++
  }

  // First kill / first death per round (first cross-team frag in the round)
  const byRound = new Map()
  for (const k of kills) {
    if (!byRound.has(k.roundId)) byRound.set(k.roundId, [])
    byRound.get(k.roundId).push(k)
  }
  for (const roundKills of byRound.values()) {
    const opener = [...roundKills]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .find((k) => !k.isTeamkill && k.killerId && k.victimId && k.killerId !== k.victimId)
    if (opener) {
      ensure(opener.killerId).firstKills++
      ensure(opener.victimId).firstDeaths++
    }
  }

  // Damages -> normalized damage (ADR numerator), excluding self-damage
  for (const d of damages) {
    if (d.inflictorId && d.inflictorId !== d.victimId) {
      ensure(d.inflictorId).dmg += d.damageNormalized || 0
    }
  }

  // Clutches -> real successful clutches
  for (const c of clutches) {
    if (c.success && c.userId) ensure(c.userId).clutches++
  }

  return [...players.values()].map((p) => ({
    ...p, sickFrags: p.oneShots + p.noScopes + p.airShots + p.wallBangs,
  }))
}
