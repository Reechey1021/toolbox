// services/library.js
// The one place screens get lineups from. Two sources, merged:
//   shared   the Firestore library everyone sees (once you've set it up)
//   device   lineups saved in this browser (before sharing existed, or when clip
//            hosting isn't set up yet)
// Saving goes to the shared library when you're a contributor and clip hosting is
// ready; otherwise to this device, so nothing is ever lost.

import * as store from "./store.js";
import { getCloud, cloudAvailable } from "./cloud.js";
import { accountState } from "./account.js";
import { uploadClip, clipHostReady, cachedClipUrl, mediaOf } from "./clips.js";
import { permissionsFor } from "../data/lineups.js";
import { displayNickname } from "./playback.js";

let shared = null; // cached list for this visit
const listeners = new Set();
export function onLibraryChange(fn) {
  listeners.add(fn);
  const off = store.onLibraryChange(fn);
  return () => (listeners.delete(fn), off());
}
const changed = () => listeners.forEach((fn) => fn());

async function sharedLineups() {
  if (!cloudAvailable()) return [];
  if (shared) return shared;
  const cloud = await getCloud();
  shared = cloud ? (await cloud.listLineups().catch(() => [])).map((l) => ({ ...l, source: "shared" })) : [];
  return shared;
}
export function refreshShared() {
  shared = null;
  changed();
}

export async function listLineups(map = null) {
  const [s, local] = await Promise.all([sharedLineups(), store.listLineups()]);
  const all = [...s, ...local.map((l) => ({ ...l, source: "device" }))];
  return (map ? all.filter((l) => l.map === map) : all).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function getLineup(id) {
  return (await listLineups()).find((l) => l.id === id) ?? null;
}

// Can you add to the shared library right now? { shared: bool, reason }
export function saveTarget() {
  const a = accountState();
  if (!cloudAvailable() || a.status === "offline") return { shared: false, reason: "" };
  if (!a.contributor) return { shared: false, reason: "not-contributor" };
  if (!clipHostReady()) return { shared: false, reason: "no-clip-host" };
  return { shared: true, reason: "" };
}

// l: the lineup; file: a new clip (or null to keep the current one).
// onProgress(0..1) while a clip uploads. Resolves to the saved lineup.
export async function saveLineup(l, { file = null, onProgress } = {}) {
  const target = saveTarget();
  const { source, ...rec } = l;
  if (target.shared) {
    const a = accountState();
    let clip = rec.clip;
    if (file) clip = { kind: "url", url: await uploadClip(file, onProgress), media: mediaOf(file) };
    else if (clip?.kind === "local") {
      // A device clip moving to the shared library: upload it first.
      const blob = await store.clipBlob(clip.id);
      if (blob) clip = { kind: "url", url: await uploadClip(blob, onProgress), media: clip.media ?? mediaOf(blob) };
    }
    const now = Date.now();
    const out = { ...rec, id: rec.id || store.newId("l"), clip, authorUid: rec.authorUid || a.user.uid, author: rec.author || displayNickname() || a.user.name, createdAt: rec.createdAt || now, updatedAt: now };
    await (await getCloud()).saveLineup(out);
    if (source === "device") await store.deleteLineup(rec.id); // it's shared now
    refreshShared();
    return { ...out, source: "shared" };
  }
  if (file) rec.clip = { ...(await store.putClip(file)), media: mediaOf(file) };
  const saved = await store.saveLineup(rec);
  return { ...saved, source: "device" };
}

export async function deleteLineup(l) {
  if (l.source === "shared") {
    await (await getCloud()).deleteLineup(l.id);
    return refreshShared();
  }
  await store.deleteLineup(l.id);
}

// Can you edit or delete this one? Only your own; the admin can also remove (not edit).
export const canEdit = (l) => permissionsFor(l, accountState()).edit;
export const canDelete = (l) => permissionsFor(l, accountState()).delete;

// Something the player can show: shared clips come from the cache (downloaded once).
export const clipUrl = (clip) => (clip?.kind === "url" ? cachedClipUrl(clip.url) : store.clipUrl(clip));

// Callouts: the built-in list, plus ones contributors added (shared) or you added (device).
export async function customCallouts(map) {
  const local = await store.customCallouts(map);
  if (!cloudAvailable()) return local;
  const cloud = await getCloud();
  const s = cloud ? (await cloud.listCallouts().catch(() => [])).filter((c) => c.map === map) : [];
  return [...s, ...local];
}
export async function addCallout(map, name, author) {
  if (saveTarget().shared) {
    const rec = { id: store.newId("co"), map, name: String(name).trim().slice(0, 40), author: author || "" };
    await (await getCloud()).addCallout(rec);
    return rec;
  }
  return store.addCallout(map, name, author);
}

// Every device lineup, published to the shared library (clips uploaded as it goes).
export async function publishDeviceLineups(onEach = () => {}) {
  const local = await store.listLineups();
  let done = 0;
  for (const l of local) {
    await saveLineup({ ...l, source: "device" });
    onEach(++done, local.length);
  }
  return done;
}
