// services/profile.js
// Who's using this device.
//
// Right now the owner is a local guest profile with a stable id. When Google
// sign-in arrives, the owner gains `account` details and every match already
// played under the local id can be linked to it. Nothing else in the app reads
// accounts directly: it just asks for the owner.

import { kv } from "./storage.js";
import { newId } from "../engine/match.js";

const OWNER_KEY = "owner";
const RECENT_KEY = "recentPlayers";
const MAX_RECENT = 12;

export function getOwner() {
  return kv.get(OWNER_KEY, null);
}

export function hasOwner() {
  const o = getOwner();
  return Boolean(o && o.id && o.name);
}

// Listeners for profile changes (the account syncs them to the cloud).
const listeners = new Set();
export function onOwnerChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function saveOwner({ name }) {
  const clean = cleanName(name);
  if (!clean) throw new Error("Enter a name");
  const existing = getOwner();
  if (existing) return saveOwnerFields({ name: clean });
  const owner = { id: newId("local"), name: clean, kind: "local", createdAt: Date.now(), updatedAt: Date.now(), account: null };
  kv.set(OWNER_KEY, owner);
  return owner;
}

// Update any owner fields. touch: this is a change the user made (it syncs, newest wins).
export function saveOwnerFields(fields, { touch = true } = {}) {
  const owner = { ...getOwner(), ...fields, ...(touch ? { updatedAt: Date.now() } : {}) };
  kv.set(OWNER_KEY, owner);
  if (touch) for (const fn of listeners) fn(owner);
  return owner;
}

// The owner as a match player. `call` is the caller recording for your name.
export function ownerAsPlayer() {
  const o = getOwner();
  if (!o) return null;
  return { id: o.id, name: o.name, owner: true, ...(o.callerName ? { call: o.callerName } : {}) };
}

export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// Guests get an id from their name, so "Dave" is the same Dave every time.
export function guestPlayer(name) {
  const clean = cleanName(name);
  return { id: `guest:${clean.toLowerCase()}`, name: clean };
}

export function cleanName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
}

// Recently used guest names, most recent first.
export function recentPlayers() {
  return kv.get(RECENT_KEY, []);
}

export function rememberPlayers(names) {
  const owner = getOwner();
  const ownerName = owner?.name?.toLowerCase();
  const list = recentPlayers().filter((n) => !names.some((m) => m.toLowerCase() === n.toLowerCase()));
  const fresh = names.filter((n) => n && n.toLowerCase() !== ownerName);
  kv.set(RECENT_KEY, [...fresh, ...list].slice(0, MAX_RECENT));
}

export function forgetRecentPlayer(name) {
  kv.set(
    RECENT_KEY,
    recentPlayers().filter((n) => n.toLowerCase() !== String(name).toLowerCase())
  );
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Late one";
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}
