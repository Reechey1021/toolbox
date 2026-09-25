// js/game.js
// Dealing a round: who's an impostor, and the word everyone else gets. Pure.

// A list of n seats; `true` marks an impostor. Exactly k of them, anywhere.
export function dealRoles(n, k) {
  const seats = Array.from({ length: n }, (_, i) => i < k);
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  return seats;
}

// A word that hasn't come up in the last `avoid` rounds (when there's enough to choose from).
export function pickWord(words, recent = []) {
  const skip = new Set(recent);
  const pool = words.filter((w) => !skip.has(w.word));
  const from = pool.length ? pool : words;
  return from[Math.floor(Math.random() * from.length)];
}

// The most impostors that still makes a game.
export const maxImpostors = (players) => Math.max(1, players - 2);
