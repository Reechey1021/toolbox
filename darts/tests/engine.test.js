// tests/engine.test.js
// Runs in the browser (tests/index.html) and in Node (node tests/run.mjs).

import { parseDart, dartCode, dartLabel, makeDart } from "../js/engine/board.js";
import {
  IMPOSSIBLE_VISIT_TOTALS,
  isPossibleCheckInTotal,
  minDartsToFinish,
  bogeyNumbers,
  isOneDartFinish,
  doubleDartRange,
} from "../js/engine/rules.js";
import { CHECKOUT_TABLE, suggestCheckout, routeLabels } from "../js/engine/checkouts.js";
import { scoreVisit, doubleDartQuestion } from "../js/engine/visit.js";
import { createMatch, replay, totalEvent, dartsEvent, bustEvent, legsToWin, currentLeg } from "../js/engine/match.js";
import { matchStats, lifetimeStats, legSummaries, legStats } from "../js/engine/stats.js";
import { checkInDartOptions, goOverNeed, applyMultiplier } from "../js/engine/rules.js";
import { createMatch as cm, playerRules, cleanHandicap, needsBull, cleanStartScore } from "../js/engine/match.js";
import { resolveBull, BOARD } from "../js/engine/bull.js";
import { sideName, sideOfPlayer, throwingOrder, nextFirstPlayer, bullThrowers, isTeamMatch, legStarter as legStarterOf, nextThrowerFor } from "../js/engine/match.js";
import { planLeg, composureLean, skillFor } from "../js/engine/nemesis/planner.js";
import { PRESETS, cleanProfile, applyPreset, formTarget } from "../js/engine/nemesis/profile.js";
import { makeNemesisPlayer, nemesisVisit, isBotTurn, nemesisBullThrow } from "../js/engine/nemesis/index.js";
import { nemesisThought } from "../js/engine/nemesis/thoughts.js";
import { rivalry } from "../js/engine/nemesis/rivalry.js";
import { createArcade, replayArcade, arcadeTurn, previewDarts } from "../js/engine/arcade/core.js";
import { MODES } from "../js/engine/arcade/modes.js";
import { rewritePlayerId, planSync, mergeProfile, pairId, makeFriendCode, normaliseCode, statsSummary, CODE_CHARS, involves, visibleTo } from "../js/engine/records.js";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function eq(actual, expected, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}
function ok(v, msg = "expected truthy") {
  if (!v) throw new Error(msg);
}
function near(a, b, eps = 0.01, msg = "") {
  if (a === null || Math.abs(a - b) > eps) throw new Error(`${msg} expected ~${b}, got ${a}`);
}

const DO = { checkIn: "straight", checkOut: "double" };
const SO = { checkIn: "straight", checkOut: "straight" };
const DIDO = { checkIn: "double", checkOut: "double" };
const darts = (...codes) => codes.map(parseDart);

// ---------------------------------------------------------------- board
test("dart codes round-trip", () => {
  for (const c of ["T20", "D16", "S5", "SB", "DB", "M"]) eq(dartCode(parseDart(c)), c);
  eq(dartLabel(parseDart("BULL")), "Bull");
  eq(dartLabel(parseDart("25")), "25");
  eq(dartLabel(parseDart("20")), "20");
  eq(makeDart(25, 3).value, 50, "treble bull clamps to bull");
});

// ---------------------------------------------------------------- rules
test("impossible visit totals are exactly the known nine", () => {
  eq(IMPOSSIBLE_VISIT_TOTALS, [163, 166, 169, 172, 173, 175, 176, 178, 179]);
});

test("double-out bogey numbers", () => {
  eq(bogeyNumbers("double"), [159, 162, 163, 165, 166, 168, 169]);
});

test("straight-out bogeys match impossible totals", () => {
  eq(bogeyNumbers("straight"), [163, 166, 169, 172, 173, 175, 176, 178, 179]);
});

test("min darts to finish (double out)", () => {
  eq(minDartsToFinish(40, "double"), 1);
  eq(minDartsToFinish(50, "double"), 1);
  eq(minDartsToFinish(41, "double"), 2);
  eq(minDartsToFinish(100, "double"), 2);
  eq(minDartsToFinish(101, "double"), 2, "T17 Bull");
  eq(minDartsToFinish(110, "double"), 2);
  eq(minDartsToFinish(99, "double"), 3);
  eq(minDartsToFinish(170, "double"), 3);
  eq(minDartsToFinish(169, "double"), Infinity);
  eq(minDartsToFinish(1, "double"), Infinity);
  eq(minDartsToFinish(171, "double"), Infinity);
});

test("min darts to finish (straight out)", () => {
  eq(minDartsToFinish(1, "straight"), 1);
  eq(minDartsToFinish(60, "straight"), 1);
  eq(minDartsToFinish(23, "straight"), 2, "23 isn't one dart");
  eq(minDartsToFinish(180, "straight"), 3);
});

test("min darts with double in still required", () => {
  eq(minDartsToFinish(40, "double", true), 1);
  eq(minDartsToFinish(41, "double", true), 3, "odd can't be two doubles, so it takes three");
  eq(minDartsToFinish(60, "double", true), 2);
});

test("check-in totals: 1 can't follow a double, 2 can", () => {
  ok(!isPossibleCheckInTotal(1));
  ok(isPossibleCheckInTotal(2));
  ok(isPossibleCheckInTotal(180) === false, "180 needs no double");
  ok(isPossibleCheckInTotal(160), "D20 T20 T20");
});

test("one-dart finishes", () => {
  ok(isOneDartFinish(32, "double"));
  ok(!isOneDartFinish(33, "double"));
  ok(isOneDartFinish(33, "straight"));
  ok(isOneDartFinish(50, "double"));
});

test("darts-at-double range narrows the question", () => {
  // From 150 scoring 60 there's no way a one-dart finish was ever on.
  eq(doubleDartRange({ start: 150, scored: 60, checkOut: "double" }), { min: 0, max: 0 });
  // From 40 scoring 30: 20, 0, 10 keeps all three on a finish; 1, 2, 27 only the first.
  eq(doubleDartRange({ start: 40, scored: 30, checkOut: "double" }), { min: 1, max: 3 });
  // Checking out 32 in 2 darts: first dart could've been at D16 (missed) or a setup? 32 is always a finish.
  eq(doubleDartRange({ start: 32, scored: 32, checkOut: "double", dartsUsed: 2, finished: true }), { min: 2, max: 2 });
  // 100 out in 3: T20 miss(0) D20 -> 2 at double, or 20, 40... D20 -> 1..
  const r = doubleDartRange({ start: 100, scored: 100, checkOut: "double", dartsUsed: 3, finished: true });
  eq(r, { min: 1, max: 2 });
});

// ---------------------------------------------------------------- checkouts
test("every table route adds up and finishes on a double", () => {
  for (const [r, route] of Object.entries(CHECKOUT_TABLE)) {
    const sum = route.reduce((a, d) => a + d.value, 0);
    eq(sum, Number(r), `route for ${r}`);
    ok(route[route.length - 1].mult === 2, `${r} must end on a double`);
    ok(route.length <= 3, `${r} too long`);
  }
});

test("the table covers every double-out finish up to 170", () => {
  for (let r = 2; r <= 170; r++) {
    if (minDartsToFinish(r, "double") <= 3) ok(CHECKOUT_TABLE[r], `missing ${r}`);
    else ok(!CHECKOUT_TABLE[r], `${r} is a bogey but has a route`);
  }
});

