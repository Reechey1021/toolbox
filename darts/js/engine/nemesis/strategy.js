// engine/nemesis/strategy.js
// Where Nemesis aims each dart, the way a sensible player would:
//   on a finish        follow the checkout route for the darts in hand
//   close, no finish   pick the dart that leaves the best next shot, never a bust
//   far out            treble 20 (or the 19 bed when it fancies it)
//   double in          go for D20 until it's in
//   handicap, go over  just score

import { SCORING_DARTS, makeDart } from "../board.js";
import { suggestCheckout } from "../checkouts.js";
import { minDartsToFinish, CHECK_OUT } from "../rules.js";

const T20 = makeDart(20, 3);
const T19 = makeDart(19, 3);
const D20 = makeDart(20, 2);
const PREFERRED = { 32: 12, 40: 12, 16: 10, 24: 9, 36: 8, 20: 8, 8: 7, 12: 7, 50: 3 };

// Setups considered when close to a finish: every single, the big trebles, both bulls.
const SETUP_AIMS = SCORING_DARTS.filter((d) => d.mult === 1 || (d.mult === 3 && d.seg >= 13) || d.seg === 25);

function finishable(rem, darts, checkOut) {
  return darts > 0 && minDartsToFinish(rem, checkOut) <= darts;
}

// How good a leave is for the rest of this visit, then for the next one.
function leaveQuality(leave, dartsAfter, checkOut) {
  const bust = leave < 0 || (checkOut === CHECK_OUT.DOUBLE && leave === 1);
  if (bust || leave === 0) return -1000;
  if (finishable(leave, dartsAfter, checkOut)) return 200 - minDartsToFinish(leave, checkOut) * 10 + (PREFERRED[leave] ?? 0);
  if (finishable(leave, 1, checkOut)) return 100 + (PREFERRED[leave] ?? 0);
  if (finishable(leave, 2, checkOut)) return 70;
  if (finishable(leave, 3, checkOut)) return 40;
  return 20 - leave / 100;
}

const setupMemo = new Map();
function bestSetup(rem, dartsLeft, checkOut) {
  const key = `${rem}|${dartsLeft}|${checkOut}`;
  if (setupMemo.has(key)) return setupMemo.get(key);
  let best = T20;
  let bestQ = -Infinity;
  for (const aim of SETUP_AIMS) {
    const q = leaveQuality(rem - aim.value, dartsLeft - 1, checkOut) + aim.value / 1000;
    if (q > bestQ) {
      bestQ = q;
      best = aim;
    }
  }
  setupMemo.set(key, best);
  return best;
}

// rules: a side's rules (checkIn, checkOut, finish, multiplier).
export function chooseAim({ rem, dartsLeft, rules, checkedIn, nineteens = false }) {
  const scoring = nineteens ? T19 : T20;
  if (rules.finish === "over") return scoring;
  if (!checkedIn) return D20;
  const route = suggestCheckout(rem, { checkOut: rules.checkOut, dartsLeft, checkedIn: true });
  if (route) return route[0];
  if (rem > 110) return scoring;
  return bestSetup(rem, dartsLeft, rules.checkOut);
}

// True when this aim could win the leg with this dart (checkout strength applies).
export function isFinishingAim(aim, rem, rules) {
  if (rules.finish === "over") return false;
  if (aim.value !== rem) return false;
  return rules.checkOut === CHECK_OUT.STRAIGHT || aim.mult === 2;
}
