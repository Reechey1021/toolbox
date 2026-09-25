// engine/rules.js
// Finishing maths, derived from the board rather than hand-typed tables, so every
// rule combination (straight/double in, double/straight out) stays correct.

import { SCORING_DARTS, isDouble } from "./board.js";

export const CHECK_IN = Object.freeze({ STRAIGHT: "straight", DOUBLE: "double" });
export const CHECK_OUT = Object.freeze({ DOUBLE: "double", STRAIGHT: "straight" });

// Distinct values a single dart can score.
const ANY_VALUES = [...new Set(SCORING_DARTS.map((d) => d.value))].sort((a, b) => a - b);
const DOUBLE_VALUES = [...new Set(SCORING_DARTS.filter(isDouble).map((d) => d.value))].sort((a, b) => a - b);
const ANY_SET = new Set(ANY_VALUES);
const DOUBLE_SET = new Set(DOUBLE_VALUES);
const WITH_MISS = [0, ...ANY_VALUES];

function finisherSet(checkOut) {
  return checkOut === CHECK_OUT.STRAIGHT ? ANY_SET : DOUBLE_SET;
}

// ---------------------------------------------------------------------------
// Visit totals
// ---------------------------------------------------------------------------

function sumsOfThree(firstValues) {
  const out = new Set();
  for (const a of firstValues) for (const b of WITH_MISS) for (const c of WITH_MISS) out.add(a + b + c);
  return out;
}

// Any total three darts can make (0–180 minus 163, 166, 169, 172, 173, 175, 176, 178, 179).
const VISIT_TOTALS = sumsOfThree(WITH_MISS);
// Totals that can count when the visit has to start with a double (double in).
const CHECK_IN_TOTALS = (() => {
  const s = sumsOfThree(DOUBLE_VALUES);
  s.add(0);
  return s;
})();

export function isPossibleVisitTotal(score) {
  return VISIT_TOTALS.has(score);
}

export function isPossibleCheckInTotal(score) {
  return CHECK_IN_TOTALS.has(score);
}

export const IMPOSSIBLE_VISIT_TOTALS = Object.freeze(
  Array.from({ length: 181 }, (_, i) => i).filter((n) => !VISIT_TOTALS.has(n))
);

// ---------------------------------------------------------------------------
// Finishes
// ---------------------------------------------------------------------------

const minDartsMemo = new Map();

// Fewest darts that can finish `remaining` exactly: 1, 2, 3 or Infinity.
// needsDoubleIn: the player hasn't checked in yet, so the first dart must be a double.
export function minDartsToFinish(remaining, checkOut = CHECK_OUT.DOUBLE, needsDoubleIn = false) {
  const r = Number(remaining);
  if (!Number.isInteger(r) || r < 1) return Infinity;
  const key = `${r}|${checkOut}|${needsDoubleIn ? 1 : 0}`;
  if (minDartsMemo.has(key)) return minDartsMemo.get(key);

  const fin = finisherSet(checkOut);
  const first = needsDoubleIn ? DOUBLE_VALUES : ANY_VALUES;
  let result = Infinity;

  if (fin.has(r) && (!needsDoubleIn || DOUBLE_SET.has(r))) {
    result = 1;
  } else if (first.some((a) => fin.has(r - a))) {
    result = 2;
  } else if (first.some((a) => ANY_VALUES.some((b) => fin.has(r - a - b)))) {
    result = 3;
  }

  minDartsMemo.set(key, result);
  return result;
}

export function canCheckout(remaining, checkOut, needsDoubleIn = false, dartsLeft = 3) {
  return minDartsToFinish(remaining, checkOut, needsDoubleIn) <= dartsLeft;
}

// Scores you can be left on but can't finish in one visit.
export function bogeyNumbers(checkOut = CHECK_OUT.DOUBLE) {
  const top = checkOut === CHECK_OUT.STRAIGHT ? 180 : 170;
  const out = [];
  for (let r = 2; r <= top; r++) if (!canCheckout(r, checkOut)) out.push(r);
  return out;
}