test("suggestions respect darts left", () => {
  eq(routeLabels(suggestCheckout(170)), ["T20", "T20", "Bull"]);
  eq(routeLabels(suggestCheckout(50, { dartsLeft: 1 })), ["Bull"]);
  eq(routeLabels(suggestCheckout(50, { dartsLeft: 2 })), ["10", "D20"]);
  eq(routeLabels(suggestCheckout(101, { dartsLeft: 2 })), ["T17", "Bull"]);
  eq(suggestCheckout(99, { dartsLeft: 2 }), null);
  eq(suggestCheckout(169), null);
  eq(suggestCheckout(1), null);
});

test("generated routes are valid for every case", () => {
  for (const checkOut of ["double", "straight"]) {
    for (let r = 2; r <= 180; r++) {
      for (let k = 1; k <= 3; k++) {
        const route = suggestCheckout(r, { checkOut, dartsLeft: k });
        const possible = minDartsToFinish(r, checkOut) <= k;
        eq(Boolean(route), possible, `${r} ${checkOut} ${k} darts`);
        if (!route) continue;
        eq(route.reduce((a, d) => a + d.value, 0), r, `${r} sums`);
        ok(route.length <= k, `${r} fits in ${k}`);
        if (checkOut === "double") ok(route[route.length - 1].mult === 2, `${r} ends on double`);
      }
    }
  }
});

test("straight out suggestions prefer the fewest darts", () => {
  eq(routeLabels(suggestCheckout(60, { checkOut: "straight" })), ["T20"]);
  eq(routeLabels(suggestCheckout(19, { checkOut: "straight" })), ["19"]);
});

// ---------------------------------------------------------------- visits (keypad)
const total = (remaining, score, rules = DO, extra = {}) =>
  scoreVisit({ remaining, checkedIn: rules.checkIn !== "double", rules, input: { kind: "total", score, ...extra } });

test("normal keypad visit", () => {
  const o = total(501, 60);
  eq([o.ok, o.counted, o.remaining, o.bust, o.checkout], [true, 60, 441, false, false]);
});

test("keypad rejects impossible and out-of-range scores", () => {
  ok(!total(501, 179).ok);
  ok(!total(501, 181).ok);
  ok(!total(501, -5).ok);
  ok(!total(501, 12.5).ok);
});

test("keypad busts", () => {
  eq(total(40, 41).bust, true, "over");
  eq(total(40, 39).bust, true, "leaves 1 on double out");
  eq(total(40, 39, SO).bust, false, "1 is fine on straight out");
  eq(total(40, 41).remaining, 40, "bust keeps the score");
});

test("keypad checkout needs a darts count only when ambiguous", () => {
  const a = total(40, 40);
  eq([a.checkout, a.minDarts, a.needsDartsUsed], [true, 1, true]);
  const b = total(170, 170);
  eq([b.checkout, b.dartsUsed, b.needsDartsUsed], [true, 3, false]);
  const c = total(40, 40, DO, { dartsUsed: 2 });
  eq([c.dartsUsed, c.needsDartsUsed], [2, false]);
});

test("keypad refuses a checkout from a bogey number", () => {
  const o = total(169, 169);
  ok(!o.ok);
});

test("double in: 0 stays out, a score checks in", () => {
  const o = scoreVisit({ remaining: 501, checkedIn: false, rules: DIDO, input: { kind: "total", score: 0 } });
  eq(o.checkedIn, false);
  const p = scoreVisit({ remaining: 501, checkedIn: false, rules: DIDO, input: { kind: "total", score: 100 } });
  eq([p.checkedIn, p.remaining], [true, 401]);
  const q = scoreVisit({ remaining: 501, checkedIn: false, rules: DIDO, input: { kind: "total", score: 1 } });
  ok(!q.ok, "1 can't be scored after a double");
});

test("double-dart question only asks when it matters", () => {
  const rules = DO;
  // 150 -> scored 60: no chance at a double, don't ask.
  eq(doubleDartQuestion({ start: 150, checkedIn: true, rules, outcome: total(150, 60) }), null);
  // 501 opening visit: never on a finish.
  eq(doubleDartQuestion({ start: 501, checkedIn: true, rules, outcome: total(501, 60) }), null);
  // 40 -> scored 20: could be three darts at a double (20, miss, miss) or just one (1, miss, 19).
  const q = doubleDartQuestion({ start: 40, checkedIn: true, rules, outcome: total(40, 20) });
  eq(q, { min: 1, max: 3 });
  // 60 -> 20 then D20 missed twice (scored 20): 2 at double; or 0,0,20? 0 then 0 then 20 -> 0 at double.
  const r = doubleDartQuestion({ start: 60, checkedIn: true, rules, outcome: total(60, 20) });
  eq(r, { min: 0, max: 2 });
});

// ---------------------------------------------------------------- visits (dart by dart)
const byDart = (remaining, codes, rules = DO, checkedIn = true, partial = false) =>
  scoreVisit({ remaining, checkedIn, rules, input: { kind: "darts", darts: darts(...codes), partial } });

test("dart pad: normal visit", () => {
  const o = byDart(501, ["T20", "T20", "20"]);
  eq([o.counted, o.remaining, o.dartsUsed, o.doubleDarts], [140, 361, 3, 0]);
});

test("dart pad: checkout on the second dart", () => {
  const o = byDart(60, ["20", "D20", "T20"]);
  eq([o.checkout, o.dartsUsed, o.doubleDarts, o.counted], [true, 2, 1, 60]);
});

test("dart pad: finishing on a single is a bust in double out", () => {
  const o = byDart(20, ["20"]);
  eq([o.bust, o.dartsUsed, o.remaining], [true, 1, 20]);
});

test("dart pad: leaving 1 busts", () => {
  const o = byDart(32, ["S16", "S15"]);
  eq([o.bust, o.dartsUsed, o.doubleDarts], [true, 2, 2]);
});

test("dart pad: double in wastes darts until the double", () => {
  const o = byDart(501, ["T20", "D20", "T20"], DIDO, false);
  eq([o.counted, o.remaining, o.checkedIn], [100, 401, true]);
  const p = byDart(501, ["T20", "T20", "20"], DIDO, false);
  eq([p.counted, p.checkedIn], [0, false]);
});

test("dart pad: partial preview", () => {
  const o = byDart(100, ["T20"], DO, true, true);
  eq([o.remaining, o.dartsUsed, o.complete], [40, 1, false]);
});

test("dart pad: bull checkout", () => {
  const o = byDart(50, ["BULL"]);
  eq([o.checkout, o.dartsUsed], [true, 1]);
});

// ---------------------------------------------------------------- match replay
const twoPlayers = (extra = {}) =>
  createMatch({
    players: [{ id: "a", name: "Reech" }, { id: "b", name: "Dave" }],
    startScore: 101,
    format: { type: "firstTo", legs: 2 },
    firstPlayer: 0,
    ...extra,
  });

test("turns alternate and a checkout wins the leg", () => {
  const cfg = twoPlayers();
  const ev = [totalEvent(0, 60), totalEvent(1, 45), totalEvent(0, 41, { dartsUsed: 2 })];
  const s = replay(cfg, ev);
  eq(s.legs.length, 2, "second leg started");
  eq(s.legs[0].winner, 0);
  eq(s.legsWon, [1, 0]);
  eq(currentLeg(s).current, 1, "leg 2 starts with player 2");
  eq(currentLeg(s).remaining, [101, 101]);
});

