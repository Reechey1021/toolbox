// engine/nemesis/planner.js
// Plans a whole leg for Nemesis before it throws a dart.
//
//   1. Pick this leg's target average: somewhere inside target ± range, nudged
//      by composure and the match score (never outside the range).
//   2. Start from the calibrated skill for that average, throw a quick trial
//      of legs, and correct the skill if they came out high or low. This keeps
//      it accurate from any starting score, with any rules.
//   3. Simulate a batch of candidate legs, every dart real, and keep the one
//      closest to the target.
//
// Everything is seeded from the match, so a leg is the same every replay.

import { makeRng } from "../rng.js";
import { simulateLeg } from "./sim.js";
import { SKILL_MAX } from "./thrower.js";

// Average produced at each skill (501, double out, neutral dials).
// Measured by tools/calibrate.mjs over 600 legs per row.
const TABLE = [
  [0, 13.54], [0.05, 14.88], [0.1, 16.08], [0.15, 19.84], [0.2, 21.55], [0.25, 25], [0.3, 28.84],
  [0.35, 32.81], [0.4, 37.15], [0.45, 40.61], [0.5, 43.85], [0.55, 48.48], [0.6, 52.61], [0.65, 57.9],
  [0.7, 63.07], [0.75, 67.06], [0.8, 71.06], [0.85, 76.77], [0.9, 79.89], [0.95, 87.54], [1, 91.94],
  [1.05, 95.67], [1.1, 99.38], [1.15, 101.55], [1.2, 106.28], [1.25, 109.51], [1.3, 111.15], [1.35, 113.38],
  [1.4, 114.6], [1.45, 115.36], [1.5, 115.97],
];

const PILOT = 16;
const CANDIDATES = 40;
const SPREAD = 0.12; // skill spread across the candidate batch

// The skill that should produce an average.
export function skillFor(avg) {
  if (avg <= TABLE[0][1]) return 0;
  for (let i = 1; i < TABLE.length; i++) {
    const [s1, a1] = TABLE[i];
    const [s0, a0] = TABLE[i - 1];
    if (avg <= a1) return s0 + ((avg - a0) / (a1 - a0)) * (s1 - s0);
  }
  return SKILL_MAX;
}

// How much skill one point of average costs, near a given skill.
function skillPerPoint(skill) {
  const lo = Math.max(0, skill - 0.1);
  const hi = Math.min(SKILL_MAX, skill + 0.1);
  const aLo = averageFor(lo);
  const aHi = averageFor(hi);
  return aHi > aLo ? (hi - lo) / (aHi - aLo) : 0.01;
}

function averageFor(skill) {
  for (let i = 1; i < TABLE.length; i++) {
    const [s1, a1] = TABLE[i];
    const [s0, a0] = TABLE[i - 1];
    if (skill <= s1) return a0 + ((skill - s0) / (s1 - s0)) * (a1 - a0);
  }
  return TABLE[TABLE.length - 1][1];
}

// Composure: behind in legs (or in a deciding leg), a composed Nemesis leans to
// the top of its range and a bottler to the bottom. Returns -1..1.
export function composureLean({ composure = 5, legsFor = 0, legsAgainst = 0, need = 1 }) {
  const behind = Math.max(0, legsAgainst - legsFor);
  const deciding = need > 1 && legsFor === need - 1 && legsAgainst === need - 1;
  const pressure = Math.max(behind, deciding ? 1 : 0);
  if (!pressure) return 0;
  return Math.max(-1, Math.min(1, (pressure * (composure - 5) * 0.6) / 5));
}

// This leg's target average, inside target ± range.
export function legTarget({ profile, legsFor, legsAgainst, need, rng }) {
  const lean = composureLean({ composure: profile.composure, legsFor, legsAgainst, need });
  const x = lean + (rng() * 2 - 1) * (1 - Math.abs(lean));
  return profile.target + x * profile.range;
}

// A leg can only average 3 x start / darts, so near a target there are just two
// real options (a 14-darter or a 15-darter, say). Pick between them in the right
// proportion so the long-run average is the target, but never step outside the range.
function snapToReal(target, start, lo, hi, rng) {
  const ideal = (3 * start) / target;
  const low = (3 * start) / Math.ceil(ideal); // the longer leg, lower average
  const high = (3 * start) / Math.floor(ideal); // the shorter leg, higher average
  const inside = [low, high].filter((a) => a >= lo - 0.01 && a <= hi + 0.01);
  if (inside.length === 2 && high > low) return rng() < (target - low) / (high - low) ? high : low;
  if (inside.length === 1) return inside[0];
  return Math.abs(high - target) < Math.abs(low - target) ? high : low;
}

// Plan one leg. Returns { visits: [[dart, ...], ...], avg, target, skill }.
export function planLeg({ seed, start, rules, profile, legsFor = 0, legsAgainst = 0, need = 1 }) {
  const rng = makeRng(seed);
  const lo = profile.target - profile.range;
  const hi = profile.target + profile.range;
  const aim = legTarget({ profile, legsFor, legsAgainst, need, rng });
  const target = rules.finish === "over" ? aim : snapToReal(aim, start, lo, hi, rng);

  // Trial run: correct the calibrated skill for these rules and this start.
  let skill = skillFor(target);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < PILOT; i++) {
    const leg = simulateLeg({ start, rules, skill, profile, rng });
    if (leg.finished) {
      sum += leg.avg;
      n++;
    }
  }
  if (n) skill = Math.max(0, Math.min(SKILL_MAX, skill + (target - sum / n) * skillPerPoint(skill)));

  // Candidates around the corrected skill; keep the closest to the target. If a
  // whole batch misses the range (it happens, darts are random), re-aim the skill
  // from what that batch did and throw another, up to three more times.
  let best = null;
  let bestCost = Infinity;
  for (let round = 0; round < 4; round++) {
    let sumAvg = 0;
    let finished = 0;
    for (let k = 0; k < CANDIDATES; k++) {
      const s = Math.max(0, Math.min(SKILL_MAX, skill + ((k + 0.5) / CANDIDATES - 0.5) * SPREAD));
      const leg = simulateLeg({ start, rules, skill: s, profile, rng });
      if (!leg.finished) continue;
      sumAvg += leg.avg;
      finished++;
      const outside = leg.avg < lo - 0.01 || leg.avg > hi + 0.01 ? 100 : 0;
      const cost = Math.abs(leg.avg - target) + outside;
      if (cost < bestCost) {
        bestCost = cost;
        best = { ...leg, skill: s };
      }
    }
    if (bestCost < 100) break; // inside the range
    if (finished) skill = Math.max(0, Math.min(SKILL_MAX, skill + (target - sumAvg / finished) * skillPerPoint(skill)));
  }
  if (!best) best = { ...simulateLeg({ start, rules, skill, profile, rng, maxVisits: 200 }), skill };
  return { visits: best.visits, avg: best.avg, target, skill: best.skill };
}
