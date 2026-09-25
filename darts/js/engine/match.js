// engine/match.js
// An X01 match is its settings plus an ordered list of visit events.
// Everything else (scores, legs, whose throw it is, who won) is derived by
// replaying those events. Undo is simply "drop the last event and replay".
//
// Matches are played between SIDES. A side is one or more players sharing one
// score. Everyone-for-themselves is just sides of one player each, so a normal
// game and a team game run through exactly the same code.
//
//   Throwing order: sides take turns; within a side, partners take turns.
//   2 v 2  -> A1 B1 A2 B2 ...        2 v 1 -> A1 B1 A2 B1 ...
//   Each new leg starts one place further round that cycle, so the sides take
//   turns to start and every player gets to lead off a leg.
//
// Events are small plain objects, safe to store and sync later:
//   { s: 60 }                          keypad total
//   { s: 32, n: 2, dd: 1 }             keypad checkout in 2 darts, 1 at a double
//   { d: ["T20", "S20", "D10"] }       dart by dart
//   { b: 1 }                           explicit bust
//   every event also carries p (the thrower, for readability) and t (time)

import { parseDart, dartCode } from "./board.js";
import { CHECK_IN, CHECK_OUT } from "./rules.js";
import { scoreVisit, normaliseRules, onAFinish } from "./visit.js";
import { cleanProfile } from "./nemesis/profile.js";

export const MAX_PLAYERS = 4;
export const START_SCORES = [101, 301, 501, 701];
export const MIN_START = 2;
export const MAX_START = 9999;
export const MULTIPLIERS = [0.5, 0.66, 0.75, 0.9, 1, 1.1, 1.25, 1.33, 1.5, 1.75, 2];

export function cleanStartScore(v, fallback = 501) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_START, Math.min(MAX_START, n));
}

