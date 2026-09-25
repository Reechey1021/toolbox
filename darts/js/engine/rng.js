// engine/rng.js
// Seeded random numbers, so the same seed always produces the same sequence.
// Nemesis uses this so a leg is identical every time it's replayed (undo,
// refresh, history) without storing anything extra.

// FNV-1a: turns any string into a 32-bit seed.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Mulberry32: small, fast and good enough for dart throwing.
export function makeRng(seed) {
  let a = (typeof seed === "number" ? seed : hashSeed(seed)) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return next;
}

// A normally distributed number (mean 0, sd 1).
export function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}
