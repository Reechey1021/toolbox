// data/lineups.js
// Pure helpers for lineups: reading getpos, placing it on the radar, naming,
// filtering. No storage, no DOM, so it's all testable.
//
// A lineup:
//   { id, map, name, type, side, throw, origin, dest, purposes: [], author, notes,
//     from: { x, y }, to: { x, y }, arc: [{ x, y }],   positions on the radar, 0 to 1
//     world: { x, y, z, pitch, yaw } | null,          from getpos, if pasted
//     clip: { kind: "local", id } | { kind: "url", url } | null,
//     createdAt, updatedAt }

import { RADAR_SIZE } from "./maps.js";
import { nameOf, TYPES, SIDES, PURPOSES, THROW_GROUPS, LEGACY_THROWS } from "./tags.js";
import { WAKE_WORDS } from "./voice.js";

// "setpos 1136.00 -1215.96 -103.96;setang 3.60 -139.45 0.00" (CS2's getpos output).
// Tolerant of commas, extra spaces and setpos_exact.
export function parseGetpos(text) {
  const t = String(text || "").replace(/,/g, " ");
  const pos = /setpos(?:_exact)?\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i.exec(t);
  if (!pos) return null;
  const ang = /setang\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i.exec(t);
  return {
    x: Number(pos[1]),
    y: Number(pos[2]),
    z: Number(pos[3]),
    pitch: ang ? Number(ang[1]) : null,
    yaw: ang ? Number(ang[2]) : null,
  };
}

// Game coordinates to a radar position (0 to 1), using the map's overview numbers.
export function worldToRadar(map, world) {
  const o = map.overview;
  return { x: (world.x - o.x) / o.scale / RADAR_SIZE, y: (o.y - world.y) / o.scale / RADAR_SIZE };
}

export function radarToWorld(map, pos) {
  const o = map.overview;
  return { x: o.x + pos.x * RADAR_SIZE * o.scale, y: o.y - pos.y * RADAR_SIZE * o.scale };
}

// Nuke and Vertigo have a lower level with its own radar.
export function levelFor(map, z) {
  if (map.overview.lowerBelowZ === undefined || z === null || z === undefined) return "upper";
  return z < map.overview.lowerBelowZ ? "lower" : "upper";
}

export const onRadar = (p) => Boolean(p) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

// "Window smoke from T Spawn"
export function suggestName({ type, origin, dest, spawn = null }) {
  const t = { smoke: "smoke", flash: "flash", molotov: "molotov", he: "HE" }[type] ?? "";
  if (!dest && !origin && !spawn) return "";
  const from = spawn ? `spawn ${spawn}` : origin;
  return [dest, t].filter(Boolean).join(" ") + (from ? ` from ${from}` : "");
}

// How a lineup's thrown, as { type: [], speed: [], tap: [] }: its tags, or its old
// single "throw" translated (older lineups keep working without being re-saved).
export function throwTags(l) {
  const t = l?.throws ?? LEGACY_THROWS[l?.throw] ?? {};
  return Object.fromEntries(THROW_GROUPS.map((g) => [g.id, (t[g.id] ?? []).filter((id) => g.tags.some((x) => x.id === id))]));
}

// "Left click · Run · W + Jump" (empty when nothing's tagged).
export function throwLabel(l) {
  const t = throwTags(l);
  const names = (g) => t[g.id].map((id) => g.tags.find((x) => x.id === id).name);
  return THROW_GROUPS.map((g) => (g.id === "tap" ? names(g).join(" + ") : names(g).join(" / "))).filter(Boolean).join(" \u00b7 ");
}

// The tags as short labels, for tooltips and the player.
export function tagLabels(l) {
  return [nameOf(TYPES, l.type), nameOf(SIDES, l.side) === "Both" ? "T and CT" : nameOf(SIDES, l.side), throwLabel(l), ...(l.purposes || []).map((p) => nameOf(PURPOSES, p))].filter(Boolean);
}

