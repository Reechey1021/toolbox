// services/wind.js
// Wind from Open-Meteo (free for personal use, no key). Checked when the app
// has internet, at most every 15 minutes or after moving 5 km. It's the
// forecast model's value for the area, not a measurement at his spot.

import { dist } from "../engine/geo.js";

/** How the wind meets him: wind *from* ahead is a headwind. */
export function windFeel(fromDeg, headingDeg, speedKmh) {
  if (speedKmh != null && speedKmh < 3) return "szélcsend";
  if (headingDeg == null) return null;
  const a = Math.abs(((((fromDeg - headingDeg) % 360) + 540) % 360) - 180);
  if (a <= 45) return "szembeszél";
  if (a >= 135) return "hátszél";
  return "oldalszél";
}

export function createWind() {
  let data = null;   // { speed, from, gust, at }
  let tried = null;  // { at, lat, lng } of the last attempt
  let busy = false;

  async function maybeFetch(fix, now = Date.now()) {
    if (!fix || busy || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    if (tried && now - tried.at < 15 * 60000 && dist(tried, fix) < 5000) return;
    busy = true;
    tried = { at: now, lat: fix.lat, lng: fix.lng };
    try {
      // two decimals is about 1 km: plenty for wind, and no more precise than needed
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${fix.lat.toFixed(2)}&longitude=${fix.lng.toFixed(2)}` +
        "&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kmh";
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const c = (await res.json()).current;
      if (c && Number.isFinite(c.wind_speed_10m) && Number.isFinite(c.wind_direction_10m)) {
        data = { speed: c.wind_speed_10m, from: c.wind_direction_10m, gust: c.wind_gusts_10m, at: now };
      }
    } catch {
      tried.at = now - 13 * 60000; // try again in about 2 minutes
    } finally {
      busy = false;
    }
  }

  /** The latest wind, or null if there is none or it's over 90 minutes old. */
  const get = (now = Date.now()) => (data && now - data.at < 90 * 60000 ? data : null);
  return { maybeFetch, get };
}