export function newId(prefix = "m") {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand.replace(/-/g, "").slice(0, 16)}`;
}

// Handicaps: per-side overrides of the match rules. Returns null when the
// settings are identical to the match, so "no handicap" is always null.
export function cleanHandicap(h, match) {
  if (!h) return null;
  const multiplier = MULTIPLIERS.includes(Number(h.multiplier)) ? Number(h.multiplier) : 1;
  const out = {
    startScore: cleanStartScore(h.startScore, match.startScore),
    multiplier,
    checkIn: h.checkIn === CHECK_IN.DOUBLE ? CHECK_IN.DOUBLE : h.checkIn === CHECK_IN.STRAIGHT ? CHECK_IN.STRAIGHT : match.checkIn,
    checkOut: h.checkOut === CHECK_OUT.STRAIGHT ? CHECK_OUT.STRAIGHT : h.checkOut === CHECK_OUT.DOUBLE ? CHECK_OUT.DOUBLE : match.checkOut,
    finish: multiplier !== 1 || h.finish === "over" ? "over" : "exact",
  };
  const same =
    out.startScore === match.startScore &&
    out.multiplier === 1 &&
    out.checkIn === match.checkIn &&
    out.checkOut === match.checkOut &&
    out.finish === "exact";
  return same ? null : out;
}

// Two teams, every player on exactly one, nobody left out. Anything else: no teams.
function cleanTeams(teams, playerCount) {
  if (!Array.isArray(teams) || teams.length !== 2 || playerCount < 3) return null;
  const lists = teams.map((t) => (Array.isArray(t) ? t : t?.players));
  if (lists.some((l) => !Array.isArray(l) || l.length === 0)) return null;
  const all = lists.flat().map(Number);
  if (all.length !== playerCount || new Set(all).size !== playerCount) return null;
  if (all.some((i) => !Number.isInteger(i) || i < 0 || i >= playerCount)) return null;
  return lists.map((l) => l.map(Number));
}

// Build a clean, validated match config.
//   firstPlayer: a player index, "random", or "bull" (decided by throwing for the bull first)
//   teams: optional [[player indexes], [player indexes]] for a two-team match
//   teamHandicaps: optional [handicap, handicap] when playing in teams
export function createMatch({
  players,
  startScore = 501,
  checkIn = CHECK_IN.STRAIGHT,
  checkOut = CHECK_OUT.DOUBLE,
  format = { type: "firstTo", legs: 3 },
  firstPlayer = 0,
  trackDoubles = true,
  teams = null,
  teamHandicaps = null,
  id = newId("m"),
  createdAt = Date.now(),
} = {}) {
  if (!Array.isArray(players) || players.length < 1) throw new Error("A match needs at least one player");
  if (players.length > MAX_PLAYERS) throw new Error(`Up to ${MAX_PLAYERS} players`);

  const base = {
    startScore: cleanStartScore(startScore),
    checkIn: checkIn === CHECK_IN.DOUBLE ? CHECK_IN.DOUBLE : CHECK_IN.STRAIGHT,
    checkOut: checkOut === CHECK_OUT.STRAIGHT ? CHECK_OUT.STRAIGHT : CHECK_OUT.DOUBLE,
  };

  const teamLists = cleanTeams(teams, players.length);
  if (players.filter((p) => p.bot).length > 1) throw new Error("Only one Nemesis per match");

  const cleanPlayers = players.map((p, i) => {
    // In a team game the handicap belongs to the team, not the player.
    const handicap = teamLists ? null : cleanHandicap(p.handicap, base);
    return {
      id: String(p.id || `guest:${i}`),
      name: String(p.name || `Player ${i + 1}`).slice(0, 20),
      ...(p.owner ? { owner: true } : {}),
      ...(p.call ? { call: String(p.call).slice(0, 20) } : {}),
      ...(handicap ? { handicap } : {}),
      ...(p.bot ? { bot: { kind: "nemesis", profile: cleanProfile(p.bot.profile) } } : {}),
    };
  });

  const cleanTeamsCfg = teamLists
    ? teamLists.map((list, t) => {
        const handicap = cleanHandicap(teamHandicaps?.[t] ?? teams?.[t]?.handicap, base);
        return { players: list, ...(handicap ? { handicap } : {}) };
      })
    : null;

  const sideCount = cleanTeamsCfg ? 2 : cleanPlayers.length;
  const legs = Math.max(1, Math.min(21, Number(format?.legs) || 1));
  const type = sideCount === 2 && format?.type === "bestOf" ? "bestOf" : "firstTo";

  let first = firstPlayer;
  let bull = null;
  if (first === "bull" && sideCount > 1) {
    first = null; // decided on the bull screen before the first dart
    bull = { throws: [], winner: null };
  } else {
    if (first === "random" || first === "bull") first = Math.floor(Math.random() * cleanPlayers.length);
    first = Math.max(0, Math.min(cleanPlayers.length - 1, Number(first) || 0));
  }

  return {
    v: 1,
    id,
    kind: "x01",
    createdAt,
    ...base,
    format: { type, legs: type === "bestOf" && legs % 2 === 0 ? legs + 1 : legs },
    players: cleanPlayers,
    ...(cleanTeamsCfg ? { teams: cleanTeamsCfg } : {}),
    firstPlayer: first,
    ...(bull ? { bull } : {}),
    trackDoubles: Boolean(trackDoubles),
  };
}

// ---------------------------------------------------------------------------
// Sides
// ---------------------------------------------------------------------------

export function isTeamMatch(cfg) {
  return Array.isArray(cfg.teams) && cfg.teams.length === 2;
}

// Every side: { players: [indexes], handicap }.
export function sidesOf(cfg) {
  if (isTeamMatch(cfg)) return cfg.teams.map((t) => ({ players: t.players, handicap: t.handicap ?? null }));
  return cfg.players.map((p, i) => ({ players: [i], handicap: p.handicap ?? null }));
}

export function sideOfPlayer(cfg, p) {
  if (!isTeamMatch(cfg)) return p;
  return cfg.teams.findIndex((t) => t.players.includes(p));
}

// "Reech" for a solo side, "Reech & Dave" for a team.
export function sideName(cfg, s) {
  const side = sidesOf(cfg)[s];
  if (!side) return "";
  return side.players.map((p) => cfg.players[p].name).join(" & ");
}

// The rules one side plays under: the match rules plus its handicap.
export function sideRules(cfg, s) {
  const h = sidesOf(cfg)[s]?.handicap;
  return {
    startScore: h?.startScore ?? cfg.startScore,
    ...normaliseRules({
      checkIn: h?.checkIn ?? cfg.checkIn,
      checkOut: h?.checkOut ?? cfg.checkOut,
      finish: h?.finish ?? "exact",
      multiplier: h?.multiplier ?? 1,
    }),
    handicapped: Boolean(h),
  };
}

// The rules a given player throws under (their side's rules).
export function playerRules(cfg, p) {
  return sideRules(cfg, sideOfPlayer(cfg, p));
}

export function hasHandicaps(cfg) {
  return sidesOf(cfg).some((s) => s.handicap);
}

// True until the bull has been thrown for a match that starts that way.
export function needsBull(cfg) {
  return cfg.firstPlayer === null || cfg.firstPlayer === undefined;
}

// Who throws for the bull: the first player of each side.
export function bullThrowers(cfg) {
  return sidesOf(cfg).map((s) => s.players[0]);
}

export function describeHandicap(h, cfg) {
  if (!h) return null;
  const parts = [];
  if (h.startScore !== cfg.startScore) parts.push(`starts on ${h.startScore}`);
  if (h.multiplier !== 1) parts.push(`scores \u00d7${h.multiplier}`);
  if (h.checkIn !== cfg.checkIn) parts.push(h.checkIn === CHECK_IN.DOUBLE ? "double in" : "straight in");
  if (h.checkOut !== cfg.checkOut && h.finish !== "over") parts.push(h.checkOut === CHECK_OUT.STRAIGHT ? "straight out" : "double out");
  if (h.finish === "over") parts.push("can go over");
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Throwing order
// ---------------------------------------------------------------------------

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

// The repeating throwing order as a function of position.
function turnCycle(sides) {
  const S = sides.length;
  const lcm = sides.reduce((acc, s) => (acc * s.players.length) / gcd(acc, s.players.length), 1);
  const length = S * lcm;
  const at = (pos) => {
    const k = ((pos % length) + length) % length;
    const side = k % S;
    const players = sides[side].players;
    return { side, player: players[Math.floor(k / S) % players.length] };
  };
  return { length, at };
}

// Where in the cycle the first leg starts: the first slot of the first thrower.
function cycleOffset(cfg, cycle) {
  const first = cfg.firstPlayer ?? 0;
  for (let pos = 0; pos < cycle.length; pos++) if (cycle.at(pos).player === first) return pos;
  return 0;
}

export function legStartPosition(cfg, legIndex) {
  const cycle = turnCycle(sidesOf(cfg));
  return (cycleOffset(cfg, cycle) + legIndex) % cycle.length;
}

// Who leads off a given leg: { side, player }.
export function legStarter(cfg, legIndex) {
  const cycle = turnCycle(sidesOf(cfg));
  return cycle.at(cycleOffset(cfg, cycle) + legIndex);
}

// A rematch: the next player round the cycle leads off.
export function nextFirstPlayer(cfg) {
  return legStarter(cfg, 1).player;
}

// The throwing order written out once, as player indexes (for setup screens).
export function throwingOrder(cfg) {
  const cycle = turnCycle(sidesOf(cfg));
  const start = cycleOffset(cfg, cycle);
  return Array.from({ length: cycle.length }, (_, k) => cycle.at(start + k).player);
}

export function legsToWin(cfg) {
  return cfg.format.type === "bestOf" ? Math.floor(cfg.format.legs / 2) + 1 : cfg.format.legs;
}

export function describeFormat(cfg) {
  const n = cfg.format.legs;
  if (sidesOf(cfg).length === 1) return n === 1 ? "1 leg" : `${n} legs`;
  return cfg.format.type === "bestOf" ? `Best of ${n}` : `First to ${n}`;
}

export function describeRules(cfg) {
  const parts = [];
  if (cfg.checkIn === CHECK_IN.DOUBLE) parts.push("double in");
  parts.push(cfg.checkOut === CHECK_OUT.STRAIGHT ? "straight out" : "double out");
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function totalEvent(player, score, { dartsUsed = null, doubleDarts = null, checkInDart = null } = {}) {
  const e = { p: player, s: score, t: Date.now() };
  if (dartsUsed != null) e.n = dartsUsed;
  if (doubleDarts != null) e.dd = doubleDarts;
  if (checkInDart != null) e.ci = checkInDart;
  return e;
}

export function dartsEvent(player, darts) {
  return { p: player, d: darts.map(dartCode), t: Date.now() };
}

export function bustEvent(player, { doubleDarts = null } = {}) {
  const e = { p: player, b: 1, t: Date.now() };
  if (doubleDarts != null) e.dd = doubleDarts;
  return e;
}

function eventToInput(e) {
  if (e.b) return { kind: "bust" };
  if (Array.isArray(e.d)) return { kind: "darts", darts: e.d.map(parseDart) };
  return { kind: "total", score: e.s, dartsUsed: e.n, doubleDarts: e.dd, checkInDart: e.ci };
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------
// Leg fields: remaining and checkedIn are per SIDE; current is the side to
// throw and thrower is the player throwing for it.

function freshLeg(cfg, index, rules, cycle, offset) {
  const pos = (offset + index) % cycle.length;
  const first = cycle.at(pos);
  return {
    index,
    startPos: pos,
    starter: first.side,
    starterPlayer: first.player,
    current: first.side,
    thrower: first.player,
    remaining: rules.map((r) => r.startScore),
    checkedIn: rules.map((r) => r.checkIn !== CHECK_IN.DOUBLE),
    visits: [],
    winner: null,
  };
}

export function replay(cfg, events = []) {
  const sides = sidesOf(cfg);
  const S = sides.length;
  const need = legsToWin(cfg);
  const rules = sides.map((_, s) => sideRules(cfg, s));
  const cycle = turnCycle(sides);
  const offset = cycleOffset(cfg, cycle);
  const state = {
    cfg,
    sides,
    rules,
    legs: [freshLeg(cfg, 0, rules, cycle, offset)],
    legsWon: Array(S).fill(0),
    finished: false,
    winner: null,
    applied: 0,
    rejected: [],
  };

  for (let i = 0; i < events.length; i++) {
    if (state.finished) break;
    const leg = state.legs[state.legs.length - 1];
    const s = leg.current;
    const p = leg.thrower;
    const e = events[i];

    const r = rules[s];
    const startedIn = leg.checkedIn[s];
    const outcome = scoreVisit({
      remaining: leg.remaining[s],
      checkedIn: startedIn,
      rules: r,
      input: eventToInput(e),
    });
    if (!outcome.ok) {
      state.rejected.push({ index: i, error: outcome.error });
      continue;
    }

    leg.visits.push({
      eventIndex: i,
      player: p,
      side: s,
      round: Math.floor(leg.visits.length / S),
      start: leg.remaining[s],
      ...outcome,
      // Checkout percentages only make sense on normal rules.
      doubleDarts: r.handicapped ? null : outcome.doubleDarts,
      // A checkout chance: the visit started on a finish.
      chance: startedIn && onAFinish(leg.remaining[s], true, r),
      startedIn,
      t: e.t ?? null,
    });
    leg.remaining[s] = outcome.remaining;
    leg.checkedIn[s] = outcome.checkedIn;
    state.applied++;

    if (outcome.checkout) {
      leg.winner = s;
      state.legsWon[s]++;
      if (state.legsWon[s] >= need) {
        state.finished = true;
        state.winner = s;
      } else {
        state.legs.push(freshLeg(cfg, state.legs.length, rules, cycle, offset));
      }
    } else {
      const next = cycle.at(leg.startPos + leg.visits.length);
      leg.current = next.side;
      leg.thrower = next.player;
    }
  }

  return state;
}

// Convenience accessors used by the UI.
export function currentLeg(state) {
  return state.legs[state.legs.length - 1];
}

// The player to throw next, or null when the match is over.
export function currentPlayer(state) {
  return state.finished ? null : currentLeg(state).thrower;
}

export function lastVisit(state) {
  for (let l = state.legs.length - 1; l >= 0; l--) {
    const v = state.legs[l].visits;
    if (v.length) return v[v.length - 1];
  }
  return null;
}

// Who will throw next for a side: walk the throwing order from where the leg is now.
export function nextThrowerFor(state, side) {
  const leg = state.legs[state.legs.length - 1];
  const cycle = turnCycle(state.sides);
  for (let k = 0; k < cycle.length; k++) {
    const t = cycle.at(leg.startPos + leg.visits.length + k);
    if (t.side === side) return t.player;
  }
  return state.sides[side].players[0];
}

// Darts a player has thrown in a leg so far.
export function dartsInLeg(leg, player) {
  return leg.visits.reduce((sum, v) => (v.player === player ? sum + v.dartsUsed : sum), 0);
}

// Darts a whole side has thrown in a leg so far.
export function sideDartsInLeg(leg, side) {
  return leg.visits.reduce((sum, v) => (v.side === side ? sum + v.dartsUsed : sum), 0);
}
