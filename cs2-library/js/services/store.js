// services/store.js
// Where the library lives. For now: this browser (IndexedDB), including the
// clips you upload. Later a shared version (Firestore for the details, a video
// host for the clips) slots in behind these same functions.
//
//   lineups   one record per lineup (see data/lineups.js)
//   clips     { id, blob, type, name, size }
//   callouts  callouts you've added: { id, map, name, author }

const DB = "reech-cs2-library";
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("lineups")) db.createObjectStore("lineups", { keyPath: "id" }).createIndex("map", "map");
      if (!db.objectStoreNames.contains("clips")) db.createObjectStore("clips", { keyPath: "id" });
      if (!db.objectStoreNames.contains("callouts")) db.createObjectStore("callouts", { keyPath: "id" }).createIndex("map", "map");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const out = fn(s);
        t.oncomplete = () => resolve(out && "result" in out ? out.result : out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

const listeners = new Set();
export function onLibraryChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => fn());

export const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ---------------------------------------------------------------- lineups

export async function listLineups(map = null) {
  const all = await tx("lineups", "readonly", (s) => s.getAll());
  return (map ? all.filter((l) => l.map === map) : all).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function getLineup(id) {
  return tx("lineups", "readonly", (s) => s.get(id));
}

export async function saveLineup(l) {
  const now = Date.now();
  const rec = { ...l, id: l.id || newId("l"), createdAt: l.createdAt || now, updatedAt: now };
  await tx("lineups", "readwrite", (s) => s.put(rec));
  changed();
  return rec;
}

export async function deleteLineup(id) {
  const l = await getLineup(id);
  await tx("lineups", "readwrite", (s) => s.delete(id));
  if (l?.clip?.kind === "local") await tx("clips", "readwrite", (s) => s.delete(l.clip.id));
  changed();
}

// ---------------------------------------------------------------- clips

export async function putClip(file) {
  const id = newId("c");
  await tx("clips", "readwrite", (s) => s.put({ id, blob: file, type: file.type, name: file.name, size: file.size }));
  return { kind: "local", id };
}

// The raw file of a device clip (to upload it when a lineup is shared).
export async function clipBlob(id) {
  const rec = await tx("clips", "readonly", (s) => s.get(id));
  return rec?.blob ?? null;
}

// A URL a <video> can play: a blob URL for uploaded clips, or the clip's own URL.
const urlCache = new Map();
export async function clipUrl(clip) {
  if (!clip) return null;
  if (clip.kind === "url") return clip.url;
  if (urlCache.has(clip.id)) return urlCache.get(clip.id);
  const rec = await tx("clips", "readonly", (s) => s.get(clip.id));
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(clip.id, url);
  return url;
}

// ---------------------------------------------------------------- callouts

export async function customCallouts(map) {
  const all = await tx("callouts", "readonly", (s) => s.getAll());
  return all.filter((c) => c.map === map);
}

export async function addCallout(map, name, author) {
  const clean = String(name || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) return null;
  const rec = { id: newId("co"), map, name: clean, author: author || "" };
  await tx("callouts", "readwrite", (s) => s.put(rec));
  changed();
  return rec;
}

// ---------------------------------------------------------------- preferences

const PREF = "reechCs2:";
export const prefs = {
  get: (k, fallback = null) => {
    try {
      const v = localStorage.getItem(PREF + k);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(PREF + k, JSON.stringify(v));
    } catch {
      /* private mode: fine */
    }
  },
};
