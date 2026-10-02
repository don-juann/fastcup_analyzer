// Compute per-player stats for a single match from its raw events.
//   kills    -> K/D/A, sick frags, FK/FD (verified vs fastcup's own aggregates)
//   damages  -> ADR (sum of normalized/round-capped damage)
//   clutches -> real clutch wins (match_clutches.success)
//
// Per-player `dmg` (normalized damage) and the match `rounds` count are kept
// raw so the session aggregator can compute round-weighted ADR across matches.

// A BO3/BO5 is ONE fastcup match that holds several maps, and its match-level
// team score is the SERIES score (maps won, e.g. 1:2) — not rounds. Per-map
// results live in teams[].mapStats. Maps that were listed but never played
// (a 2:0 sweep, an aborted series) show up with 0:0 / no stats, so they're
// dropped. Works on both the lightweight list shape and the full match, as
// both carry maps[].id, teams[].score/isWinner and teams[].mapStats[].
//
// Returns [{ id (match_map id), number, mapId, teams: [{id,name,score,isWinner}], rounds }]
export function playedMaps(match) {
  const teams = match.teams || []
  const maps = [...(match.maps || [])] // already ordered by number from the API
  const single = maps.length <= 1
  const units = maps.map((mp, i) => {
    const perTeam = teams.map((t) => {
      const s = (t.mapStats || []).find((x) => x.matchMapId === mp.id)
      // a one-map match without mapStats: the match score IS the map score
      const src = s || (single ? t : null)
      return { id: t.id, name: t.name, score: src?.score ?? 0, isWinner: !!src?.isWinner }
    })
    return {
      id: mp.id, number: mp.number ?? i + 1, mapId: mp.mapId,
      startedAt: mp.startedAt ?? null, teams: perTeam,
      rounds: perTeam.reduce((n, t) => n + (t.score || 0), 0),
    }
  })
  return single ? units : units.filter((u) => u.rounds > 0)
}

// Kills/damages/clutches only carry a roundId (kills and clutches also a
// timestamp, damages don't), so attribute each round to a map by when its
// first timestamped event happened: the latest map that had already started.
// Damage-only rounds (no kill or clutch to date them) borrow the map of the
// nearest earlier dated round — round ids only ever increase through a match.
//
// units: playedMaps() output (needs .startedAt). Returns Map<roundId, unitIndex>.
export function assignRoundsToMaps(units, kills = [], damages = [], clutches = []) {
  const starts = units.map((u) => (u.startedAt ? Date.parse(u.startedAt) : -Infinity))
  const unitAt = (iso) => {
    const t = Date.parse(iso)
    let idx = 0
    for (let i = 0; i < starts.length; i++) if (t >= starts[i]) idx = i
    return idx
  }

  const dated = new Map() // roundId -> unit index, from the earliest event in the round
  const earliest = new Map()
  for (const e of [...kills, ...clutches]) {
    if (e.roundId == null || !e.createdAt) continue
    if (!earliest.has(e.roundId) || e.createdAt < earliest.get(e.roundId)) {
      earliest.set(e.roundId, e.createdAt)
      dated.set(e.roundId, unitAt(e.createdAt))
    }
  }

  const known = [...dated.keys()].sort((a, b) => a - b)
  const out = new Map(dated)
  const allIds = new Set([...kills, ...damages, ...clutches].map((e) => e.roundId))
  for (const r of allIds) {
    if (r == null || out.has(r)) continue
    let idx = known.length ? dated.get(known[0]) : 0
    for (const k of known) { if (k <= r) idx = dated.get(k); else break }
    out.set(r, idx)
  }
  return out
}

// Split a match's raw events by map: one entry per PLAYED map, each with its
// own team scores, round count and per-player stats.
//   match: full __GetMatch payload (needs maps, teams.mapStats)
//   roster: [{ userId, nick, teamId, avatar }]
export function computeMapStats(match, roster, kills, damages = [], clutches = []) {
  const units = playedMaps(match)
  const roundMap = units.length > 1 ? assignRoundsToMaps(units, kills, damages, clutches) : null
  const pick = (events, i) => (roundMap ? events.filter((e) => roundMap.get(e.roundId) === i) : events)

  return units.map((u, i) => {
    const mk = pick(kills, i)
    const rounds = u.rounds || new Set(mk.map((k) => k.roundId)).size
    return {
      ...u,
      rounds,
      players: computeMatchPlayers(roster, mk, pick(damages, i), pick(clutches, i)),
    }
  })
}

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