test("match ends when legs are reached and further events are ignored", () => {
  const cfg = twoPlayers();
  const ev = [
    totalEvent(0, 101, { dartsUsed: 3 }), // leg 1: Reech 101 checkout (T20 T11 D4? any 3-darter)
    totalEvent(1, 101, { dartsUsed: 3 }), // leg 2: Dave starts, checks out
    totalEvent(0, 60),
    totalEvent(1, 41, { dartsUsed: 3 }), // wait, leg 3: Reech starts, Dave throws 41? no - see below
  ];
  const s = replay(cfg, ev);
  // Leg 3: Reech 60 (41 left), Dave scores 41 of 101 -> 60 left. Not finished yet.
  eq(s.finished, false);
  const s2 = replay(cfg, [...ev, totalEvent(0, 41, { dartsUsed: 2 }), totalEvent(1, 60)]);
  eq([s2.finished, s2.winner, s2.legsWon], [true, 0, [2, 1]]);
  eq(s2.applied, 5, "event after the finish ignored");
});

test("undo is just dropping the last event", () => {
  const cfg = twoPlayers();
  const ev = [totalEvent(0, 60), totalEvent(1, 45), totalEvent(0, 41, { dartsUsed: 2 })];
  const undone = replay(cfg, ev.slice(0, -1));
  eq(undone.legs.length, 1, "leg reopened");
  eq(currentLeg(undone).remaining, [41, 56]);
  eq(currentLeg(undone).current, 0);
});

test("best of 3 needs 2 legs; best of forces odd numbers", () => {
  eq(legsToWin(twoPlayers({ format: { type: "bestOf", legs: 3 } })), 2);
  eq(twoPlayers({ format: { type: "bestOf", legs: 4 } }).format.legs, 5);
  eq(legsToWin(twoPlayers({ format: { type: "firstTo", legs: 3 } })), 3);
});

test("best of only applies to two players", () => {
  const solo = createMatch({ players: [{ id: "a", name: "Reech" }], format: { type: "bestOf", legs: 3 } });
  eq(solo.format.type, "firstTo");
});

test("solo practice: every leg is yours, match ends after N legs", () => {
  const cfg = createMatch({ players: [{ id: "a", name: "Reech" }], startScore: 101, format: { type: "firstTo", legs: 2 } });
  const s = replay(cfg, [totalEvent(0, 60), totalEvent(0, 41, { dartsUsed: 3 }), totalEvent(0, 101, { dartsUsed: 3 })]);
  eq([s.finished, s.winner, s.legsWon], [true, 0, [2]]);
});

test("three players rotate starters each leg", () => {
  const cfg = createMatch({
    players: [{ id: "a" }, { id: "b" }, { id: "c" }],
    startScore: 101,
    format: { type: "firstTo", legs: 3 },
    firstPlayer: 1,
  });
  const s = replay(cfg, [totalEvent(1, 101, { dartsUsed: 3 })]);
  eq(s.legs[0].starter, 1);
  eq(s.legs[1].starter, 2);
});

test("busts don't change the score and pass the turn", () => {
  const cfg = twoPlayers();
  const s = replay(cfg, [totalEvent(0, 60), totalEvent(1, 0), totalEvent(0, 45), bustEvent(1)]);
  eq(currentLeg(s).remaining, [41, 101]);
  eq(currentLeg(s).visits[1].counted, 0);
  ok(currentLeg(s).visits[2].bust, "45 from 41 busts");
});

test("corrupt events are skipped, not fatal", () => {
  const cfg = twoPlayers();
  const s = replay(cfg, [totalEvent(0, 179), totalEvent(0, 60)]);
  eq(s.rejected.length, 1);
  eq(currentLeg(s).remaining, [41, 101]);
});

test("dart events replay identically", () => {
  const cfg = twoPlayers({ startScore: 501 });
  const s = replay(cfg, [dartsEvent(0, darts("T20", "T20", "T20"))]);
  eq(currentLeg(s).remaining[0], 321);
});

// ---------------------------------------------------------------- stats
test("match stats: average, first nine, bands", () => {
  const cfg = twoPlayers({ startScore: 501 });
  const ev = [
    totalEvent(0, 180), totalEvent(1, 60),
    totalEvent(0, 140), totalEvent(1, 100),
    totalEvent(0, 100), totalEvent(1, 26),
    totalEvent(0, 41), totalEvent(1, 45),
    totalEvent(0, 40, { dartsUsed: 1, doubleDarts: 1 }), // 501 in 13 darts
  ];
  const s = replay(cfg, ev);
  const [a, b] = matchStats(s);
  eq(a.darts, 13);
  near(a.avg, (501 / 13) * 3);
  near(a.first9, (420 / 9) * 3);
  eq([a.s180, a.s140, a.s100, a.s60], [1, 1, 1, 0]);
  eq([a.checkouts, a.highestCheckout, a.bestLeg], [1, 40, 13]);
  near(a.checkoutPct, 100);
  eq(b.legsWon, 0);
  eq(b.checkoutPct, null, "no doubles tracked");
});

test("dart pad doubles count automatically for checkout %", () => {
  const cfg = twoPlayers({ startScore: 40 });
  const s = replay(cfg, [dartsEvent(0, darts("S20", "S10", "D5"))]);
  const [a] = matchStats(s);
  eq([a.doublesThrown, a.doublesHit], [3, 1]);
  near(a.checkoutPct, 33.33);
});

test("leg summaries", () => {
  const cfg = twoPlayers();
  const s = replay(cfg, [totalEvent(0, 60), totalEvent(1, 45), totalEvent(0, 41, { dartsUsed: 2 })]);
  const legs = legSummaries(s);
  eq(legs.length, 1);
  eq([legs[0].winner, legs[0].checkout, legs[0].winnerDarts], [0, 41, 5]);
});

test("lifetime stats pick out the owner across matches", () => {
  const cfg1 = twoPlayers();
  const cfg2 = twoPlayers();
  const recs = [
    { id: "1", cfg: cfg1, events: [totalEvent(0, 101, { dartsUsed: 3 }), totalEvent(1, 101, { dartsUsed: 3 }), totalEvent(0, 101, { dartsUsed: 3 })], finishedAt: 1 },
    { id: "2", cfg: cfg2, events: [totalEvent(0, 0), totalEvent(1, 101, { dartsUsed: 3 }), totalEvent(1, 101, { dartsUsed: 3 })], finishedAt: 2 },
  ];
  const life = lifetimeStats(recs, "a");
  eq([life.matches, life.wins, life.losses], [2, 1, 1]);
  eq(life.series.length, 2);
  eq(life.highestCheckout, 101);
});


// ---------------------------------------------------------------- custom scores
test("custom starting scores are clamped to something playable", () => {
  eq(cleanStartScore(1001), 1001);
  eq(cleanStartScore(40), 40);
  eq(cleanStartScore(1), 2);
  eq(cleanStartScore(99999), 9999);
  eq(cleanStartScore("abc"), 501);
  const cfg = cm({ players: [{ id: "a" }], startScore: 1001 });
  eq(cfg.startScore, 1001);
});

// ---------------------------------------------------------------- handicaps
const H2 = (hA = null, hB = null, extra = {}) =>
  cm({
    players: [
      { id: "a", name: "Reech", handicap: hA },
      { id: "b", name: "Dave", handicap: hB },
    ],
    startScore: 501,
    format: { type: "firstTo", legs: 1 },
    firstPlayer: 0,
    ...extra,
  });

test("a handicap identical to the match rules is no handicap", () => {
  eq(cleanHandicap({ startScore: 501, multiplier: 1, finish: "exact" }, { startScore: 501, checkIn: "straight", checkOut: "double" }), null);
  eq(H2({ startScore: 501 }).players[0].handicap, undefined);
});

test("any multiplier forces go-over finishing", () => {
  const cfg = H2({ multiplier: 1.5, finish: "exact" });
  eq(cfg.players[0].handicap.finish, "over");
  eq(playerRules(cfg, 0).finish, "over");
  eq(playerRules(cfg, 1).finish, "exact");
});

