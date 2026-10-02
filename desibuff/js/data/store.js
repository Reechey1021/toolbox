// data/store.js
// Saves everything in IndexedDB (not localStorage): a long ride history can be
// several megabytes, and localStorage's ~5 MB is shared with every other tool
// on the site. Asks the browser to keep the data even when space runs low.

const DB = "desibuff";
const STORE = "kv";
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

export async function get(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function set(key, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function del(key) {
  const db = await open();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Writes are queued per key so a slow write can't land after a newer one. */
const queues = new Map();
export function save(key, value) {
  // copy now: the lists keep changing while the write is queued
  const copy = JSON.parse(JSON.stringify(value));
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(() => set(key, copy)).catch((e) => console.error("save failed", key, e));
  queues.set(key, next);
  return next;
}

export async function loadAll() {
  const [courses, freeroamSessions, courseRuns, settings, activeRide, preImport] = await Promise.all(
    ["courses", "freeroamSessions", "courseRuns", "settings", "activeRide", "preImport"].map((k) => get(k).catch(() => undefined)),
  );
  return { courses, freeroamSessions, courseRuns, settings, activeRide, preImport };
}

export async function askPersistent() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* not supported */ }
}
