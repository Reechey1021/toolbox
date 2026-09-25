// engine/arcade/modes.js
// The rules of each arcade game. The core (core.js) handles rounds, equal
// visits, ties, multiple games and who throws; a mode only says:
//   input          "total" (a visit score on the keypad) or "darts" (the target pad)
//   init(o)        a player's starting state
//   applyVisit     what one visit does: returns { ps, value, text }
//   done(ps, o)    finished early? (Race target, clock completed, a Shanghai)
//   limit(o)       rounds in a game, or null for "until someone's done"
//   score(ps)      what's compared when the rounds run out (higher is better)
//   keys(ps, o)    the target pad's keys for the next dart
//   card(ps, o)    what the scoreboard shows
//   stats(ps)      numbers for the summary

import { makeDart, parseDart, dartCode, MISS } from "../board.js";

const dart = (seg, mult) => (seg === 0 ? MISS : makeDart(seg, mult));
const key = (label, d, tone = "") => ({ label, code: dartCode(d), tone });
const missKey = () => key("Miss", MISS, "miss");
const parseAll = (codes) => (codes || []).map(parseDart);

// ---------------------------------------------------------------------------
// High Score and Race: points on the keypad
// ---------------------------------------------------------------------------

const scoring = {
  input: "total",
  init: () => ({ points: 0, visits: 0, best: 0 }),
  applyVisit(ps, e) {
    const s = Math.max(0, Math.min(180, Math.round(Number(e.s) || 0)));
    const next = { points: ps.points + s, visits: ps.visits + 1, best: Math.max(ps.best, s) };
    return { ps: next, value: s, text: `scored ${s}` };
  },
  score: (ps) => ps.points,
  stats: (ps) => [
    ["Points", ps.points],
    ["Best visit", ps.best],
    ["Per visit", ps.visits ? (ps.points / ps.visits).toFixed(1) : "–"],
  ],
};

const highscore = {
  ...scoring,
  id: "highscore",
  name: "High Score",
  blurb: "Most points in a set number of visits.",
  defaults: { visits: 10 },
  limit: (o) => o.visits,
  done: () => false,
  card: (ps, o) => ({ big: ps.points, sub: `Visit ${Math.min(ps.visits + 1, o.visits)} of ${o.visits}`, last: ps.visits }),
  describe: (o) => `${o.visits} ${o.visits === 1 ? "visit" : "visits"}`,
  record: { label: "Best total", read: (ps) => ps.points, better: "high" },
};

const race = {
  ...scoring,
  id: "race",
  name: "Race",
  blurb: "First to a target score. Same number of visits each.",
  defaults: { target: 600 },
  limit: () => null,
  done: (ps, o) => ps.points >= o.target,
  card: (ps, o) => ({ big: ps.points, sub: ps.points >= o.target ? "There" : `${o.target - ps.points} to go` }),
  describe: (o) => `first to ${o.target}`,
  record: { label: "Fewest visits", read: (ps, o) => (ps.points >= o.target ? ps.visits : null), better: "low" },
};

// ---------------------------------------------------------------------------
// Around the Clock: 1 to 20 (or 20 to 1), then the bull
// ---------------------------------------------------------------------------
// o.order "up" | "down"; o.bull "none" | "any" (25 or bull) | "bull" (inner only);
// o.hits "any" | "doubles" | "trebles"; o.jumps: a double or treble moves you on 2 or 3.

function clockTargets(o) {
  const nums = Array.from({ length: 20 }, (_, i) => (o.order === "down" ? 20 - i : i + 1));
  return o.bull === "none" ? nums : [...nums, 25];
}

function clockHit(d, target, o) {
  if (d.seg !== target) return 0;
  if (target === 25) return o.bull === "bull" ? (d.mult === 2 ? 1 : 0) : 1;
  if (o.hits === "doubles") return d.mult === 2 ? 1 : 0;
  if (o.hits === "trebles") return d.mult === 3 ? 1 : 0;
  return o.jumps ? d.mult : 1;
}