test("multiplier: points counted are raw x multiplier, rounded", () => {
  eq(applyMultiplier(60, 1.5), 90);
  eq(applyMultiplier(41, 1.5), 62);
  eq(applyMultiplier(1, 0.5), 1);
  const cfg = H2({ multiplier: 1.5 });
  const st = replay(cfg, [totalEvent(0, 60)]);
  eq(currentLeg(st).remaining[0], 411);
  eq(currentLeg(st).visits[0].raw, 60);
  eq(currentLeg(st).visits[0].counted, 90);
});

test("the old trap is gone: 2x from 501 can always finish", () => {
  // Every doubled score is even, so 501 always leaves an odd number. Going over solves it.
  const cfg = H2({ multiplier: 2 });
  const ev = [totalEvent(0, 180), totalEvent(1, 0), totalEvent(0, 60), totalEvent(1, 0)]; // 501-360-120 = 21
  const st = replay(cfg, ev);
  eq(currentLeg(st).remaining[0], 21);
  const done = replay(cfg, [...ev, totalEvent(0, 11, { dartsUsed: 1 })]); // 11 x2 = 22 goes over 21
  eq([done.finished, done.winner], [true, 0]);
});

test("go over: no busts, and the darts question knows the minimum", () => {
  const cfg = H2({ finish: "over" }); // 1x but allowed to go over
  const st = replay(cfg, [totalEvent(0, 180), totalEvent(1, 0), totalEvent(0, 180), totalEvent(1, 0)]); // on 141
  const o = scoreVisit({ remaining: 141, checkedIn: true, rules: playerRules(cfg, 0), input: { kind: "total", score: 180 } });
  eq([o.checkout, o.minDarts, o.needsDartsUsed], [true, 3, false]);
  const leave1 = scoreVisit({ remaining: 41, checkedIn: true, rules: playerRules(cfg, 0), input: { kind: "total", score: 40 } });
  eq([leave1.bust, leave1.remaining], [false, 1], "leaving 1 is fine when you can go over");
  eq(goOverNeed(21, 2), 11);
  eq(goOverNeed(61, 1.5), 41);
  ok(st.legs.length === 1);
});

test("handicap starting scores and check-in rules are per player", () => {
  const cfg = H2({ startScore: 301, checkIn: "double" });
  const st = replay(cfg, []);
  eq(currentLeg(st).remaining, [301, 501]);
  eq(currentLeg(st).checkedIn, [false, true]);
});

test("handicapped stats count what was thrown and skip checkout records", () => {
  const cfg = H2({ multiplier: 2 });
  const st = replay(cfg, [totalEvent(0, 180), totalEvent(1, 60), totalEvent(0, 60), totalEvent(1, 60), totalEvent(0, 11, { dartsUsed: 1 })]);
  const [a, b] = matchStats(st);
  eq(a.points, 251, "raw points, not the doubled ones");
  eq([a.highestCheckout, a.bestLeg, a.checkoutPct], [0, null, null]);
  eq(a.legsWon, 1);
  ok(a.handicapped && !b.handicapped);
});

test("dart pad with a multiplier finishes when it goes over", () => {
  const cfg = cm({ players: [{ id: "a", handicap: { multiplier: 2 } }], startScore: 101, format: { legs: 1 } });
  const st = replay(cfg, [dartsEvent(0, darts("T20", "20", "5"))]); // 60 x2 = 120 >= 101 on dart 1
  eq([st.finished, currentLeg(st).visits[0].dartsUsed], [true, 1]);
});

// ---------------------------------------------------------------- double in tracking
test("check-in dart options from the counted score", () => {
  eq(checkInDartOptions(150), [1], "D20 T20 BULL-ish: all three darts counted");
  eq(checkInDartOptions(40), [1, 2, 3]);
  eq(checkInDartOptions(41), [1, 2], "odd, so not a lone double");
  eq(checkInDartOptions(0), []);
});

test("keypad check-in asks which dart only when it's unclear", () => {
  const rules = { checkIn: "double", checkOut: "double" };
  const a = scoreVisit({ remaining: 501, checkedIn: false, rules, input: { kind: "total", score: 150 } });
  eq([a.checkInDarts, a.checkInOptions], [1, null]);
  const b = scoreVisit({ remaining: 501, checkedIn: false, rules, input: { kind: "total", score: 40 } });
  eq([b.checkInDarts, b.checkInOptions], [null, [1, 2, 3]]);
  const c = scoreVisit({ remaining: 501, checkedIn: false, rules, input: { kind: "total", score: 40, checkInDart: 2 } });
  eq(c.checkInDarts, 2);
  const miss = scoreVisit({ remaining: 501, checkedIn: false, rules, input: { kind: "total", score: 0 } });
  eq(miss.checkInDarts, 3);
});

test("check-in success: one check-in over the darts it took", () => {
  const cfg = cm({ players: [{ id: "a" }], startScore: 501, checkIn: "double", format: { legs: 1 } });
  const st = replay(cfg, [totalEvent(0, 0), totalEvent(0, 40, { checkInDart: 2 })]); // 3 + 2 darts
  const [a] = matchStats(st);
  eq([a.checkInDarts, a.checkIns], [5, 1]);
  near(a.checkInPct, 20);
});

test("check-in stats skip legs where the darts weren't recorded", () => {
  const cfg = cm({ players: [{ id: "a" }], startScore: 501, checkIn: "double", format: { legs: 1 } });
  const st = replay(cfg, [totalEvent(0, 0), totalEvent(0, 40)]); // which dart unknown
  eq(matchStats(st)[0].checkInPct, null);
});

test("dart pad counts check-in darts exactly", () => {
  const cfg = cm({ players: [{ id: "a" }], startScore: 501, checkIn: "double", format: { legs: 1 } });
  const st = replay(cfg, [dartsEvent(0, darts("20", "T20", "M")), dartsEvent(0, darts("5", "D20", "T20"))]);
  const [a] = matchStats(st);
  eq([a.checkInDarts, a.checkIns, a.points], [5, 1, 100]);
});

// ---------------------------------------------------------------- checkout success and leg scopes
test("checkout success counts visits that started on a finish", () => {
  const cfg = twoPlayers(); // 101 double out
  // 101 is itself a finish (T17, Bull). Reech: 101 (chance), 41 (chance, missed), 41 (chance, out).
  const st = replay(cfg, [totalEvent(0, 60), totalEvent(1, 0), totalEvent(0, 0), totalEvent(1, 0), totalEvent(0, 41, { dartsUsed: 3 })]);
  const [a, b] = matchStats(st);
  eq([a.checkouts, a.chances], [1, 3]);
  eq(b.chances, 2, "Dave threw twice from 101, a finish both times");
});

test("per-leg stats only include that leg", () => {
  const cfg = twoPlayers();
  const st = replay(cfg, [totalEvent(0, 101, { dartsUsed: 3 }), totalEvent(1, 60), totalEvent(0, 50)]);
  const leg1 = legStats(st, 0);
  const leg2 = legStats(st, 1);
  eq([leg1[0].darts, leg1[1].darts], [3, 0]);
  eq([leg2[0].points, leg2[1].points], [50, 60]);
  eq([leg1[0].legsWon, leg2[0].legsWon], [1, 0]);
  eq(matchStats(st)[0].points, 151);
});

// ---------------------------------------------------------------- bull
test("bull: closest to the middle starts", () => {
  const r = resolveBull([{ x: 10, y: 0 }, { x: 0, y: 4 }]);
  eq([r.winner, r.tie], [1, false]);
});

