// Player skill rating for the roster builder: maps raw aggregate match stats
// onto a fixed 50-100 scale. 50 is the floor of a genuinely poor showing and
// 100 is a practically unattainable, flawless one — these are NOT relative to
// the other players being rated. The anchors below are fixed CS2 competitive
// benchmarks, so two players' scores are directly comparable even if they
// never appear in the same roster together.
//
// Six per-round rates feed the score. Each is clamped between a floor (worth
// 0.0) and a ceiling (worth 1.0), blended toward a neutral 0.5 prior based on
// rounds played (Bayesian shrinkage) so a handful of lucky/unlucky rounds
// can't swing a new player to an extreme, then combined by weight:
//   ADR (30%), K/D diff (25%) — primary fragging impact
//   assists (15%), entry duels (15%), clutches (10%) — secondary contribution
//   flair/sick frags (5%) — a small bonus for flashy plays
//
// Role (fragger / support / versatile) is derived from the same numbers but
// is purely descriptive of play style — it never changes the score itself,
// so an equally good fragger and support player land on the same number.

const SHRINK_ROUNDS = 90 // ~5 matches worth of rounds before we trust the raw rate fully

// Ceilings are deliberately reachable by a genuinely strong casual/semi-competitive
// player (not just pro-level outliers) — with the old, stricter ceilings almost
// nobody ever cleared the gold threshold.
const ANCHORS = {
  adr: { floor: 35, ceil: 85 }, // damage per round
  kd: { floor: -0.30, ceil: 0.30 }, // (kills - deaths) per round
  assist: { floor: 0.03, ceil: 0.20 }, // assists per round
  entry: { floor: -0.06, ceil: 0.10 }, // (first kills - first deaths) per round
  clutch: { floor: 0, ceil: 0.05 }, // successful clutches per round
  flair: { floor: 0, ceil: 0.05 }, // sick frags per round
}

const WEIGHTS = { adr: 0.30, kd: 0.25, assist: 0.15, entry: 0.15, clutch: 0.10, flair: 0.05 }

const ROLE_GAP = 0.12 // min gap between the frag/support signals before we call it a role

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const goodness = (value, { floor, ceil }) => clamp01((value - floor) / (ceil - floor))
const shrink = (raw, rounds) => {
  const confidence = rounds / (rounds + SHRINK_ROUNDS)
  return confidence * raw + (1 - confidence) * 0.5
}

// agg: { kills, deaths, assists, clutches, sick, fk, fd, dmg, rounds, matches }
export function ratePlayer(agg) {
  const rounds = Math.max(agg.rounds || 0, 1)
  const rates = {
    adr: agg.dmg / rounds,
    kd: (agg.kills - agg.deaths) / rounds,
    assist: agg.assists / rounds,
    entry: (agg.fk - agg.fd) / rounds,
    clutch: agg.clutches / rounds,
    flair: agg.sick / rounds,
  }

  const g = {}
  for (const key of Object.keys(ANCHORS)) {
    g[key] = shrink(goodness(rates[key], ANCHORS[key]), agg.rounds || 0)
  }

  const composite = Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + g[k] * w, 0)
  const score = Math.round(50 + composite * 50)

  const fragSignal = g.adr * 0.5 + g.kd * 0.3 + g.entry * 0.2
  const supportSignal = g.assist * 0.6 + g.clutch * 0.4
  const gap = fragSignal - supportSignal
  const role = gap > ROLE_GAP ? 'fragger' : gap < -ROLE_GAP ? 'support' : 'versatile'

  return { score, role, rates, goodness: g }
}

// Card tier by score band: gold 85-100, silver 70-84, bronze 50-69.
export function tierOf(score) {
  if (score >= 85) return 'gold'
  if (score >= 70) return 'silver'
  return 'bronze'
}
