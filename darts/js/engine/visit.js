// engine/visit.js
// Scores one visit (up to three darts) for one player.
//
// Two ways in:
//   { kind: "total", score, dartsUsed?, doubleDarts?, checkInDart? }   keypad: the visit total
//   { kind: "darts", darts: [dart, ...], partial? }                    dart pad: each dart
//   { kind: "bust" }                                                   an explicit bust
//
// rules: { checkIn, checkOut, finish: "exact" | "over", multiplier }
//   finish "over" (handicaps): reaching zero or below wins, there are no busts.
//   multiplier (handicaps): points counted = raw points x multiplier, rounded.
//   A multiplier other than 1 always finishes "over", or some scores could never finish.
//
// Outcome fields worth knowing:
//   raw        points actually thrown (what stats use)
//   counted    points taken off the score (raw x multiplier)
//   checkInDarts  darts thrown before and including the check-in double (double in only)
//
// Returns { ok: false, error } when the input can't happen.
// Pure function: the same input always gives the same outcome.

import { isDouble } from "./board.js";
import {
  CHECK_IN,
  CHECK_OUT,
  isPossibleVisitTotal,
  isPossibleCheckInTotal,
  minDartsToFinish,
  isOneDartFinish,
  isBustRemaining,
  doubleDartRange,
  checkInDartOptions,
  applyMultiplier,
  goOverMinDarts,
} from "./rules.js";

export function normaliseRules(rules = {}) {
  const multiplier = Number(rules.multiplier) > 0 ? Number(rules.multiplier) : 1;
  return {
    checkIn: rules.checkIn === CHECK_IN.DOUBLE ? CHECK_IN.DOUBLE : CHECK_IN.STRAIGHT,
    checkOut: rules.checkOut === CHECK_OUT.STRAIGHT ? CHECK_OUT.STRAIGHT : CHECK_OUT.DOUBLE,
    multiplier,
    finish: multiplier !== 1 || rules.finish === "over" ? "over" : "exact",
  };
}

export function scoreVisit({ remaining, checkedIn = true, rules, input }) {
  const r = normaliseRules(rules);
  const ctx = { remaining, checkedIn, ...r };

  if (!input) return fail("Nothing to score");
  if (input.kind === "bust") return bust(ctx, 3, null);
  if (input.kind === "total") return scoreTotal(ctx, input);
  if (input.kind === "darts") return scoreDarts(ctx, input);
  return fail(`Unknown input: ${input.kind}`);
}

function fail(error) {
  return { ok: false, error };
}

function bust(ctx, dartsUsed, doubleDarts, extra = {}) {
  return {
    ok: true,
    raw: 0,
    counted: 0,
    bust: true,
    checkout: false,
    dartsUsed,
    doubleDarts,
    remaining: ctx.remaining,
    checkedIn: ctx.checkedIn,
    darts: null,
    checkInDarts: null,
    ...extra,
  };
}

// Fewest darts that could have finished from here, under these rules.
export function finishMinDarts(remaining, checkedIn, rules) {
  const r = normaliseRules(rules);
  if (r.finish === "over") return goOverMinDarts(remaining, r.multiplier);
  return minDartsToFinish(remaining, r.checkOut, r.checkIn === CHECK_IN.DOUBLE && !checkedIn);
}

// Can this player finish from here in one visit?
export function onAFinish(remaining, checkedIn, rules) {
  return finishMinDarts(remaining, checkedIn, rules) <= 3;
}

// ---------------------------------------------------------------------------
// Keypad totals
// ---------------------------------------------------------------------------

function scoreTotal(ctx, input) {
  const { remaining, checkedIn, checkIn, checkOut, finish, multiplier } = ctx;
  const score = Number(input.score);
  if (!Number.isInteger(score) || score < 0) return fail("Enter a score from 0 to 180");
  if (score > 180) return fail("A visit can't score more than 180");
  if (!isPossibleVisitTotal(score)) return fail(`${score} isn't possible with three darts`);

  const needsDoubleIn = checkIn === CHECK_IN.DOUBLE && !checkedIn;
  if (needsDoubleIn && score > 0 && !isPossibleCheckInTotal(score)) {
    return fail(`${score} can't be scored starting on a double`);
  }

  // Double in: which dart landed the double? Ask only if the score leaves it open.
  let checkInDarts = null;
  let checkInOptions = null;
  if (needsDoubleIn) {
    if (score === 0) checkInDarts = 3;
    else {
      const opts = checkInDartOptions(score);
      const given = Number(input.checkInDart);
      if (opts.includes(given)) checkInDarts = given;
      else if (opts.length === 1) checkInDarts = opts[0];
      else checkInOptions = opts;
    }
  }

  const raw = score;
  const counted = applyMultiplier(raw, multiplier);
  const doubleDarts = validDoubleDarts(input.doubleDarts);
  const nowIn = checkedIn || (needsDoubleIn && score > 0);
  const common = { raw, counted, doubleDarts, darts: null, checkInDarts, checkInOptions };

  const finishes = finish === "over" ? counted >= remaining && nowIn && remaining > 0 : remaining - counted === 0;

  if (finishes) {
    const minDarts = Math.max(
      finish === "over" ? goOverMinDarts(remaining, multiplier) : minDartsToFinish(remaining, checkOut, needsDoubleIn),
      checkInDarts ?? 1
    );
    if (minDarts > 3) return fail(`${remaining} can't be checked out in one visit`);
    let dartsUsed = Number(input.dartsUsed);
    if (!Number.isInteger(dartsUsed) || dartsUsed < minDarts || dartsUsed > 3) {
      dartsUsed = minDarts === 3 ? 3 : null; // null: the caller has to ask
    }
    return {
      ok: true,
      ...common,
      bust: false,
      checkout: true,
      dartsUsed: dartsUsed ?? 3,
      needsDartsUsed: dartsUsed === null,
      minDarts,
      remaining: 0,
      checkedIn: true,
    };
  }

  const after = remaining - counted;
  if (finish === "exact" && isBustRemaining(after, checkOut)) {
    return bust(ctx, 3, doubleDarts, { checkInDarts: needsDoubleIn ? checkInDarts : null, checkInOptions });
  }

  return {
    ok: true,
    ...common,
    bust: false,
    checkout: false,
    dartsUsed: 3,
    remaining: after,
    checkedIn: nowIn,
  };
}