const clock = {
  id: "clock",
  name: "Around the Clock",
  blurb: "Hit every number in order, then the bull.",
  input: "darts",
  defaults: { order: "up", bull: "any", hits: "any", jumps: false },
  init: () => ({ pos: 0, darts: 0, hits: 0, finishedIn: null }),
  limit: () => null,
  targets: clockTargets,
  done: (ps, o) => ps.pos >= clockTargets(o).length,
  applyVisit(ps, e, o) {
    const list = clockTargets(o);
    const bullAt = list.indexOf(25);
    let { pos, darts, hits, finishedIn } = ps;
    const start = pos;
    let used = 0;
    for (const d of parseAll(e.d)) {
      used++;
      // Once finished (sudden death), darts at the last target just count as hits.
      const target = list[Math.min(pos, list.length - 1)];
      let step = clockHit(d, target, o);
      if (step && pos < list.length) {
        hits++;
        // A jump can't skip the bull: it lands on it.
        let to = pos + step;
        if (bullAt >= 0 && pos < bullAt && to > bullAt) to = bullAt;
        pos = Math.min(to, list.length);
        if (pos >= list.length) {
          finishedIn = darts + used;
          break;
        }
      } else if (step) hits++;
    }
    darts += used;
    const moved = pos - start;
    const value = moved || (ps.pos >= list.length ? parseAll(e.d).filter((d) => clockHit(d, list[list.length - 1], o)).length : 0);
    return { ps: { pos, darts, hits, finishedIn }, value, text: moved ? `moved on ${moved}` : "no hits" };
  },
  score: (ps) => ps.pos,
  keys(ps, o) {
    const list = clockTargets(o);
    const t = list[Math.min(ps.pos, list.length - 1)];
    if (t === 25) return o.bull === "bull" ? [key("Bull", dart(25, 2), "hit"), missKey()] : [key("25", dart(25, 1), "hit"), key("Bull", dart(25, 2), "hit"), missKey()];
    if (o.hits === "doubles") return [key(`D${t}`, dart(t, 2), "hit"), missKey()];
    if (o.hits === "trebles") return [key(`T${t}`, dart(t, 3), "hit"), missKey()];
    return [key(`${t}`, dart(t, 1), "hit"), key(`D${t}`, dart(t, 2), "hit"), key(`T${t}`, dart(t, 3), "hit"), missKey()];
  },
  card(ps, o) {
    const list = clockTargets(o);
    if (ps.pos >= list.length) return { big: "Done", sub: `${ps.finishedIn ?? ps.darts} darts` };
    const t = list[ps.pos];
    return { big: t === 25 ? "Bull" : t, sub: `${ps.pos} of ${list.length} done` };
  },
  stats: (ps) => [
    ["Darts", ps.finishedIn ?? ps.darts],
    ["Hits", ps.hits],
    ["Hit rate", ps.darts ? `${Math.round((ps.hits / ps.darts) * 100)}%` : "–"],
  ],
  describe: (o) =>
    [o.order === "down" ? "20 to 1" : "1 to 20", o.bull === "none" ? "no bull" : o.bull === "bull" ? "then the bull" : "then 25 or bull", o.hits !== "any" ? `${o.hits} only` : o.jumps ? "doubles and trebles jump" : null]
      .filter(Boolean)
      .join(", "),
  record: { label: "Fewest darts", read: (ps) => ps.finishedIn, better: "low" },
};

// ---------------------------------------------------------------------------
// Bull game: 25 scores 1, the bull scores 3
// ---------------------------------------------------------------------------
// o.goal "visits" | "points"; o.visits; o.target