test("bull: two in the inner bull is a rethrow", () => {
  const r = resolveBull([{ x: 1, y: 1 }, { x: -2, y: 3 }]);
  eq([r.winner, r.tie, r.tied], [null, true, [0, 1]]);
  ok(BOARD.bull > 6 && BOARD.bull < 7);
});

test("bull: too close to call is a rethrow, three players pick one", () => {
  eq(resolveBull([{ x: 20, y: 0 }, { x: 0, y: 20.3 }]).tie, true);
  eq(resolveBull([{ x: 40, y: 0 }, { x: 0, y: 12 }, { x: 30, y: 30 }]).winner, 1);
});

test("a bull start leaves the first player open until thrown", () => {
  const cfg = H2(null, null, { firstPlayer: "bull" });
  eq([cfg.firstPlayer, needsBull(cfg)], [null, true]);
  const solo = cm({ players: [{ id: "a" }], firstPlayer: "bull" });
  eq(needsBull(solo), false, "no bull when practising alone");
});


// ---------------------------------------------------------------- teams
// Reech (0) and Test (1) versus Third (2) and Four (3), listed in team order.
const FOUR = [{ id: "a", name: "Reech" }, { id: "b", name: "Test" }, { id: "c", name: "Third" }, { id: "d", name: "Four" }];
const pairs = (extra = {}) =>
  cm({ players: FOUR, teams: [[0, 1], [2, 3]], startScore: 501, format: { type: "firstTo", legs: 3 }, firstPlayer: 0, ...extra });
const throwers = (st) => currentLeg(st).visits.map((v) => v.player);

test("teams need three or more players and everyone on one team", () => {
  ok(isTeamMatch(pairs()));
  eq(cm({ players: FOUR.slice(0, 2), teams: [[0], [1]] }).teams, undefined, "two players is just a normal game");
  eq(cm({ players: FOUR, teams: [[0, 1], [2]] }).teams, undefined, "someone left out");
  eq(cm({ players: FOUR, teams: [[0, 1], [1, 2, 3]] }).teams, undefined, "someone on both");
  eq(sideName(pairs(), 0), "Reech & Test");
});

test("2 v 2 throwing order alternates teams and partners", () => {
  const st = replay(pairs(), [totalEvent(0, 60), totalEvent(2, 60), totalEvent(1, 60), totalEvent(3, 60), totalEvent(0, 60)]);
  eq(throwers(st), [0, 2, 1, 3, 0]);
  eq(throwingOrder(pairs()), [0, 2, 1, 3]);
});

test("2 v 1: the solo player throws every time their side is up", () => {
  const cfg = cm({ players: FOUR.slice(0, 3), teams: [[0, 1], [2]], firstPlayer: 0 });
  eq(throwingOrder(cfg), [0, 2, 1, 2]);
  const st = replay(cfg, [totalEvent(0, 60), totalEvent(2, 60), totalEvent(1, 60), totalEvent(2, 60)]);
  eq(throwers(st), [0, 2, 1, 2]);
  eq(currentLeg(st).remaining, [381, 381]);
});

test("partners share one score", () => {
  const st = replay(pairs(), [totalEvent(0, 100), totalEvent(2, 45), totalEvent(1, 140)]);
  eq(currentLeg(st).remaining, [261, 456]);
  eq([currentLeg(st).current, currentLeg(st).thrower], [1, 3]);
});

test("each leg starts one place round: teams alternate and everyone leads off", () => {
  const cfg = pairs();
  eq([0, 1, 2, 3, 4].map((l) => legStarterOf(cfg, l).player), [0, 2, 1, 3, 0]);
  eq(nextFirstPlayer(cfg), 2, "a rematch is led off by the other team");
});

test("choosing a player from the second team to throw first", () => {
  const st = replay(pairs({ firstPlayer: 3 }), [totalEvent(3, 60), totalEvent(0, 60)]);
  eq(throwers(st), [3, 0]);
  eq(currentLeg(st).starter, 1);
});

test("a team checkout wins the leg for the team", () => {
  const cfg = pairs({ startScore: 101, format: { type: "firstTo", legs: 2 } });
  const st = replay(cfg, [totalEvent(0, 60), totalEvent(2, 0), totalEvent(1, 41, { dartsUsed: 2 })]);
  eq(st.legs[0].winner, 0);
  eq(st.legsWon, [1, 0]);
  eq(currentLeg(st).thrower, 2, "leg 2 is led off by the other team");
});

test("team stats: own visits for scoring, team legs for both partners", () => {
  const cfg = pairs({ startScore: 101, format: { type: "firstTo", legs: 1 } });
  const st = replay(cfg, [totalEvent(0, 60), totalEvent(2, 26), totalEvent(1, 41, { dartsUsed: 2 })]);
  const [reech, test2, third] = matchStats(st);
  eq([reech.points, test2.points, third.points], [60, 41, 26]);
  eq([reech.darts, test2.darts], [3, 2]);
  eq([reech.legsWon, test2.legsWon, third.legsWon], [1, 1, 0]);
  eq([reech.bestLeg, test2.bestLeg], [5, 5], "the team's darts in the leg");
  eq([reech.checkouts, test2.checkouts], [0, 1], "the checkout belongs to whoever hit it");
  eq(st.winner, 0);
  eq(legSummaries(st)[0].finisher, 1);
});

test("team handicaps apply to the side, player handicaps are ignored", () => {
  const cfg = cm({
    players: [{ id: "a", handicap: { startScore: 101 } }, { id: "b" }, { id: "c" }],
    teams: [[0, 1], [2]],
    teamHandicaps: [null, { startScore: 301 }],
  });
  eq(cfg.players[0].handicap, undefined);
  eq(cfg.teams[1].handicap.startScore, 301);
  eq(currentLeg(replay(cfg, [])).remaining, [501, 301]);
  eq(playerRules(cfg, 2).startScore, 301);
});

test("double in is shared by the team", () => {
  const cfg = pairs({ checkIn: "double" });
  const st = replay(cfg, [totalEvent(0, 40, { checkInDart: 3 }), totalEvent(2, 0), totalEvent(1, 60)]);
  eq(currentLeg(st).remaining, [401, 501]);
  eq(currentLeg(st).checkedIn, [true, false]);
  const [reech, test2] = matchStats(st);
  eq([reech.checkInDarts, reech.checkIns, test2.checkInDarts], [3, 1, 0]);
});

test("a team win counts as a win in lifetime stats", () => {
  const cfg = pairs({ startScore: 101, format: { type: "firstTo", legs: 1 } });
  const rec = { id: "t", cfg, events: [totalEvent(0, 60), totalEvent(2, 0), totalEvent(1, 41, { dartsUsed: 2 })], finishedAt: 1 };
  const reech = lifetimeStats([rec], "a");
  const third = lifetimeStats([rec], "c");
  eq([reech.wins, reech.losses, third.wins, third.losses], [1, 0, 0, 1]);
});

test("the first player of each team throws for the bull", () => {
  const cfg = pairs({ firstPlayer: "bull" });
  eq(bullThrowers(cfg), [0, 2]);
  eq(sideOfPlayer(cfg, 3), 1);
});

test("who throws next for each team", () => {
  const st = replay(pairs(), [totalEvent(0, 60)]); // Reech threw, Third is up
  eq([nextThrowerFor(st, 1), nextThrowerFor(st, 0)], [2, 1], "Third now, then Test for the other team");
  const st2 = replay(pairs(), [totalEvent(0, 60), totalEvent(2, 60)]);
  eq([nextThrowerFor(st2, 0), nextThrowerFor(st2, 1)], [1, 3]);
});

test("a normal game is still sides of one player each", () => {
  const cfg = twoPlayers();
  eq([sideName(cfg, 1), sideOfPlayer(cfg, 1)], ["Dave", 1]);
  eq(throwingOrder(cfg), [0, 1]);
});


