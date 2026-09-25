// services/cloud.js
// The shared library's backend: Google sign-in and Firestore, from the same free
// Firebase project as Reech Darts. Nothing loads until it's needed, and the app
// works without it (everything on this device).
//
// Firestore:
//   cs2/access                      { admins: [emails], contributors: [emails] }
//   cs2Lineups/{id}                 every shared lineup (anyone can read)
//   cs2Callouts/{id}                callouts added by contributors
//   users/{uid}/cs2Favourites/{id}  your favourites (only you)
//
// ?fakecloud (&fakeuser=dave) swaps in a stand-in for testing, kept in this browser.

import { firebaseConfig } from "../config/firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
let backendPromise = null;

function wantsFake() {
  try {
    if (new URLSearchParams(location.search).has("fakecloud")) sessionStorage.setItem("reechCs2:fakecloud", "1");
    return sessionStorage.getItem("reechCs2:fakecloud") === "1";
  } catch {
    return false;
  }
}

export const cloudAvailable = () => Boolean(firebaseConfig) || wantsFake();

export function getCloud() {
  if (backendPromise) return backendPromise;
  backendPromise = (async () => {
    if (wantsFake()) return createFake();
    if (!firebaseConfig) return null;
    try {
      return await createFirebase(firebaseConfig);
    } catch (err) {
      console.warn("Firebase couldn't load, carrying on offline", err);
      backendPromise = null;
      return null;
    }
  })();
  return backendPromise;
}

const plain = (x) => JSON.parse(JSON.stringify(x));
const toUser = (u) => (u ? { uid: u.uid, name: u.displayName || "", email: (u.email || "").toLowerCase(), photoURL: u.photoURL || "" } : null);

async function createFirebase(config) {
  const [{ initializeApp }, a, f] = await Promise.all([import(`${SDK}firebase-app.js`), import(`${SDK}firebase-auth.js`), import(`${SDK}firebase-firestore.js`)]);
  const app = initializeApp(config);
  const auth = a.getAuth(app);
  const db = f.getFirestore(app);
  const provider = new a.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  a.getRedirectResult(auth).catch(() => {});
  const col = (...p) => f.collection(db, ...p);
  const ref = (...p) => f.doc(db, ...p);
  const all = async (...p) => (await f.getDocs(col(...p))).docs.map((d) => ({ id: d.id, ...d.data() }));
  return {
    kind: "firebase",
    onUser: (cb) => a.onAuthStateChanged(auth, (u) => cb(toUser(u))),
    async signIn() {
      try {
        await a.signInWithPopup(auth, provider);
      } catch (err) {
        const code = err?.code || "";
        if (code.includes("popup-blocked") || code.includes("operation-not-supported")) return a.signInWithRedirect(auth, provider);
        if (code.includes("popup-closed") || code.includes("cancelled-popup")) return;
        throw err;
      }
    },
    signOut: () => a.signOut(auth),
    async getAccess() {
      const s = await f.getDoc(ref("cs2", "access"));
      return s.exists() ? s.data() : null;
    },
    setAccess: (data) => f.setDoc(ref("cs2", "access"), plain(data)),
    listLineups: () => all("cs2Lineups"),
    saveLineup: (rec) => f.setDoc(ref("cs2Lineups", rec.id), plain(rec)),
    deleteLineup: (id) => f.deleteDoc(ref("cs2Lineups", id)),
    listCallouts: () => all("cs2Callouts"),
    addCallout: (rec) => f.setDoc(ref("cs2Callouts", rec.id), plain(rec)),
    async listFavourites(uid) {
      return (await all("users", uid, "cs2Favourites")).map((d) => d.id);
    },
    setFavourite: (uid, id, on) => (on ? f.setDoc(ref("users", uid, "cs2Favourites", id), { at: Date.now() }) : f.deleteDoc(ref("users", uid, "cs2Favourites", id))),
    async getPrefs(uid) {
      const s = await f.getDoc(ref("users", uid, "cs2Prefs", "playback"));
      return s.exists() ? s.data() : null;
    },
    setPrefs: (uid, data) => f.setDoc(ref("users", uid, "cs2Prefs", "playback"), plain(data)),
    async getSpawns(id) {
      const s = await f.getDoc(ref("cs2Spawns", id));
      return s.exists() ? s.data() : null;
    },
    saveSpawns: (id, data) => f.setDoc(ref("cs2Spawns", id), plain(data)),
    async getLabels(map) {
      const s = await f.getDoc(ref("cs2Labels", map));
      return s.exists() ? s.data() : null;
    },
    saveLabels: (map, data) => f.setDoc(ref("cs2Labels", map), plain(data)),
  };
}

