// services/labels.js
// Callouts drawn on the maps: community names ("Tetris", "Sandwich") placed where
// they are, as text. Built up over time with the callout builder on each map.
//
//   shared   cs2Labels/{map}   { map, labels: [{ id, text, x, y, level }] }
//   device   the same, in this browser (before sharing, or for non-contributors)
//   default  "T Spawn" and "CT Spawn", placed exactly from the spawn data
// Shown or hidden everywhere at once (off to begin with): the toolbar's Show
// callouts, or "lineup, show callouts".

import { prefs, newId } from "./store.js";
import { getCloud, cloudAvailable } from "./cloud.js";
import { accountState } from "./account.js";
import { preferences, setPreferences, onPlayback } from "./playback.js";
import { SPAWNS } from "../data/spawns.js";
import { mapById } from "../data/maps.js";
import { worldToRadar, levelFor } from "../data/lineups.js";

const cache = new Map();
const listeners = new Set();
export function onLabels(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (ev) => listeners.forEach((fn) => fn(ev));

// Shown or hidden, for every map: one of your preferences (it follows your account).
export const showCallouts = () => preferences().showCallouts;
export function setShowCallouts(v) {
  setPreferences({ showCallouts: Boolean(v) });
  emit({ type: "visible", visible: Boolean(v) });
}
// Changed on another device (or the profile page): follow it.
let lastShown = showCallouts();
onPlayback((p) => {
  if (p.showCallouts === lastShown) return;
  lastShown = p.showCallouts;
  emit({ type: "visible", visible: p.showCallouts });
});

// "T Spawn" and "CT Spawn" at the middle of each side's spawns.
export function defaultLabels(mapId) {
  const map = mapById(mapId);
  const out = [];
  for (const side of ["T", "CT"]) {
    const pts = SPAWNS[mapId]?.[side] ?? [];
    if (!pts.length) continue;
    const x = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    out.push({ id: `default-${side}`, text: `${side} Spawn`, ...worldToRadar(map, { x, y }), level: levelFor(map, pts[0][2]) });
  }
  return out;
}

export async function getLabels(mapId) {
  if (cache.has(mapId)) return cache.get(mapId);
  let list = null;
  if (cloudAvailable()) {
    const cloud = await getCloud();
    const doc = cloud ? await cloud.getLabels(mapId).catch(() => null) : null;
    if (doc?.labels) list = doc.labels;
  }
  list ??= prefs.get(`labels:${mapId}`, null) ?? defaultLabels(mapId);
  cache.set(mapId, list);
  return list;
}

// Who can place callouts: contributors (shared), or anyone when accounts are off.
export const labelsEditable = () => !cloudAvailable() || accountState().status === "offline" || accountState().contributor;
const shared = () => cloudAvailable() && accountState().status !== "offline" && accountState().contributor;

async function save(mapId, labels) {
  const clean = labels.map((l) => ({ id: l.id, text: String(l.text).trim().slice(0, 40), x: l.x, y: l.y, level: l.level || "upper" })).filter((l) => l.text);
  if (shared()) await (await getCloud()).saveLabels(mapId, { map: mapId, labels: clean });
  else prefs.set(`labels:${mapId}`, clean);
  cache.set(mapId, clean);
  emit({ type: "changed", map: mapId, labels: clean });
  return clean;
}

export async function addLabel(mapId, { text, x, y, level = "upper" }) {
  return save(mapId, [...(await getLabels(mapId)), { id: newId("cl"), text, x, y, level }]);
}
export async function renameLabel(mapId, id, text) {
  return save(mapId, (await getLabels(mapId)).map((l) => (l.id === id ? { ...l, text } : l)));
}
export async function moveLabel(mapId, id, pos) {
  return save(mapId, (await getLabels(mapId)).map((l) => (l.id === id ? { ...l, ...pos } : l)));
}
export async function deleteLabel(mapId, id) {
  return save(mapId, (await getLabels(mapId)).filter((l) => l.id !== id));
}