// A one-dart finish is on: this is when a dart counts as a "dart at a double".
export function isOneDartFinish(remaining, checkOut, checkedIn = true) {
  return minDartsToFinish(remaining, checkOut, !checkedIn) === 1;
}

// Where a visit ends up after scoring `points` from `remaining`.
export function isBustRemaining(after, checkOut) {
  return after < 0 || (checkOut === CHECK_OUT.DOUBLE && after === 1);
}

// ---------------------------------------------------------------------------
// Double in: which dart could have been the one that checked in?
// ---------------------------------------------------------------------------
// A keypad visit that checks in scores `counted` from the double onward. If the
// double was dart 3 the total is just a double; dart 2, a double plus one dart;
// dart 1, a double plus two darts. Returns the possible dart numbers.

const CHECK_IN_ON = [
  null,
  sumsOfThree(DOUBLE_VALUES), // double on dart 1, then two more darts
  (() => {
    const s = new Set();
    for (const d of DOUBLE_VALUES) for (const a of WITH_MISS) s.add(d + a);
    return s;
  })(), // double on dart 2, then one more
  new Set(DOUBLE_VALUES), // double on dart 3
];

export function checkInDartOptions(counted) {
  if (!Number.isInteger(counted) || counted <= 0) return [];
  return [1, 2, 3].filter((k) => CHECK_IN_ON[k].has(counted));
}

// ---------------------------------------------------------------------------
// Go over: a handicap finish where reaching zero or below wins the leg.
// ---------------------------------------------------------------------------

// Points counted for a raw score under a multiplier (rounded, like the original app).
export function applyMultiplier(raw, multiplier = 1) {
  return multiplier === 1 ? raw : Math.round(raw * multiplier);
}

// Fewest raw points that finish from `remaining` when going over is allowed.
export function goOverNeed(remaining, multiplier = 1) {
  if (remaining <= 0) return 0;
  let r = Math.max(0, Math.ceil(remaining / multiplier) - 1);
  while (applyMultiplier(r, multiplier) < remaining) r++;
  return r;
}

export function goOverMinDarts(remaining, multiplier = 1) {
  const need = goOverNeed(remaining, multiplier);
  if (need <= 60) return 1;
  if (need <= 120) return 2;
  if (need <= 180) return 3;
  return Infinity;
}

// ---------------------------------------------------------------------------
// Darts at a double
// ---------------------------------------------------------------------------
// Given what we know about a keypad visit (where it started, what it scored,
// whether it finished), work out the fewest and most darts that could have been
// thrown with a one-dart finish on. When both agree we never need to ask.

export function doubleDartRange({ start, scored, checkOut, dartsUsed = 3, finished = false }) {
  if (!Number.isInteger(start) || !Number.isInteger(scored)) return null;
  const fin = finisherSet(checkOut);
  const memo = new Map();

  // Returns [min, max] over valid sequences for darts i..dartsUsed-1, or null.
  function walk(i, rem, left) {
    const key = `${i}|${rem}|${left}`;
    if (memo.has(key)) return memo.get(key);
    let best = null;
    const at = isOneDartFinish(rem, checkOut) ? 1 : 0;
    const last = i === dartsUsed - 1;

    if (last && finished) {
      // Final dart must finish exactly.
      if (left === rem && fin.has(rem)) best = [at, at];
    } else if (last) {
      if (WITH_MISS.includes(left) && !isBustRemaining(rem - left, checkOut) && rem - left !== 0) best = [at, at];
    } else {
      for (const v of WITH_MISS) {
        if (v > left) break;
        const next = rem - v;
        if (next === 0 || isBustRemaining(next, checkOut)) continue;
        const sub = walk(i + 1, next, left - v);
        if (!sub) continue;
        const lo = sub[0] + at;
        const hi = sub[1] + at;
        best = best ? [Math.min(best[0], lo), Math.max(best[1], hi)] : [lo, hi];
      }
    }

    memo.set(key, best);
    return best;
  }

  const r = walk(0, start, scored);
  return r ? { min: r[0], max: r[1] } : null;
}