// ---------------------------------------------------------------- nemesis
const DO_RULES = { checkIn: "straight", checkOut: "double", finish: "exact", multiplier: 1 };
const profileWith = (target, presetId = "standard") => applyPreset(cleanProfile({ target }), presetId);

// Replay a planned leg through the real engine as a one-player match.
function replayPlan(plan, { start = 501, checkIn = "straight", checkOut = "double", handicap = null } = {}) {
  const cfg = cm({ players: [{ id: "n", handicap }], startScore: start, checkIn, checkOut, format: { legs: 1 }, id: "rp" });
  return replay(cfg, plan.visits.map((d) => dartsEvent(0, d)));
}

test("nemesis: every planned leg replays exactly through the real engine", () => {
  const cases = [
    { start: 501 },
    { start: 301 },
    { start: 701 },
    { start: 501, checkOut: "straight" },
    { start: 501, checkIn: "double" },
    { start: 501, handicap: { multiplier: 1.5 } },
  ];
  for (const c of cases) {
    const cfgRules = replay(cm({ players: [{ id: "n", handicap: c.handicap }], startScore: c.start, checkIn: c.checkIn, checkOut: c.checkOut }), []).rules[0];
    for (const target of [35, 60, 90]) {
      const plan = planLeg({ seed: `rep|${JSON.stringify(c)}|${target}`, start: c.start, rules: cfgRules, profile: profileWith(target) });
      const st = replayPlan(plan, c);
      eq(st.rejected.length, 0, `no rejected visits ${JSON.stringify(c)}`);
      ok(st.finished, `plan finishes the leg ${JSON.stringify(c)} at ${target}`);
      eq(st.applied, plan.visits.length, "every visit used, no extras");
    }
  }
});

test("nemesis: legs land inside the range, and average the target", () => {
  const report = [];
  for (const target of [30, 50, 70, 90, 105]) {
    for (const preset of ["standard", "icecold", "rollercoaster"]) {
      const profile = profileWith(target, preset);
      let inside = 0;
      let sum = 0;
      const N = 12;
      for (let i = 0; i < N; i++) {
        const plan = planLeg({ seed: `range|${target}|${preset}|${i}`, start: 501, rules: DO_RULES, profile });
        const avg = replayPlan(plan).legs[0].visits.length ? (501 / replayPlan(plan).legs[0].visits.reduce((a, v) => a + v.dartsUsed, 0)) * 3 : 0;
        if (avg >= target - profile.range - 0.01 && avg <= target + profile.range + 0.01) inside++;
        sum += avg;
      }
      report.push(`${target} ${preset}: ${inside}/${N} in range, mean ${(sum / N).toFixed(1)}`);
      ok(inside >= N - 1, `${target} ${preset} range: ${report[report.length - 1]}`);
      ok(Math.abs(sum / N - target) <= profile.range + 1.5, `${target} ${preset} mean: ${report[report.length - 1]}`);
    }
  }
});

test("nemesis: the calibrated skill model is monotonic", () => {
  let last = -1;
  for (let a = 20; a <= 110; a += 5) {
    const s = skillFor(a);
    ok(s > last, `skill rises with average at ${a}`);
    last = s;
  }
});

test("nemesis: checkout strength changes how many darts it needs at a double", () => {
  const darts = (checkout) => {
    let hit = 0;
    let thrown = 0;
    for (let i = 0; i < 20; i++) {
      const profile = cleanProfile({ target: 60, range: 8, consistency: 5, checkout, composure: 5 });
      const plan = planLeg({ seed: `co|${checkout}|${i}`, start: 501, rules: DO_RULES, profile });
      const s0 = matchStats(replayPlan(plan))[0];
      hit += s0.doublesHit;
      thrown += s0.doublesThrown;
    }
    return (hit / thrown) * 100;
  };
  const weak = darts(1);
  const strong = darts(10);
  ok(strong > weak + 10, `checkout 10 (${strong.toFixed(0)}%) should beat checkout 1 (${weak.toFixed(0)}%) clearly`);
});

test("nemesis: composure only leans when it's behind or in a deciding leg", () => {
  eq(composureLean({ composure: 9, legsFor: 1, legsAgainst: 1, need: 3 }), 0, "level, not deciding");
  ok(composureLean({ composure: 9, legsFor: 0, legsAgainst: 2, need: 3 }) > 0, "ice cold fights back");
  ok(composureLean({ composure: 1, legsFor: 0, legsAgainst: 2, need: 3 }) < 0, "bottler wilts");
  ok(composureLean({ composure: 9, legsFor: 2, legsAgainst: 2, need: 3 }) > 0, "deciding leg counts as pressure");
  eq(composureLean({ composure: 5, legsFor: 0, legsAgainst: 3, need: 4 }), 0, "neutral composure never leans");
});

test("nemesis: presets are distinct and custom is detected", () => {
  eq(new Set(PRESETS.map((p) => `${p.range}|${p.consistency}|${p.checkout}|${p.composure}`)).size, PRESETS.length);
  eq(cleanProfile({ ...profileWith(60, "scorer") }).preset, "scorer");
  eq(cleanProfile({ ...profileWith(60, "scorer"), checkout: 9 }).preset, "custom");
  eq(formTarget(54.4), 56);
  eq(formTarget(null), null);
});

test("nemesis: plays from the plan, the same darts every replay", () => {
  const cfg = cm({ players: [{ id: "a", name: "Reech" }, makeNemesisPlayer(profileWith(60))], startScore: 501, format: { legs: 1 }, firstPlayer: 1, id: "det" });
  const st = replay(cfg, []);
  ok(isBotTurn(st));
  const first = nemesisVisit(st);
  eq(nemesisVisit(replay(cfg, [])).map(dartCode), first.map(dartCode), "same darts on replay");
  // Its darts go in like any dart pad visit.
  const after = replay(cfg, [dartsEvent(1, first)]);
  eq(after.rejected.length, 0);
  ok(!isBotTurn(after), "your turn next");
});

test("nemesis: a whole match against it plays to the end", () => {
  const cfg = cm({ players: [{ id: "a", name: "Reech" }, makeNemesisPlayer(profileWith(80))], startScore: 501, format: { legs: 2 }, firstPlayer: 0, id: "full" });
  let events = [];
  let st = replay(cfg, events);
  for (let guard = 0; guard < 200 && !st.finished; guard++) {
    events.push(isBotTurn(st) ? dartsEvent(1, nemesisVisit(st)) : totalEvent(0, 26));
    st = replay(cfg, events);
  }
  ok(st.finished, "match finished");
  eq(st.winner, 1, "an 80 average beats 26s every visit");
  eq(st.rejected.length, 0);
});

test("nemesis: as a partner it plays visit by visit from the shared score", () => {
  const cfg = cm({
    players: [{ id: "a", name: "Reech" }, { id: "b", name: "Dave" }, makeNemesisPlayer(profileWith(60)), { id: "c", name: "Marie" }],
    teams: [[0, 2], [1, 3]],
    firstPlayer: 0,
    id: "pair",
  });
  let events = [totalEvent(0, 60), totalEvent(1, 60)];
  let st = replay(cfg, events);
  ok(isBotTurn(st), "Nemesis throws for Reech's team");
  events.push(dartsEvent(2, nemesisVisit(st)));
  st = replay(cfg, events);
  eq(st.rejected.length, 0);
  ok(currentLeg(st).remaining[0] < 441, "its darts come off the team's score");
});

