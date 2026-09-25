// engine/stats.js
// Every number shown anywhere in the app comes from here, computed from a
// replayed match. Nothing is stored twice, so stats can never drift from the
// visits they're built on.
//
// Averages use what a player actually threw (raw), so a handicap multiplier
// never inflates them. Checkout records aren't kept for handicapped players,
// because their finishes aren't real checkouts.

import { replay, sideOfPlayer } from "./match.js";
import { isArcade } from "./arcade/core.js";

function emptyTotals() {
  return {
    points: 0,
    darts: 0,
    first9Points: 0,
    first9Darts: 0,
    highest: 0,
    s60: 0, // 60–99
    s100: 0, // 100–139
    s140: 0, // 140–179
    s180: 0,
    busts: 0,
    checkouts: 0,
    chances: 0, // visits that started on a finish
    highestCheckout: 0,
    tonPlusCheckouts: 0,
    doublesThrown: 0, // darts at a double, where known
    doublesHit: 0,
    checkInDarts: 0, // double in: darts thrown to get started, where known
    checkIns: 0,
    legsPlayed: 0,
    legsWon: 0,
    bestLeg: null, // fewest darts in a won leg
    wonLegDarts: 0,
    visits: 0,
    handicapped: false,
  };
}

function pointsOf(v) {
  return v.bust ? 0 : (v.raw ?? v.counted);
}

function addVisit(t, v, visitNumberInLeg, handicapped) {
  t.visits++;
  t.darts += v.dartsUsed;
  if (v.bust) t.busts++;
  const pts = pointsOf(v);
  t.points += pts;
  t.highest = Math.max(t.highest, pts);
  if (pts === 180) t.s180++;
  else if (pts >= 140) t.s140++;
  else if (pts >= 100) t.s100++;
  else if (pts >= 60) t.s60++;

  if (visitNumberInLeg < 3) {
    t.first9Points += pts;
    t.first9Darts += v.dartsUsed;
  }
  if (v.doubleDarts != null) {
    t.doublesThrown += v.doubleDarts;
    if (v.checkout) t.doublesHit++;
  }
  if (v.chance) t.chances++;
  if (v.checkout) {
    t.checkouts++;
    if (!handicapped) {
      t.highestCheckout = Math.max(t.highestCheckout, pts);
      if (pts >= 100) t.tonPlusCheckouts++;
    }
  }
}

// Double in: the darts it took to get started in one leg, if we know them all.
// sideVisits: every visit by the player's side in the leg. A team checks in once,
// so each player is credited with their own attempts, and the check-in goes to
// whoever hit the double.
function addCheckIn(t, sideVisits, player) {
  const before = sideVisits.filter((v) => v.startedIn === false);
  if (!before.length) return;
  if (before.some((v) => v.checkInDarts == null)) return; // not tracked this leg
  const mine = before.filter((v) => v.player === player);
  t.checkInDarts += mine.reduce((sum, v) => sum + v.checkInDarts, 0);
  t.checkIns += mine.filter((v) => v.checkedIn).length;
}

export function average(points, darts) {
  return darts > 0 ? (points / darts) * 3 : null;
}

function finalise(t) {
  return {
    ...t,
    avg: average(t.points, t.darts),
    first9: average(t.first9Points, t.first9Darts),
    checkoutPct: t.doublesThrown > 0 ? (t.doublesHit / t.doublesThrown) * 100 : null,
    checkInPct: t.checkInDarts > 0 ? (t.checkIns / t.checkInDarts) * 100 : null,
    avgLegDarts: t.legsWon > 0 ? t.wonLegDarts / t.legsWon : null,
  };
}

// Totals for every PLAYER across a set of legs. A player's scoring comes only
// from their own visits. Legs won and best legs belong to the side, so in a
// team game both partners are credited with the team's legs.
function accumulate(state, legs) {
  const cfg = state.cfg;
  const n = cfg.players.length;
  const sides = state.sides;
  const totals = Array.from({ length: n }, emptyTotals);
  const handicapped = cfg.players.map((_, p) => Boolean(sides[sideOfPlayer(cfg, p)]?.handicap));
  handicapped.forEach((h, p) => (totals[p].handicapped = h));

  for (const leg of legs) {
    const counters = Array(n).fill(0);
    const sideDarts = Array(sides.length).fill(0);
    let anyVisit = false;
    for (const v of leg.visits) {
      addVisit(totals[v.player], v, counters[v.player]++, handicapped[v.player]);
      sideDarts[v.side ?? v.player] += v.dartsUsed;
      anyVisit = true;
    }
    if (!anyVisit) continue;
    // Double in is shared by a team, so check-in darts are counted per side and credited to each member.
    for (let sd = 0; sd < sides.length; sd++) {
      const sideVisits = leg.visits.filter((v) => (v.side ?? v.player) === sd);
      for (const p of sides[sd].players) addCheckIn(totals[p], sideVisits, p);
    }
    if (leg.winner !== null) {
      for (let p = 0; p < n; p++) totals[p].legsPlayed++;
      const darts = sideDarts[leg.winner];
      for (const p of sides[leg.winner].players) {
        const w = totals[p];
        w.legsWon++;
        w.wonLegDarts += darts;
        if (!handicapped[p]) w.bestLeg = w.bestLeg === null ? darts : Math.min(w.bestLeg, darts);
      }
    }
  }

  return totals.map(finalise);
}