const bullgame = {
  id: "bullgame",
  name: "Bull game",
  blurb: "Only the bull counts: 25 is 1 point, bull is 3.",
  input: "darts",
  defaults: { goal: "visits", visits: 10, target: 30 },
  init: () => ({ points: 0, visits: 0, bulls: 0, outers: 0, best: 0 }),
  limit: (o) => (o.goal === "visits" ? o.visits : null),
  done: (ps, o) => o.goal === "points" && ps.points >= o.target,
  applyVisit(ps, e) {
    let pts = 0;
    let bulls = 0;
    let outers = 0;
    for (const d of parseAll(e.d)) {
      if (d.seg === 25 && d.mult === 2) (pts += 3), bulls++;
      else if (d.seg === 25) (pts += 1), outers++;
    }
    return {
      ps: { points: ps.points + pts, visits: ps.visits + 1, bulls: ps.bulls + bulls, outers: ps.outers + outers, best: Math.max(ps.best, pts) },
      value: pts,
      text: pts ? `scored ${pts}` : "missed the bull",
    };
  },
  score: (ps) => ps.points,
  keys: () => [key("25", dart(25, 1), "hit"), key("Bull", dart(25, 2), "hit"), missKey()],
  card: (ps, o) => ({ big: ps.points, sub: o.goal === "visits" ? `Visit ${Math.min(ps.visits + 1, o.visits)} of ${o.visits}` : `${Math.max(0, o.target - ps.points)} to go` }),
  stats: (ps) => [
    ["Points", ps.points],
    ["Bulls", ps.bulls],
    ["25s", ps.outers],
  ],
  describe: (o) => (o.goal === "visits" ? `${o.visits} ${o.visits === 1 ? "visit" : "visits"}` : `first to ${o.target}`),
  record: { label: "Most points", read: (ps) => ps.points, better: "high" },
};

// ---------------------------------------------------------------------------
// Shanghai: round 1 is the 1s, round 2 the 2s... A single, double and treble
// of the number in one visit is a Shanghai, and wins.
// ---------------------------------------------------------------------------
// o.rounds 7 | 10 | 20

const shanghai = {
  id: "shanghai",
  name: "Shanghai",
  blurb: "One number per round. Single, double and treble in a visit wins outright.",
  input: "darts",
  keysFromStart: true, // the round's number, for all three darts
  defaults: { rounds: 7 },
  init: () => ({ points: 0, round: 0, shanghai: false, hits: 0, darts: 0 }),
  limit: (o) => o.rounds,
  done: (ps) => ps.shanghai,
  target: (ps, o) => (ps.round % o.rounds) + 1,
  applyVisit(ps, e, o) {
    const t = (ps.round % o.rounds) + 1;
    const darts = parseAll(e.d);
    const on = darts.filter((d) => d.seg === t);
    const pts = on.reduce((a, d) => a + t * d.mult, 0);
    const kinds = new Set(on.map((d) => d.mult));
    const sh = kinds.has(1) && kinds.has(2) && kinds.has(3);
    return {
      ps: { points: ps.points + pts, round: ps.round + 1, shanghai: ps.shanghai || sh, hits: ps.hits + on.length, darts: ps.darts + darts.length },
      value: pts,
      text: sh ? "hit a Shanghai!" : pts ? `scored ${pts} on the ${t}s` : `missed the ${t}s`,
    };
  },
  score: (ps) => ps.points,
  keys(ps, o) {
    const t = (ps.round % o.rounds) + 1;
    return [key(`${t}`, dart(t, 1), "hit"), key(`D${t}`, dart(t, 2), "hit"), key(`T${t}`, dart(t, 3), "hit"), missKey()];
  },
  card: (ps, o) => ({ big: ps.points, sub: ps.shanghai ? "Shanghai!" : `On the ${(ps.round % o.rounds) + 1}s` }),
  stats: (ps) => [
    ["Points", ps.points],
    ["Hits", ps.hits],
    ["Shanghai", ps.shanghai ? "Yes" : "No"],
  ],
  describe: (o) => `${o.rounds} rounds`,
  record: { label: "Best score", read: (ps) => ps.points, better: "high" },
};

export const MODES = { highscore, race, clock, bullgame, shanghai };
export const MODE_LIST = [highscore, race, clock, bullgame, shanghai];

export const TIE_RULES = [
  { id: "sudden", name: "Sudden death", blurb: "The tied players throw one more visit each. Best visit wins." },
  { id: "bull", name: "Bull throw", blurb: "The tied players throw for the bull. Closest wins." },
  { id: "starter", name: "Starter wins", blurb: "Whoever threw first in that game takes it." },
  { id: "allow", name: "Allow a tie", blurb: "The game's a draw." },
];