// filters: { types: Set, sides: Set of "T" / "CT" (or side: "all" | "T" | "CT"),
//            authors: Set of names, or null for everyone (or author: "all" | name) }
// A lineup for both sides shows when either side is picked.
export function filterLineups(list, { types, side = "all", sides = null, author = "all", authors = null } = {}) {
  const sideSet = sides ?? (side === "all" ? new Set(["T", "CT"]) : new Set([side]));
  const authorOk = (a) => (authors ? authors.has(a) : author === "all" || a === author);
  return list.filter(
    (l) =>
      (!types || types.has(l.type)) &&
      (l.side === "both" ? sideSet.size > 0 : sideSet.has(l.side)) &&
      authorOk(l.author)
  );
}

export function authorsOf(list) {
  return [...new Set(list.map((l) => l.author).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// What's missing before a lineup can be saved (empty list = ready).
export function missingFor(l) {
  const out = [];
  if (!l.map) out.push("a map");
  if (!l.type) out.push("the grenade type");
  if (!l.side) out.push("the side");
  if (!l.origin) out.push("where it's thrown from (callout)");
  if (!l.dest) out.push("where it lands (callout)");
  if (!onRadar(l.from)) out.push("the throw spot on the map");
  if (!onRadar(l.to)) out.push("the landing spot on the map");
  return out;
}

// Who can do what with a lineup.
//   Lineups on this device: they're yours.
//   Shared: only the person who added it can edit it. They can delete it, and so
//   can the admin (to clean up junk), but nobody else.
// account: { user: { uid }, admin }
export function permissionsFor(l, account) {
  if (!l || l.source !== "shared") return { edit: true, delete: true };
  const mine = Boolean(account?.user && l.authorUid === account.user.uid);
  return { edit: mine, delete: mine || Boolean(account?.admin) };
}

// How many times a clip plays before closing: 1 to 5, or 0 to keep playing.
export const AUTO_CLOSE = [1, 2, 3, 4, 5, 0];
export function cleanPlayback(p = {}) {
  const speed = [1, 0.5, 0.25].includes(Number(p.speed)) ? Number(p.speed) : 1;
  const zoom = Math.max(2, Math.min(5, Math.round(Number(p.zoom) || 3)));
  const autoClose = AUTO_CLOSE.includes(Number(p.autoClose)) ? Number(p.autoClose) : 0;
  // Your nickname (the author on your lineups) and wake word live here too.
  const nickname = String(p.nickname || "").replace(/\s+/g, " ").trim().slice(0, 24);
  const wakeId = WAKE_WORDS.some((w) => w.id === p.wakeId) ? p.wakeId : "lineup";
  // Map filters that follow you: favourites only, and callouts shown (both off to begin with).
  const favsOnly = Boolean(p.favsOnly);
  const showCallouts = Boolean(p.showCallouts);
  return { speed, zoom, autoClose, nickname, wakeId, favsOnly, showCallouts, updatedAt: Number(p.updatedAt) || 0 };
}

// Lineups thrown from (or landing at) the same spot share one dot on the map.
// Positions within `near` of each other (0 to 1 across the radar) are one spot.
export function groupBySpot(list, view = "from", near = 0.012) {
  const groups = [];
  for (const l of list) {
    const pos = view === "from" ? l.from : l.to;
    const g = groups.find((x) => Math.hypot(x.pos.x - pos.x, x.pos.y - pos.y) < near);
    if (g) g.items.push(l);
    else groups.push({ pos, items: [l] });
  }
  return groups;
}

// How big a grenade's effect is, in game units (roughly): smoke ~144, molotov
// ~150 (the CT incendiary a touch smaller), HE damage 384. Flashes have no area.
export const AREA_UNITS = { smoke: 144, molotov: 150, he: 384 };
const RADAR = 1024;
// The radius on the map (in its 1000-wide drawing space), or 0 for none.
export function areaRadius(map, l) {
  const units = l.type === "molotov" && l.side === "CT" ? 137 : AREA_UNITS[l.type];
  if (!units || !map?.overview?.scale) return 0;
  return (units / map.overview.scale / RADAR) * 1000;
}
