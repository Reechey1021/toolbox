// js/store.js
// Your games (from the game creator) and your last settings, in this browser.

const P = "reechCharades:";
const read = (k, d) => {
  try {
    const v = localStorage.getItem(P + k);
    return v === null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(P + k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};

export const games = () => read("games", []);
export const saveGames = (list) => write("games", list);
export const newId = () => `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// One word per line, or separated by commas; tidied and de-duplicated.
export function parseWords(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text || "").split(/[\n,]/)) {
    const w = raw.replace(/\s+/g, " ").trim().slice(0, 40);
    if (w && !seen.has(w.toLowerCase())) seen.add(w.toLowerCase()), out.push(w);
  }
  return out;
}

export const DEFAULTS = { time: 60, boost: 0, tilt: true };
export const settings = () => ({ ...DEFAULTS, ...read("settings", {}) });
export const saveSettings = (s) => write("settings", { ...settings(), ...s });
