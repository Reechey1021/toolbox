// engine/nemesis/thrower.js
// Where a dart lands, given where Nemesis aimed and how good it is right now.
// One skill number (0 hopeless, 1 elite) drives every probability, so the
// planner can tune a single value to hit any target average.

import { BOARD_ORDER, NUMBERS, makeDart, MISS } from "../board.js";

const INDEX = new Map(BOARD_ORDER.map((n, i) => [n, i]));
const lerp = (a, b, t) => a + (b - a) * t;

// The shape of a thrower at a given skill. Skill runs from 0 (hopeless) to 1
// (a solid pub player) and on to 1.5 (elite), with every probability capped at
// something a real human could manage.
export const SKILL_MAX = 1.5;

export function curves(s) {
  const t = Math.max(0, Math.min(SKILL_MAX, s));
  return {
    wild: Math.max(0, lerp(0.3, 0, t * 1.6)), // lands in a random bed
    boardMiss: Math.max(0.001, lerp(0.08, 0.003, t)), // off the board entirely
    segment: Math.min(0.975, lerp(0.42, 0.93, t)), // finds the bed it aimed at
    treble: Math.min(0.66, lerp(0.02, 0.48, Math.pow(t, 1.25))),
    double: Math.min(0.5, lerp(0.025, 0.36, Math.pow(t, 1.2))),
    bull: Math.min(0.42, lerp(0.02, 0.3, Math.pow(t, 1.3))),
    outer: Math.min(0.45, lerp(0.18, 0.4, t)),
  };
}

function neighbour(seg, rng) {
  const steps = rng() < 0.78 ? 1 : 2;
  const dir = rng() < 0.5 ? -1 : 1;
  return BOARD_ORDER[(INDEX.get(seg) + dir * steps + 40) % 20];
}

const randomBed = (rng) => NUMBERS[Math.floor(rng() * 20)];

// aim: a dart from board.js (seg 1-20 or 25, mult 1-3). finishMult scales
// doubles and the bull when this dart could win the leg (checkout strength).
export function throwAt(aim, skill, rng, { finishMult = 1 } = {}) {
  const c = curves(skill);

  if (aim.seg === 25) {
    const pBull = (aim.mult === 2 ? c.bull * finishMult : c.bull * 0.6);
    const r = rng();
    if (r < pBull) return makeDart(25, 2);
    if (r < pBull + c.outer) return makeDart(25, 1);
    if (rng() < c.boardMiss * 0.5) return MISS;
    return makeDart(randomBed(rng), 1);
  }

  if (rng() < c.boardMiss * (aim.mult === 2 ? 1.6 : 1)) return MISS;

  // Which bed?
  let seg;
  if (rng() < c.wild) seg = randomBed(rng);
  else seg = rng() < c.segment ? aim.seg : neighbour(aim.seg, rng);

  // Which ring?
  if (aim.mult === 3) return makeDart(seg, rng() < c.treble ? 3 : 1);
  if (aim.mult === 2) {
    if (rng() < Math.min(0.95, c.double * finishMult)) return makeDart(seg, 2);
    // A missed double lands just inside (a single) or just outside (nothing).
    return rng() < 0.5 ? MISS : makeDart(seg, 1);
  }
  const r = rng();
  if (r < 0.03) return makeDart(seg, 3);
  if (r < 0.05) return makeDart(seg, 2);
  return makeDart(seg, 1);
}

// Checkout strength 1..10 as a multiplier on hitting the finishing double.
export function finishMultiplier(checkout = 5) {
  const k = Math.max(1, Math.min(10, Number(checkout) || 5));
  return k <= 5 ? lerp(0.45, 1, (k - 1) / 4) : lerp(1, 1.7, (k - 5) / 5);
}

// Consistency 1..10 as the spread of visit-to-visit form, in skill units.
export function formSpread(consistency = 5) {
  const c = Math.max(1, Math.min(10, Number(consistency) || 5));
  return lerp(0.2, 0.025, (c - 1) / 9);
}
