// services/storage.js
// The only module that touches browser storage. Screens and the engine never do.
//
//   kv       small things (profile, settings, the match in progress) in localStorage
//   matches  finished matches in IndexedDB, falling back to localStorage if needed
//
// When Google sign-in arrives, this is where cloud sync plugs in: the rest of the
// app keeps calling the same functions and doesn't need to know.

// In fake-cloud testing each test person (?fakeuser=dave) gets their own device
// storage, so two tabs can be two phones sharing one pretend cloud.
// ?fakedevice=phone1 picks the pretend phone (so different people can sign in on it).
const FAKE_PERSON = (() => {
  try {
    const q = new URLSearchParams(location.search);
    if (!(sessionStorage.getItem("reechDarts:fakecloud") === "1" || q.has("fakecloud"))) return "";
    if (q.get("fakedevice")) sessionStorage.setItem("reechDarts:fakedevice", q.get("fakedevice"));
    return sessionStorage.getItem("reechDarts:fakedevice") || q.get("fakeuser") || sessionStorage.getItem("reechDarts:fakeuser") || "";
  } catch {
    return "";
  }
})();
const NS = FAKE_PERSON ? `reechDarts:${FAKE_PERSON}:` : "reechDarts:";
const DB_NAME = FAKE_PERSON ? `reech-darts-${FAKE_PERSON}` : "reech-darts";
const DB_VERSION = 1;
const STORE = "matches";

// ---------------------------------------------------------------------------
// Key-value (synchronous, small data)
// ---------------------------------------------------------------------------

export const kv = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn("Couldn't save", key, err);
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(NS + key);
    } catch {
      /* nothing to do */
    }
  },
  keys() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NS)) out.push(k.slice(NS.length));
      }
    } catch {
      /* storage unavailable */
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Finished matches (asynchronous, can grow large)
// ---------------------------------------------------------------------------

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!("indexedDB" in globalThis)) return resolve(null);
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("finishedAt", "finishedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store, (r) => (result = r))).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// localStorage fallback for browsers without IndexedDB (rare, but private modes exist).
const FALLBACK_KEY = "matchesFallback";
const fallback = {
  all: () => kv.get(FALLBACK_KEY, []),
  save: (list) => kv.set(FALLBACK_KEY, list),
};

// Listeners for match changes: { type: "put" | "remove", record?, id }.
// The account uses these to mirror your history to the cloud.
const matchListeners = new Set();
export function onMatchesChange(fn) {
  matchListeners.add(fn);
  return () => matchListeners.delete(fn);
}
const notify = (change, silent) => {
  if (!silent) for (const fn of matchListeners) fn(change);
};

export const matches = {
  async list() {
    const db = await openDb();
    let list;
    if (!db) list = fallback.all();
    else {
      list = await tx(db, "readonly", (store, done) => {
        const req = store.getAll();
        req.onsuccess = () => done(req.result || []);
      });
    }
    return list.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  },

  async get(id) {
    const db = await openDb();
    if (!db) return fallback.all().find((m) => m.id === id) ?? null;
    return tx(db, "readonly", (store, done) => {
      const req = store.get(id);
      req.onsuccess = () => done(req.result ?? null);
    });
  },

  // silent: a sync write, don't tell the listeners (it would echo back to the cloud).
  async put(record, { silent = false } = {}) {
    const db = await openDb();
    if (!db) {
      const list = fallback.all().filter((m) => m.id !== record.id);
      list.push(record);
      fallback.save(list);
    } else {
      await tx(db, "readwrite", (store) => store.put(record));
    }
    notify({ type: "put", record, id: record.id }, silent);
    return record;
  },

  async remove(id, { silent = false } = {}) {
    const db = await openDb();
    if (!db) fallback.save(fallback.all().filter((m) => m.id !== id));
    else await tx(db, "readwrite", (store) => store.delete(id));
    notify({ type: "remove", id }, silent);
  },

  async clear() {
    const db = await openDb();
    if (!db) return fallback.save([]);
    await tx(db, "readwrite", (store) => store.clear());
  },
};

// ---------------------------------------------------------------------------
// Backup: everything in one JSON file
// ---------------------------------------------------------------------------

export const BACKUP_FORMAT = "reech-darts-backup";

export async function exportAll() {
  const data = {};
  for (const k of kv.keys()) if (k !== FALLBACK_KEY) data[k] = kv.get(k);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    kv: data,
    matches: await matches.list(),
  };
}

// Merges a backup in. Matches are merged by id; profile and settings are only
// replaced when asked, so importing never silently overwrites who you are.
export async function importAll(backup, { replaceProfile = false } = {}) {
  if (!backup || backup.format !== BACKUP_FORMAT) throw new Error("That file isn't a Reech Darts backup");
  let added = 0;
  const existing = new Set((await matches.list()).map((m) => m.id));
  for (const m of backup.matches || []) {
    if (!m?.id || !m?.cfg || !Array.isArray(m.events)) continue;
    if (!existing.has(m.id)) added++;
    await matches.put(m);
  }
  if (replaceProfile && backup.kv) {
    for (const [k, v] of Object.entries(backup.kv)) kv.set(k, v);
  }
  return { added };
}

export async function wipeEverything() {
  await matches.clear();
  for (const k of kv.keys()) kv.remove(k);
}