test("nemesis: one per match", () => {
  let threw = false;
  try {
    cm({ players: [makeNemesisPlayer(), makeNemesisPlayer()] });
  } catch {
    threw = true;
  }
  ok(threw);
  eq(cm({ players: [{ id: "a" }, makeNemesisPlayer(profileWith(72, "finisher"))] }).players[1].bot.profile.target, 72);
});

test("nemesis: bull throws are repeatable and tighter at higher averages", () => {
  const spread = (target) => {
    let sum = 0;
    for (let i = 0; i < 60; i++) {
      const cfg = { id: `b${i}`, players: [makeNemesisPlayer({ target })] };
      const t = nemesisBullThrow(cfg, 0);
      sum += Math.hypot(t.x, t.y);
    }
    return sum / 60;
  };
  ok(spread(90) < spread(40), "better players land closer");
  const cfg = { id: "same", players: [makeNemesisPlayer({ target: 60 })] };
  eq(nemesisBullThrow(cfg, 0), nemesisBullThrow(cfg, 0));
  ok(JSON.stringify(nemesisBullThrow(cfg, 0, 0)) !== JSON.stringify(nemesisBullThrow(cfg, 0, 1)), "a rethrow is a new dart");
});

test("nemesis: thoughts match what happened", () => {
  const always = () => 0;
  eq(nemesisThought({ visit: { checkout: true, raw: 40 }, opponentOnFinish: true, random: always }).tier, 1);
  ok(nemesisThought({ visit: { raw: 180 }, random: always }).text.length > 0);
  eq(nemesisThought({ visit: { raw: 55 }, target: 60, random: always }), null, "an ordinary visit says nothing");
});


test("rivalry: head to head, legs, streak and best win", () => {
  const mk = (id, youWin, at) => {
    const cfg = cm({ players: [{ id: "a", name: "Reech" }, makeNemesisPlayer(profileWith(50))], startScore: 101, format: { legs: 1 }, firstPlayer: youWin ? 0 : 1, id });
    return { id, cfg, events: [youWin ? totalEvent(0, 101, { dartsUsed: 3 }) : totalEvent(1, 101, { dartsUsed: 3 })], finishedAt: at };
  };
  const r = rivalry([mk("1", true, 1), mk("2", false, 2), mk("3", false, 3)], "a");
  eq([r.matches, r.youWon, r.itWon, r.legsYou, r.legsIt], [3, 1, 2, 1, 2]);
  eq(r.streak, { who: "nemesis", count: 2 });
  near(r.bestWin.avg, 101);
  eq(rivalry([], "a").matches, 0);
});

test("rivalry ignores matches where Nemesis was your partner", () => {
  const cfg = cm({ players: [{ id: "a" }, makeNemesisPlayer(profileWith(50)), { id: "b" }], teams: [[0, 1], [2]], startScore: 101, format: { legs: 1 }, id: "p" });
  eq(rivalry([{ id: "p", cfg, events: [totalEvent(0, 101, { dartsUsed: 3 })], finishedAt: 1 }], "a").matches, 0);
});

test("lifetime wins are split between friends and Nemesis", () => {
  const vsBot = cm({ players: [{ id: "a" }, makeNemesisPlayer(profileWith(50))], startScore: 101, format: { legs: 1 }, id: "v1" });
  const vsDave = cm({ players: [{ id: "a" }, { id: "d" }], startScore: 101, format: { legs: 1 }, id: "v2" });
  const recs = [
    { id: "v1", cfg: vsBot, events: [totalEvent(0, 101, { dartsUsed: 3 })], finishedAt: 1 },
    { id: "v2", cfg: vsDave, events: [totalEvent(0, 0), totalEvent(1, 101, { dartsUsed: 3 })], finishedAt: 2 },
  ];
  const life = lifetimeStats(recs, "a");
  eq([life.contested, life.wins, life.nemesisPlayed, life.nemesisWins], [1, 0, 1, 1]);
});


// ---------------------------------------------------------------- accounts
test("records: your matches move to your account id", () => {
  const cfg = cm({ players: [{ id: "local_1", name: "Reech", owner: true }, { id: "guest:dave", name: "Dave" }] });
  const rec = { id: "m1", cfg, events: [], ownerId: "local_1" };
  const moved = rewritePlayerId(rec, "local_1", "g:abc");
  eq([moved.cfg.players[0].id, moved.cfg.players[1].id, moved.ownerId], ["g:abc", "guest:dave", "g:abc"]);
  eq(rec.cfg.players[0].id, "local_1", "the original is untouched");
  eq(rewritePlayerId({ id: "m2", cfg: cm({ players: [{ id: "x" }] }), ownerId: "x" }, "local_1", "g:abc").ownerId, "x");
});

test("records: sync plan adds, pushes, removes and respects device-only matches", () => {
  const r = (id, extra = {}) => ({ id, ...extra });
  const plan = planSync({
    local: [r("a"), r("b"), r("c", { localOnly: true }), r("d")],
    remote: [r("b"), r("e"), r("f")],
    deleted: ["d", "f"],
  });
  eq(plan.push.map((x) => x.id), ["a"], "c stays on the device, d was deleted elsewhere");
  eq(plan.addLocal.map((x) => x.id), ["e"], "f was deleted");
  eq(plan.removeLocal, ["d"]);
});

test("records: the newest profile change wins", () => {
  const local = { id: "g:1", name: "Reech", callerName: "", updatedAt: 10 };
  eq(mergeProfile(local, null).pushNeeded, true, "first sign-in: push this device's profile");
  const newer = mergeProfile(local, { name: "Reech", callerName: "Richard", equipment: { brand: "Target" }, updatedAt: 20 });
  eq([newer.profile.callerName, newer.profile.equipment.brand, newer.pushNeeded], ["Richard", "Target", false]);
  const older = mergeProfile({ ...local, updatedAt: 30 }, { callerName: "Marie", updatedAt: 20 });
  eq([older.profile.callerName, older.pushNeeded], ["", true]);
});


// ---------------------------------------------------------------- friends
test("friends: one friendship id whoever creates it", () => {
  eq(pairId("abc", "xyz"), "abc_xyz");
  eq(pairId("xyz", "abc"), "abc_xyz");
});

test("friends: codes are six unambiguous characters", () => {
  let seed = 0.123;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280 / 233280);
  for (let i = 0; i < 200; i++) {
    const c = makeFriendCode(rnd);
    ok(c.length === 6 && [...c].every((x) => CODE_CHARS.includes(x)), `bad code ${c}`);
  }
  ok(!/[01OIL]/.test(CODE_CHARS), "no look-alike characters");
});

test("friends: codes are read from anything typed or pasted", () => {
  eq(normaliseCode(" k7qm2x "), "K7QM2X");
  eq(normaliseCode("K7Q M2X"), "K7QM2X");
  eq(normaliseCode("https://reechey1021.github.io/reechs-toolbox/darts/#/add/K7QM2X"), "K7QM2X");
  eq(normaliseCode("K7QM2"), null, "too short");
  eq(normaliseCode("K7QM2O"), null, "O is never used");
});

test("friends: the public summary is totals only", () => {
  const life = lifetimeStats([], "nobody");
  const sum = statsSummary({ ...life, avg: 54.23456, matches: 3 });
  eq([sum.avg, sum.matches], [54.23, 3]);
  ok(!("series" in sum), "no match-by-match data");
});


test("records: each account only sees its own matches", () => {
  const rec = (ids) => ({ cfg: { players: ids.map((id) => ({ id })) } });
  const a = rec(["g:A", "guest:dave"]);
  const guestOnly = rec(["guest:dave", "guest:kam"]);
  const deviceGuest = rec(["local_x", "guest:dave"]);
  eq([visibleTo(a, "g:A"), visibleTo(a, "g:B")], [true, false]);
  eq(visibleTo(guestOnly, "g:B"), true, "no identities in it: everyone on the device sees it");
  eq([visibleTo(deviceGuest, "g:B"), visibleTo(deviceGuest, "local_x")], [false, true]);
  ok(involves(a, "g:A") && !involves(a, "g:B"));
});


