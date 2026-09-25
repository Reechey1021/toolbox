// services/playback.js
// How clips play: speed, magnification, and how many times before closing.
// Kept on this device, and in your account when you're signed in (a tiny
// private document), so it follows you. Signing in on a new device picks up
// your account's settings; the newest change wins after that.

import { prefs } from "./store.js";
import { getCloud } from "./cloud.js";
import { onAccount, accountState } from "./account.js";
import { cleanPlayback } from "../data/lineups.js";

let current = cleanPlayback(prefs.get("playback", {}));
let saveTimer = null;
const listeners = new Set();
export const playback = () => current;
export function onPlayback(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(current));

// Change any of { speed, zoom, autoClose }. Saved here straight away, to your account shortly after.
export function setPlayback(patch) {
  current = cleanPlayback({ ...current, ...patch, updatedAt: Date.now() });
  prefs.set("playback", current);
  emit();
  const uid = accountState().user?.uid;
  if (!uid) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => (await getCloud())?.setPrefs(uid, current).catch(() => {}), 600);
}

export const savedWhere = () => (accountState().user ? "account" : "device");

// Everything here is your preferences, not just playback.
export const preferences = playback;
export const setPreferences = setPlayback;

// The name on your lineups: your nickname, else your Google first name.
export function displayNickname() {
  return current.nickname || (accountState().user?.name || "").split(" ")[0] || "";
}

// Signing in: your account's settings, unless this device's are newer.
let lastUid = null;
onAccount(async (a) => {
  const uid = a.user?.uid ?? null;
  if (uid === lastUid) return;
  lastUid = uid;
  if (!uid) return;
  const cloud = await getCloud();
  const remote = await cloud?.getPrefs(uid).catch(() => null);
  if (remote && (remote.updatedAt ?? 0) >= (current.updatedAt ?? 0)) {
    current = cleanPlayback(remote);
    prefs.set("playback", current);
    emit();
  } else if (cloud && current.updatedAt) cloud.setPrefs(uid, current).catch(() => {});
});
