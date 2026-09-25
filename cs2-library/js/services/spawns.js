// services/spawns.js
// Where you can spawn, per map and side, numbered 1, 2, 3... Instant smokes are
// thrown straight from a spawn, so "spawn 2 window smoke" needs everyone to agree
// which spawn is 2. Set once (stand on each spawn, getpos, paste) and shared.
//
//   shared   cs2Spawns/{map}_{side}  { map, side, spawns: [{ n, x, y, world }] }
//   device   the same, in this browser (before sharing, or for non-contributors)

import { prefs } from "./store.js";
import { getCloud, cloudAvailable } from "./cloud.js";
import { accountState } from "./account.js";
import { SPAWNS } from "../data/spawns.js";
import { mapById } from "../data/maps.js";
import { worldToRadar } from "../data/lineups.js";

// The built-in spawns (from the map files, via NadesDB), as radar positions.
export function builtInSpawns(map, side) {
  const m = mapById(map);
  return (SPAWNS[map]?.[side] ?? []).map(([x, y, z], i) => ({ n: i + 1, ...worldToRadar(m, { x, y }), world: { x, y, z, pitch: null, yaw: null } }));
}

const cache = new Map();
const listeners = new Set();
export function onSpawns(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const key = (map, side) => `${map}_${side}`;

export async function getSpawns(map, side) {
  if (!map || (side !== "T" && side !== "CT")) return [];
  const k = key(map, side);
  if (cache.has(k)) return cache.get(k);
  let list = null;
  if (cloudAvailable()) {
    const cloud = await getCloud();
    const doc = cloud ? await cloud.getSpawns(k).catch(() => null) : null;
    if (doc?.spawns?.length) list = doc.spawns;
  }
  const mine = prefs.get(`spawns:${k}`, []);
  list ??= mine.length ? mine : builtInSpawns(map, side);
  cache.set(k, list);
  return list;
}

// Shared when you can add lineups; this device otherwise.
export const spawnsShared = () => cloudAvailable() && accountState().contributor;

export async function saveSpawns(map, side, spawns) {
  const k = key(map, side);
  const list = spawns.map((s, i) => ({ n: i + 1, x: s.x, y: s.y, ...(s.world ? { world: s.world } : {}) }));
  if (spawnsShared()) await (await getCloud()).saveSpawns(k, { map, side, spawns: list });
  else prefs.set(`spawns:${k}`, list);
  cache.set(k, list);
  listeners.forEach((fn) => fn({ map, side, spawns: list }));
  return list;
}