// Stats for every player across the whole match.
export function matchStats(state) {
  return accumulate(state, state.legs);
}

// Stats for every player in one leg.
export function legStats(state, legIndex) {
  const leg = state.legs[legIndex];
  return leg ? accumulate(state, [leg]) : matchStats({ ...state, legs: [] });
}

// Stats for one player within one leg, from the leg alone.
export function legPlayerStats(leg, player) {
  const t = emptyTotals();
  let k = 0;
  for (const v of leg.visits) {
    if (v.player !== player) continue;
    addVisit(t, v, k++, false);
  }
  return finalise(t);
}

// One row per finished leg, for match summaries.
export function legSummaries(state) {
  return state.legs
    .filter((leg) => leg.winner !== null)
    .map((leg) => {
      const perPlayer = state.cfg.players.map((_, p) => legPlayerStats(leg, p));
      const last = leg.visits[leg.visits.length - 1];
      return {
        index: leg.index,
        starter: leg.starter,
        winner: leg.winner, // a side
        finisher: last ? last.player : null, // the player who hit the checkout
        checkout: last ? pointsOf(last) : null,
        winnerDarts: leg.visits.filter((v) => (v.side ?? v.player) === leg.winner).reduce((a, v) => a + v.dartsUsed, 0),
        perPlayer,
      };
    });
}

// ---------------------------------------------------------------------------
// Lifetime stats across saved matches, for one player id (the device owner).
// ---------------------------------------------------------------------------

const MAX_KEYS = new Set(["highest", "highestCheckout"]);
const SKIP_KEYS = new Set(["bestLeg", "handicapped"]);

// Your averages count every dart you throw. Your win record is split: matches
// against friends, and matches against Nemesis (so a 40-average bot never pads it).
export function lifetimeStats(records, playerId) {
  const t = emptyTotals();
  let matches = 0;
  let wins = 0;
  let contested = 0; // matches against friends
  let nemesisPlayed = 0;
  let nemesisWins = 0;
  let bestMatchAvg = null;
  const series = []; // per match, oldest first: { at, avg, first9, startScore }

  const sorted = [...records].sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));

  for (const rec of sorted) {
    if (isArcade(rec.cfg)) continue; // arcade games never touch your X01 numbers
    const p = rec.cfg.players.findIndex((pl) => pl.id === playerId);
    if (p < 0) continue;
    const state = replay(rec.cfg, rec.events);
    const s = matchStats(state)[p];
    matches++;
    if (state.sides.length > 1) {
      const mine = sideOfPlayer(rec.cfg, p);
      const bot = rec.cfg.players.findIndex((pl) => pl.bot);
      const againstNemesis = bot >= 0 && sideOfPlayer(rec.cfg, bot) !== mine;
      if (againstNemesis) {
        nemesisPlayed++;
        if (state.winner === mine) nemesisWins++;
      } else {
        contested++;
        if (state.winner === mine) wins++;
      }
    }
    for (const key of Object.keys(t)) {
      if (SKIP_KEYS.has(key)) continue;
      if (MAX_KEYS.has(key)) t[key] = Math.max(t[key], s[key]);
      else t[key] += s[key];
    }
    if (s.bestLeg !== null) t.bestLeg = t.bestLeg === null ? s.bestLeg : Math.min(t.bestLeg, s.bestLeg);
    if (s.avg !== null) {
      bestMatchAvg = bestMatchAvg === null ? s.avg : Math.max(bestMatchAvg, s.avg);
      series.push({ id: rec.id, at: rec.finishedAt, avg: s.avg, first9: s.first9, startScore: rec.cfg.startScore });
    }
  }

  return {
    ...finalise(t),
    matches,
    contested,
    wins,
    losses: contested - wins,
    winRate: contested > 0 ? (wins / contested) * 100 : null,
    nemesisPlayed,
    nemesisWins,
    bestMatchAvg,
    series,
  };
}

// Your recent form: the mean of your last few match averages (null if none yet).
export function recentAverage(records, playerId, n = 10) {
  const series = lifetimeStats(records, playerId).series.slice(-n);
  return series.length ? series.reduce((a, s) => a + s.avg, 0) / series.length : null;
}