// ---------------------------------------------------------------- the stand-in (testing only)
const FAKE_KEY = "reechCs2:fakecloud-db";
const FAKE_USERS = {
  reech: { uid: "fake-reech", name: "Reech Test", email: "reech@example.com", photoURL: "" },
  dave: { uid: "fake-dave", name: "Dave Test", email: "dave@example.com", photoURL: "" },
};
function createFake() {
  const read = () => ({ access: null, lineups: {}, callouts: {}, favs: {}, signedIn: {}, ...JSON.parse(localStorage.getItem(FAKE_KEY) || "{}") });
  const write = (d) => localStorage.setItem(FAKE_KEY, JSON.stringify(d));
  const who = FAKE_USERS[new URLSearchParams(location.search).get("fakeuser") || sessionStorage.getItem("reechCs2:fakeuser") || "reech"] ?? FAKE_USERS.reech;
  try {
    const q = new URLSearchParams(location.search).get("fakeuser");
    if (q) sessionStorage.setItem("reechCs2:fakeuser", q);
  } catch {
    /* fine */
  }
  const users = new Set();
  const me = () => (read().signedIn[who.uid] ? who : null);
  const later = (v) => new Promise((r) => setTimeout(() => r(v), 30));
  const canAdd = () => {
    const d = read();
    const u = me();
    return Boolean(u && d.access && [...d.access.admins, ...d.access.contributors].includes(u.email));
  };
  const deny = () => Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
  return {
    kind: "fake",
    onUser(cb) {
      users.add(cb);
      setTimeout(() => cb(me()), 0);
    },
    async signIn() {
      const d = read();
      d.signedIn[who.uid] = true;
      write(d);
      users.forEach((cb) => cb(who));
    },
    async signOut() {
      const d = read();
      d.signedIn[who.uid] = false;
      write(d);
      users.forEach((cb) => cb(null));
    },
    getAccess: () => later(read().access),
    setAccess(data) {
      const d = read();
      // Like the rules: only the admin (the first person to set it up here) can change it.
      if (d.access && !d.access.admins.includes(me()?.email)) return deny();
      d.access = plain(data);
      write(d);
      return later();
    },
    listLineups: () => later(Object.values(read().lineups)),
    saveLineup(rec) {
      if (!canAdd()) return deny();
      const d = read();
      d.lineups[rec.id] = plain(rec);
      write(d);
      return later();
    },
    deleteLineup(id) {
      if (!canAdd()) return deny();
      const d = read();
      delete d.lineups[id];
      write(d);
      return later();
    },
    listCallouts: () => later(Object.values(read().callouts)),
    addCallout(rec) {
      if (!canAdd()) return deny();
      const d = read();
      d.callouts[rec.id] = plain(rec);
      write(d);
      return later();
    },
    listFavourites: (uid) => later(Object.keys(read().favs[uid] || {})),
    setFavourite(uid, id, on) {
      const d = read();
      d.favs[uid] ??= {};
      if (on) d.favs[uid][id] = Date.now();
      else delete d.favs[uid][id];
      write(d);
      return later();
    },
    getPrefs: (uid) => later(read().prefs?.[uid] ?? null),
    getSpawns: (id) => later(read().spawns?.[id] ?? null),
    getLabels: (map) => later(read().labels?.[map] ?? null),
    saveLabels(map, data) {
      if (!canAdd()) return deny();
      const d = read();
      d.labels ??= {};
      d.labels[map] = plain(data);
      write(d);
      return later();
    },
    saveSpawns(id, data) {
      if (!canAdd()) return deny();
      const d = read();
      d.spawns ??= {};
      d.spawns[id] = plain(data);
      write(d);
      return later();
    },
    setPrefs(uid, data) {
      const d = read();
      d.prefs ??= {};
      d.prefs[uid] = plain(data);
      write(d);
      return later();
    },
  };
}
