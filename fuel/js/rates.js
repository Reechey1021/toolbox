// js/rates.js
// Exchange rates: the European Central Bank's daily rates via Frankfurter (free,
// no key, works from a browser). Kept for 12 hours; if it can't be reached, the
// last rates we had (or rough built-in ones, marked as such).

const KEY = "reechFuel:rates";
const FRESH_MS = 12 * 60 * 60 * 1000;
const FALLBACK = { base: "EUR", date: null, rates: { GBP: 0.87, HUF: 395 }, approximate: true };
const SOURCES = ["https://api.frankfurter.app/latest?from=EUR&to=GBP,HUF", "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=GBP,HUF"];

function cached() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export async function getRates({ force = false } = {}) {
  const c = cached();
  if (!force && c && Date.now() - c.fetchedAt < FRESH_MS) return c;
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const j = await res.json();
      if (!j?.rates?.GBP || !j?.rates?.HUF) continue;
      const out = { base: j.base || "EUR", date: j.date, rates: { GBP: j.rates.GBP, HUF: j.rates.HUF }, fetchedAt: Date.now() };
      localStorage.setItem(KEY, JSON.stringify(out));
      return out;
    } catch {
      /* try the next one */
    }
  }
  return c ? { ...c, stale: true } : { ...FALLBACK, fetchedAt: 0 };
}
