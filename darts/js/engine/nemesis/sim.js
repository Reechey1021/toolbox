// engine/nemesis/sim.js
// Simulates Nemesis throwing: one visit, or a whole leg. It mirrors the scoring
// rules in visit.js dart for dart (tests prove every simulated leg replays
// identically through the real engine), but skips the bookkeeping, so the
// planner can throw thousands of darts per leg in a few milliseconds.

import { applyMultiplier } from "../rules.js";
import { gaussian } from "../rng.js";
import { throwAt, finishMultiplier, formSpread, SKILL_MAX } from "./thrower.js";
import { chooseAim, isFinishingAim } from "./strategy.js";

const clampSkill = (x) => Math.max(0, Math.min(SKILL_MAX, x));

// How often a player at this skill fancies the 19 bed for a visit.
const nineteenChance = (s) => 0.04 + 0.08 * Math.max(0, 1 - Math.abs(s - 0.6) * 1.6);

// One visit from `start`. Returns the darts and where the side ends up.
export function simulateVisit({ start, checkedIn, rules, skill, rng, finishMult = 1 }) {
  const darts = [];
  const nineteens = rng() < nineteenChance(skill);
  const over = rules.finish === "over";
  let rem = start;
  let raw = 0;
  let inNow = checkedIn;

  for (let i = 0; i < 3; i++) {
    const aim = chooseAim({ rem, dartsLeft: 3 - i, rules, checkedIn: inNow, nineteens });
    const mult = isFinishingAim(aim, rem, rules) ? finishMult : 1;
    const d = throwAt(aim, skill, rng, { finishMult: mult });
    darts.push(d);

    if (!inNow) {
      if (rules.checkIn === "double" && d.mult !== 2) continue;
      inNow = true;
    }

    if (over) {
      raw += d.value;
      if (applyMultiplier(raw, rules.multiplier) >= start) return { darts, rem: 0, checkedIn: true, finished: true, busted: false };
      rem = start - applyMultiplier(raw, rules.multiplier);
      continue;
    }

    const after = rem - d.value;
    if (after === 0) {
      if (rules.checkOut === "straight" || d.mult === 2) return { darts, rem: 0, checkedIn: true, finished: true, busted: false };
      return { darts, rem: start, checkedIn, finished: false, busted: true };
    }
    if (after < 0 || (rules.checkOut === "double" && after === 1)) {
      return { darts, rem: start, checkedIn, finished: false, busted: true };
    }
    rem = after;
  }
  return { darts, rem, checkedIn: inNow, finished: false, busted: false };
}

// A whole leg from `start` until it checks out (or gives up after maxVisits).
// profile supplies consistency (form swings) and checkout (finishing).
export function simulateLeg({ start, rules, skill, profile, rng, maxVisits = 80 }) {
  const spread = formSpread(profile.consistency);
  const finishMult = finishMultiplier(profile.checkout);
  const legForm = gaussian(rng) * spread * 0.5;
  const visits = [];
  let rem = start;
  let checkedIn = rules.checkIn !== "double";
  let darts = 0;
  let points = 0;

  for (let v = 0; v < maxVisits; v++) {
    const visitSkill = clampSkill(skill + legForm + gaussian(rng) * spread);
    const out = simulateVisit({ start: rem, checkedIn, rules, skill: visitSkill, rng, finishMult });
    visits.push(out.darts);
    const used = out.finished || out.busted ? out.darts.length : 3;
    darts += used;
    if (!out.busted) points += rem - out.rem;
    rem = out.rem;
    checkedIn = out.checkedIn;
    if (out.finished) return { visits, darts, finished: true, avg: (start / darts) * 3 };
  }
  return { visits, darts, finished: false, avg: darts ? (points / darts) * 3 : 0 };
}
