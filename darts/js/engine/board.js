// engine/board.js
// The dartboard as data. Every dart is { seg, mult, value }.
//   seg:  1–20 for the numbers, 25 for the bull, 0 for a miss
//   mult: 1 single, 2 double, 3 treble (bull: 1 = outer 25, 2 = bull 50)
//
// Pure module: no DOM, no storage. Safe to import anywhere, including tests.

export const NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);

// Clockwise from the top, for anything that wants to draw a board later.
export const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 11, 14, 9, 12, 5, 8];

export const MISS = Object.freeze({ seg: 0, mult: 0, value: 0 });

export function makeDart(seg, mult = 1) {
  if (seg === 0) return MISS;
  if (seg === 25) {
    const m = mult >= 2 ? 2 : 1;
    return Object.freeze({ seg: 25, mult: m, value: 25 * m });
  }
  if (!Number.isInteger(seg) || seg < 1 || seg > 20) throw new Error(`Bad segment: ${seg}`);
  const m = Math.min(3, Math.max(1, mult | 0));
  return Object.freeze({ seg, mult: m, value: seg * m });
}

// Every distinct scoring dart (misses excluded): 20 singles, 20 doubles,
// 20 trebles, outer bull and bull.
export const SCORING_DARTS = Object.freeze([
  ...NUMBERS.map((n) => makeDart(n, 1)),
  ...NUMBERS.map((n) => makeDart(n, 2)),
  ...NUMBERS.map((n) => makeDart(n, 3)),
  makeDart(25, 1),
  makeDart(25, 2),
]);

export const isDouble = (d) => d.mult === 2; // includes the bull
export const isTreble = (d) => d.mult === 3;
export const isMiss = (d) => d.seg === 0;

// Compact code used in storage: "T20", "D16", "S5", "SB" (25), "DB" (bull), "M".
export function dartCode(d) {
  if (isMiss(d)) return "M";
  const prefix = d.mult === 3 ? "T" : d.mult === 2 ? "D" : "S";
  return prefix + (d.seg === 25 ? "B" : d.seg);
}

// Accepts storage codes plus the looser spellings used in checkout routes:
// "T20", "D16", "20", "S20", "25", "BULL", "DB", "SB", "M", "MISS".
export function parseDart(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c === "M" || c === "MISS" || c === "0") return MISS;
  if (c === "BULL" || c === "DB" || c === "50") return makeDart(25, 2);
  if (c === "SB" || c === "25" || c === "OUTER") return makeDart(25, 1);
  const m = /^([SDT]?)(\d{1,2})$/.exec(c);
  if (!m) throw new Error(`Unknown dart: ${code}`);
  const mult = m[1] === "T" ? 3 : m[1] === "D" ? 2 : 1;
  return makeDart(Number(m[2]), mult);
}

// What people read on screen: "T20", "D16", "20", "25", "Bull", "Miss".
export function dartLabel(d) {
  if (isMiss(d)) return "Miss";
  if (d.seg === 25) return d.mult === 2 ? "Bull" : "25";
  if (d.mult === 3) return `T${d.seg}`;
  if (d.mult === 2) return `D${d.seg}`;
  return String(d.seg);
}
