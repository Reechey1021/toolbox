// engine/sectors.js
// Split ("részidő") timing and the "how far ahead or behind am I" maths.
//
// computeSectorTimes and computeSectorDeltas are straight ports of the Android
// app, so sector times for imported rides and new rides are measured the same
// way: a list with one entry per split, each the whole seconds elapsed when the
// rider first reached that split (cumulative, not per-sector durations).

import { nearestIndexInWindow, cumulative, alongRoute, dist } from "./geo.js";

/** Android: computeSectorTimesFromRecorded. */
export function computeSectorTimes(route, splitIndices, samples, finalElapsedSeconds = null) {
  if (route.length < 2 || !splitIndices.length || !samples.length) return [];
  const last = route.length - 1;
  const splits = [...new Set(splitIndices.map((i) => Math.min(Math.max(i, 1), last)))].sort((a, b) => a - b);
  if (!splits.length) return [];
  const out = [];
  let next = 0;
  let maxIdx = 0;
  for (const s of samples) {
    const idx = nearestIndexInWindow(route, s, Math.max(maxIdx - 3, 0), Math.min(maxIdx + 20, last));
    maxIdx = Math.max(maxIdx, idx);
    while (next < splits.length && maxIdx >= splits[next]) {
      out.push(Math.trunc(s.elapsedMs / 1000));
      next++;
    }
  }
  while (out.length < splits.length && finalElapsedSeconds != null) out.push(finalElapsedSeconds);
  return out;
}

/** Android: computeSectorDeltasFromRecorded. Each entry may be null. */
export function computeSectorDeltas(route, splitIndices, samples, referenceSamples) {
  const cur = computeSectorTimes(route, splitIndices, samples, null);
  const ref = computeSectorTimes(route, splitIndices, referenceSamples, null);
  if (!cur.length) return [];
  return cur.map((t, i) => (ref[i] == null ? null : t - ref[i]));
}

/**
 * Turns cumulative split times into the rows people read:
 * one row per sector with its own duration, the total so far, and the delta.
 */
export function sectorRows(splitTimes, totalSeconds, splitDeltas = []) {
  if (!splitTimes.length) return [];
  const rows = [];
  let prev = 0;
  splitTimes.forEach((t, i) => {
    rows.push({ n: i + 1, duration: t - prev, at: t, delta: splitDeltas[i] ?? null });
    prev = t;
  });
  if (totalSeconds != null && totalSeconds >= prev) {
    rows.push({ n: splitTimes.length + 1, duration: totalSeconds - prev, at: totalSeconds, delta: null, last: true });
  }
  return rows;
}

/**
 * A reference ride (usually the record) mapped onto the course, so we can ask
 * "when was the record rider at this distance along the course?".
 * Each reference sample is placed by tracking it along the route with the
 * same moving window the race uses, then projected between route points.
 */
export function buildReference(route, referenceSamples) {
  if (route.length < 2 || referenceSamples.length < 2) return null;
  const cum = cumulative(route);
  const last = route.length - 1;
  const d = [], t = [];
  let maxIdx = 0, maxAlong = 0;
  for (const s of referenceSamples) {
    const idx = nearestIndexInWindow(route, s, Math.max(maxIdx - 3, 0), Math.min(maxIdx + 20, last));
    maxIdx = Math.max(maxIdx, idx);
    const along = Math.max(maxAlong, alongRoute(route, cum, idx, s));
    maxAlong = along;
    d.push(along); t.push(s.elapsedMs);
  }
  return { cum, d, t, length: cum[last] };
}

/** Reference elapsed ms at `along` metres, interpolated. */
export function refElapsedAt(ref, along) {
  const { d, t } = ref;
  if (along <= d[0]) return t[0];
  if (along >= d[d.length - 1]) return t[t.length - 1];
  let lo = 0, hi = d.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (d[mid] < along) lo = mid; else hi = mid;
  }
  const span = d[hi] - d[lo];
  const k = span > 0 ? (along - d[lo]) / span : 0;
  return t[lo] + k * (t[hi] - t[lo]);
}

/** Android's DeltaState thresholds: under −0.05 s ahead, over +0.05 s behind. */
export function deltaState(seconds) {
  if (seconds == null) return "neutral";
  if (seconds < -0.05) return "ahead";
  if (seconds > 0.05) return "behind";
  return "neutral";
}

// ---------- chart series (for history pages) ----------

function cumKm(samples) {
  const out = [0];
  for (let i = 1; i < samples.length; i++) out.push(out[i - 1] + dist(samples[i - 1], samples[i]) / 1000);
  return out;
}

/** Android: computeDeltaSeriesByDistance. Seconds ahead (−) or behind (+) along the ride. */
export function deltaSeriesByDistance(samples, referenceSamples) {
  if (samples.length < 2 || referenceSamples.length < 2) return [];
  const a = cumKm(samples), r = cumKm(referenceSamples);
  const out = [];
  for (let i = 0; i < samples.length; i++) {
    const km = a[i];
    let refMs;
    if (km >= r[r.length - 1]) refMs = referenceSamples[referenceSamples.length - 1].elapsedMs;
    else {
      let j = 1;
      while (j < r.length && r[j] < km) j++;
      const span = r[j] - r[j - 1];
      const k = span > 0 ? (km - r[j - 1]) / span : 0;
      refMs = referenceSamples[j - 1].elapsedMs + k * (referenceSamples[j].elapsedMs - referenceSamples[j - 1].elapsedMs);
    }
    out.push({ km, v: (samples[i].elapsedMs - refMs) / 1000 });
  }
  return out;
}

/** Android: filterSpeedGraphOutliers. Drops GPS spikes far above the 90th percentile. */
export function filterSpeedOutliers(values) {
  if (values.length < 5) return values;
  const ok = values.filter((v) => Number.isFinite(v) && v >= 0);
  if (ok.length < 5) return values;
  const sorted = [...ok].sort((a, b) => a - b);
  const p90 = sorted[Math.min(Math.max(Math.trunc((sorted.length - 1) * 0.9), 0), sorted.length - 1)];
  const cap = Math.max(25, Math.max(p90 + 5, p90 * 1.35));
  return values.map((v) => (Number.isFinite(v) && v >= 0 ? Math.min(v, cap) : 0));
}

/** Speed (km/h) between consecutive samples, by distance. */
export function speedSeries(samples) {
  if (samples.length < 2) return [];
  const km = cumKm(samples);
  const raw = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].elapsedMs - samples[i - 1].elapsedMs) / 1000;
    const dm = (km[i] - km[i - 1]) * 1000;
    raw.push(dt > 0 ? (dm / dt) * 3.6 : 0);
  }
  const vals = filterSpeedOutliers(raw);
  // light smoothing over 3 points so the line reads at a glance
  return vals.map((v, i) => {
    const w = vals.slice(Math.max(0, i - 1), i + 2);
    return { km: km[i + 1], v: w.reduce((s, x) => s + x, 0) / w.length };
  });
}

export function altitudeSeries(samples) {
  const km = cumKm(samples);
  return samples.map((s, i) => ({ km: km[i], v: s.altitudeMeters })).filter((p) => p.v != null && Number.isFinite(p.v));
}

export function heartSeries(samples) {
  const km = cumKm(samples);
  return samples.map((s, i) => ({ km: km[i], v: s.heartRate })).filter((p) => p.v != null && p.v > 0);
}
