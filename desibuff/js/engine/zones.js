// engine/zones.js
// Heart-rate zones. Five zones, each defined by the bpm where it starts; the
// top of zone 5 is his max heart rate. By default the starts are 50/60/70/80/90 %
// of max; "Zónák testreszabása" lets him set his own bpm for each.
// Pure module.

export const ZONE_NAMES = ["", "Pihenő", "Könnyű", "Tempó", "Küszöb", "Maximum"];
export const ZONE_COLORS = ["#9aa6c8", "#9aa6c8", "#5ec8ff", "#c2fe00", "#ffd54f", "#ff4d5a"];
const PCTS = [0.5, 0.6, 0.7, 0.8, 0.9];

export const defaultStarts = (max) => PCTS.map((p) => Math.round(p * max));

/** The limits in use: { starts: [5 bpm], max }. Custom if he set them, else from max. */
export function zoneLimits(settings) {
  const max = settings.maxHr || 170;
  const custom = Array.isArray(settings.hrZones) && settings.hrZones.length === 5;
  return { starts: custom ? settings.hrZones.slice() : defaultStarts(max), max, custom };
}

/** Which zone (1–5) a bpm is in; 0 below zone 1. */
export function zoneOf(bpm, { starts }) {
  if (!bpm) return 0;
  let z = 0;
  for (let i = 0; i < 5; i++) if (bpm >= starts[i]) z = i + 1;
  return z;
}

/**
 * How full each of the five bar segments is (0..1). Segments below his zone are
 * full, his zone's segment is filled by how far through that zone he is.
 * Example: zone 4 runs 120–150 and he's at 135 → [1, 1, 1, 0.5, 0].
 */
export function zoneFill(bpm, { starts, max }) {
  const ends = [...starts.slice(1), max];
  return starts.map((s, i) => {
    if (!bpm || bpm <= s) return 0;
    if (bpm >= ends[i]) return 1;
    return (bpm - s) / (ends[i] - s);
  });
}

/**
 * Change one limit and keep everything valid: starts strictly rising, zone 1
 * no lower than 40 bpm, max above the start of zone 5 and at most 230.
 * which: 0–4 for a zone start, "max" for max heart rate.
 */
export function setLimit({ starts, max }, which, value) {
  const s = starts.slice();
  let m = max;
  const v = Math.round(value);
  if (which === "max") m = Math.min(230, Math.max(s[4] + 1, v));
  else {
    const lo = which === 0 ? 40 : s[which - 1] + 1;
    const hi = which === 4 ? m - 1 : s[which + 1] - 1;
    s[which] = Math.min(hi, Math.max(lo, v));
  }
  return { starts: s, max: m };
}
