// engine/bull.js
// Throwing for the bull to decide who starts.
// Positions are in millimetres from the centre of the board, measured the way a
// real board is built, so "closest" means what it would on the oche.

// Regulation board radii (mm).
export const BOARD = Object.freeze({
  bull: 6.35, // inner bull, 50
  outerBull: 15.9, // outer bull, 25
  trebleInner: 99,
  trebleOuter: 107,
  doubleInner: 162,
  doubleOuter: 170,
});

// Two darts closer together than this (in distance from the centre) are too
// close to call on a phone screen, so it's a rethrow.
export const TIE_MM = 0.75;

export function distanceMm(t) {
  return Math.hypot(t.x, t.y);
}

// Which ring a dart landed in, for the result text.
export function ringOf(t) {
  const d = distanceMm(t);
  if (d <= BOARD.bull) return "bull";
  if (d <= BOARD.outerBull) return "outer bull";
  return null;
}

// throws: [{ x, y }] in throwing order.
// Returns { distances, winner, tie, tied } where tie means throw again.
// Real rule: two darts in the inner bull is always a rethrow.
export function resolveBull(throws) {
  const distances = throws.map(distanceMm);
  if (distances.length < 2) return { distances, winner: distances.length ? 0 : null, tie: false, tied: [] };

  const best = Math.min(...distances);
  const close = distances.map((d, i) => ({ d, i })).filter(({ d }) => d - best < TIE_MM).map(({ i }) => i);
  const inBull = distances.map((d, i) => ({ d, i })).filter(({ d }) => d <= BOARD.bull).map(({ i }) => i);

  if (inBull.length >= 2) return { distances, winner: null, tie: true, tied: inBull };
  if (close.length >= 2) return { distances, winner: null, tie: true, tied: close };
  return { distances, winner: distances.indexOf(best), tie: false, tied: [] };
}

// Round a throw for storage (0.1 mm is plenty).
export function cleanThrow(t) {
  return { x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10 };
}