function validDoubleDarts(v) {
  const n = Number(v);
  return v === null || v === undefined || !Number.isInteger(n) || n < 0 || n > 3 ? null : n;
}

// What the keypad needs to ask about darts at a double for a given outcome.
// Returns { min, max } (ask only when they differ), or null when it doesn't apply.
export function doubleDartQuestion({ start, checkedIn, rules, outcome }) {
  if (!outcome?.ok || !checkedIn) return null;
  const r = normaliseRules(rules);
  if (r.finish === "over") return null; // not a real double-out finish
  const checkOut = r.checkOut;
  if (minDartsToFinish(start, checkOut) > 3) return null; // never on a finish this visit

  if (outcome.bust) {
    // A keypad bust doesn't tell us which darts went where, so allow the full range.
    const max = 3 - minDartsToFinish(start, checkOut) + 1;
    return { min: 0, max };
  }
  const range = doubleDartRange({
    start,
    scored: outcome.counted,
    checkOut,
    dartsUsed: outcome.checkout ? outcome.dartsUsed : 3,
    finished: outcome.checkout,
  });
  if (!range || range.max === 0) return null;
  return range;
}

// ---------------------------------------------------------------------------
// Dart by dart
// ---------------------------------------------------------------------------

function scoreDarts(ctx, input) {
  const { remaining: start, checkIn, checkOut, finish, multiplier } = ctx;
  const darts = (input.darts || []).slice(0, 3);
  const over = finish === "over";
  let checkedIn = ctx.checkedIn;
  let raw = 0;
  let doubleDarts = over ? null : 0;
  let checkInDarts = ctx.checkedIn ? null : 0;
  const remainingNow = () => start - applyMultiplier(raw, multiplier);

  for (let i = 0; i < darts.length; i++) {
    const d = darts[i];
    const rem = remainingNow();
    if (!over && checkedIn && isOneDartFinish(rem, checkOut, true)) doubleDarts++;

    if (!checkedIn) {
      checkInDarts++;
      if (checkIn === CHECK_IN.DOUBLE && !isDouble(d)) continue; // wasted until the double lands
      checkedIn = true;
    }

    raw += d.value;
    const after = remainingNow();
    const done = { dartsUsed: i + 1, darts: darts.slice(0, i + 1) };

    if (over) {
      if (after <= 0) return finished(raw, applyMultiplier(raw, multiplier), doubleDarts, checkInDarts, done);
      continue;
    }

    if (after === 0) {
      const legal = checkOut === CHECK_OUT.STRAIGHT || isDouble(d);
      if (!legal) return bust(ctx, i + 1, doubleDarts, { darts: done.darts, checkInDarts });
      return finished(raw, raw, doubleDarts, checkInDarts, done);
    }
    if (isBustRemaining(after, checkOut)) return bust(ctx, i + 1, doubleDarts, { darts: done.darts, checkInDarts });
  }

  const complete = !input.partial || darts.length === 3;
  if (checkInDarts !== null && !checkedIn && complete && !input.partial) checkInDarts = 3; // unentered darts were misses
  return {
    ok: true,
    raw,
    counted: applyMultiplier(raw, multiplier),
    bust: false,
    checkout: false,
    // A submitted visit is always three darts; anything not entered was a miss.
    dartsUsed: input.partial ? darts.length : 3,
    doubleDarts,
    remaining: remainingNow(),
    checkedIn,
    darts,
    checkInDarts,
    complete,
  };
}

function finished(raw, counted, doubleDarts, checkInDarts, done) {
  return {
    ok: true,
    raw,
    counted,
    bust: false,
    checkout: true,
    dartsUsed: done.dartsUsed,
    doubleDarts,
    remaining: 0,
    checkedIn: true,
    darts: done.darts,
    checkInDarts,
  };
}
