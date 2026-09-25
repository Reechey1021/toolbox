// engine/nemesis/profile.js
// Nemesis's personality. Four dials plus a target average:
//   target       the 3-dart average it plays to
//   range        how far one leg's average can land from the target (± points)
//   consistency  1 wild .. 10 steady: how much its form swings visit to visit
//   checkout     1 shaky .. 10 clinical: how well it hits doubles
//   composure    1 bottler .. 10 ice cold: how it reacts to the match score
// Presets are just named combinations of the dials.

export const TARGET_MIN = 20;
export const TARGET_MAX = 110;
export const RANGE_MAX = 15;

export const PRESETS = [
  { id: "standard", name: "Standard", blurb: "Your usual opponent.", range: 4, consistency: 5, checkout: 5, composure: 5 },
  { id: "scorer", name: "Scorer", blurb: "Heavy scoring, shaky on the doubles.", range: 4, consistency: 8, checkout: 3, composure: 5 },
  { id: "finisher", name: "Finisher", blurb: "Scrappy scoring, clinical out-shots.", range: 6, consistency: 4, checkout: 8, composure: 6 },
  { id: "rollercoaster", name: "Rollercoaster", blurb: "Just can't find a rhythm.", range: 10, consistency: 2, checkout: 5, composure: 5 },
  { id: "icecold", name: "Ice Cold", blurb: "Tight, composed, and raises their game when you're ahead.", range: 3, consistency: 8, checkout: 7, composure: 9 },
  { id: "bottler", name: "Bottler", blurb: "Talented, but crumbles under pressure.", range: 6, consistency: 5, checkout: 4, composure: 1 },
];

export const DIALS = ["range", "consistency", "checkout", "composure"];

export function defaultProfile() {
  const p = PRESETS[0];
  return { preset: p.id, target: 60, range: p.range, consistency: p.consistency, checkout: p.checkout, composure: p.composure, matchForm: false };
}

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

export function cleanProfile(p) {
  const d = defaultProfile();
  const out = {
    target: clampInt(p?.target, TARGET_MIN, TARGET_MAX, d.target),
    range: clampInt(p?.range, 0, RANGE_MAX, d.range),
    consistency: clampInt(p?.consistency, 1, 10, d.consistency),
    checkout: clampInt(p?.checkout, 1, 10, d.checkout),
    composure: clampInt(p?.composure, 1, 10, d.composure),
    matchForm: Boolean(p?.matchForm),
  };
  out.preset = matchingPreset(out)?.id ?? "custom";
  return out;
}

export function matchingPreset(p) {
  return PRESETS.find((pr) => DIALS.every((k) => pr[k] === p[k])) ?? null;
}

export function applyPreset(profile, presetId) {
  const pr = PRESETS.find((x) => x.id === presetId);
  if (!pr) return cleanProfile(profile);
  return cleanProfile({ ...profile, range: pr.range, consistency: pr.consistency, checkout: pr.checkout, composure: pr.composure });
}

export function presetName(profile) {
  return PRESETS.find((p) => p.id === profile.preset)?.name ?? "Custom";
}

export function describeProfile(profile) {
  return `${profile.target} average, ${presetName(profile)}`;
}

// "Match my form": a couple of points above your recent average, so it's always a fight.
export function formTarget(recentAverage) {
  if (recentAverage === null || recentAverage === undefined || !Number.isFinite(recentAverage)) return null;
  return clampInt(recentAverage + 2, TARGET_MIN, TARGET_MAX, 60);
}