// ---------------------------------------------------------------- arcade
const two = [{ id: "a", name: "Reech" }, { id: "b", name: "Dave" }];
const arc = (kind, extra = {}) => createArcade({ kind, players: two, firstPlayer: 0, ...extra });
const S = (p, s) => ({ p, s });
const D = (p, ...d) => ({ p, d });

test("arcade: everyone gets the same visits (Race)", () => {
  const cfg = arc("race", { options: { target: 100 } });
  let st = replayArcade(cfg, [S(0, 100)]);
  ok(!st.finished, "Reech is there, but Dave still gets his visit");
  eq(st.turn.player, 1);
  st = replayArcade(cfg, [S(0, 100), S(1, 60)]);
  eq([st.finished, st.winner], [true, 0]);
});

test("arcade tie rules: sudden death, best visit wins, still level goes again", () => {
  const cfg = arc("race", { options: { target: 100 }, tie: "sudden" });
  let st = replayArcade(cfg, [S(0, 100), S(1, 120)]);
  eq([st.finished, st.game.phase], [false, "sudden"], "both got there in the same round: a tie, whatever the overshoot");
  st = replayArcade(cfg, [S(0, 100), S(1, 120), S(0, 60), S(1, 60)]);
  eq(st.game.phase, "sudden", "level again, another visit");
  st = replayArcade(cfg, [S(0, 100), S(1, 120), S(0, 60), S(1, 60), S(0, 41), S(1, 45)]);
  eq([st.finished, st.winner, st.games[0].decidedBy], [true, 1, "sudden"]);
});

test("arcade tie rules: starter wins, allow a tie, bull throw", () => {
  const tied = [S(0, 100), S(1, 100)];
  eq(replayArcade(arc("race", { options: { target: 100 }, tie: "starter" }), tied).winner, 0);
  const draw = replayArcade(arc("race", { options: { target: 100 }, tie: "allow" }), tied);
  eq([draw.finished, draw.winner, draw.draws], [true, null, 1], "a one-game match that's drawn");
  const cfg = arc("race", { options: { target: 100 }, tie: "bull" });
  let st = replayArcade(cfg, tied);
  eq(st.turn, { player: 0, kind: "bull" });
  st = replayArcade(cfg, [...tied, { p: 0, bt: { x: 1, y: 1 } }, { p: 1, bt: { x: -1, y: 1 } }]);
  eq(st.game.phase, "bull", "both in the bull: throw again");
  st = replayArcade(cfg, [...tied, { p: 0, bt: { x: 1, y: 1 } }, { p: 1, bt: { x: -1, y: 1 } }, { p: 0, bt: { x: 30, y: 0 } }, { p: 1, bt: { x: 8, y: 0 } }]);
  eq([st.finished, st.winner, st.games[0].decidedBy], [true, 1, "bull"]);
});

test("arcade: High Score runs the visits out, highest wins", () => {
  const cfg = arc("highscore", { options: { visits: 2 } });
  const st = replayArcade(cfg, [S(0, 60), S(1, 100), S(0, 140), S(1, 26)]);
  eq([st.finished, st.winner], [true, 0]);
  eq(MODES.highscore.card(st.games[0].ps[0], cfg.options).big, 200);
});

test("arcade: games rotate the starter, and first to 2 needs two wins", () => {
  const cfg = arc("highscore", { options: { visits: 1 }, format: { type: "firstTo", legs: 2 } });
  let st = replayArcade(cfg, [S(0, 60), S(1, 40)]);
  eq([st.finished, st.gamesWon, st.turn.player], [false, [1, 0], 1], "Dave leads off game 2");
  st = replayArcade(cfg, [S(0, 60), S(1, 40), S(1, 20), S(0, 80)]);
  eq([st.finished, st.winner], [true, 0]);
});

test("arcade: best of 3 with a draw still ends when games run out", () => {
  const cfg = arc("highscore", { options: { visits: 1 }, format: { type: "bestOf", legs: 3 }, tie: "allow" });
  const st = replayArcade(cfg, [S(0, 60), S(1, 60), S(1, 50), S(0, 40), S(0, 30), S(1, 30)]);
  eq([st.gamesWon, st.draws], [[0, 1], 2]);
  eq(st.winner, 1, "one game won and two drawn: Dave takes it");
});

test("arcade: Around the Clock steps, jumps, and the bull can't be skipped", () => {
  const cfg = arc("clock", { options: { jumps: true } });
  let st = replayArcade(cfg, [D(0, "S1", "D2", "M")]);
  eq(st.games[0].ps[0].pos, 3, "1, then D2 jumps two");
  eq(MODES.clock.keys(st.games[0].ps[1], cfg.options).map((k) => k.label), ["1", "D1", "T1", "Miss"]);
  const nearEnd = { pos: 19, darts: 30, hits: 19, finishedIn: null };
  const out = MODES.clock.applyVisit(nearEnd, { d: ["T20"] }, cfg.options);
  eq(out.ps.pos, 20, "T20 lands on the bull rather than skipping it");
  eq(MODES.clock.applyVisit(out.ps, { d: ["SB"] }, cfg.options).ps.pos, 21, "25 finishes (25 or bull)");
  const bullOnly = { ...cfg.options, bull: "bull" };
  eq(MODES.clock.applyVisit(out.ps, { d: ["SB"] }, bullOnly).ps.pos, 20, "25 doesn't count when it's the bull only");
  const doubles = { ...cfg.options, hits: "doubles" };
  eq(MODES.clock.applyVisit({ pos: 0, darts: 0, hits: 0, finishedIn: null }, { d: ["S1", "T1", "D1"] }, doubles).ps.pos, 1);
  eq(MODES.clock.targets({ order: "down", bull: "none" })[0], 20);
});

test("arcade: finishing the clock ends the visit, and the round still completes", () => {
  const cfg = arc("clock", { options: { bull: "none" } });
  const st0 = { pos: 19, darts: 40, hits: 19, finishedIn: null };
  const out = MODES.clock.applyVisit(st0, { d: ["S20", "S5"] }, cfg.options);
  eq([out.ps.pos, out.ps.finishedIn], [20, 41]);
  const pre = previewDarts(replayArcade(cfg, []), ["S1"]);
  eq([pre.ps.pos, pre.over], [1, false]);
});

test("arcade: Bull game points and Shanghai", () => {
  const bg = arc("bullgame", { options: { goal: "visits", visits: 1 } });
  const st = replayArcade(bg, [D(0, "DB", "SB", "M"), D(1, "SB", "M", "M")]);
  eq([st.winner, st.games[0].ps[0].points], [0, 4]);
  const sh = arc("shanghai", { options: { rounds: 7 } });
  const s2 = replayArcade(sh, [D(0, "S1", "D1", "T1"), D(1, "T1", "T1", "T1")]);
  eq([s2.finished, s2.winner], [true, 0], "a Shanghai wins at the end of the round");
  eq(MODES.shanghai.keys(s2.games[0].ps[1], sh.options)[2].label, "T2", "then the 2s");
});

test("arcade: whose turn, for online", () => {
  const cfg = arc("race", { options: { target: 100 } });
  eq([arcadeTurn(cfg, []), arcadeTurn(cfg, [S(0, 10)])], [0, 1]);
});

// ---------------------------------------------------------------- runner
export async function run() {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err.message });
    }
  }
  return results;
}
