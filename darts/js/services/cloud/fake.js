// services/cloud/fake.js
// A stand-in backend for testing and previews, switched on with ?fakecloud in
// the address (add &fakeuser=dave to be someone else). It behaves like Firebase,
// including the rule that only friends can see your profile, but keeps its
// "cloud" in this browser's storage. Never used unless you ask for it.

const KEY = "reechDarts:fakecloud";
const read = () => {
  const db = JSON.parse(localStorage.getItem(KEY) || "{}");
  db.users ??= {};
  db.codes ??= {};
  db.profiles ??= {};
  db.friendships ??= {};
  db.signedIn ??= {};
  db.lobbies ??= {};
  db.chat ??= {};
  db.invites ??= {};
  return db;
};
const write = (db) => localStorage.setItem(KEY, JSON.stringify(db));
const copy = (x) => JSON.parse(JSON.stringify(x));

const avatar = (bg) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><circle cx="32" cy="25" r="12" fill="#FCF0D6"/><path d="M10 60c3-13 12-19 22-19s19 6 22 19z" fill="#FCF0D6"/></svg>`
  );

export const FAKE_USERS = {
  reech: { uid: "fake-uid-reech", name: "Reech Test", email: "reech@example.com", photoURL: avatar("#6B9EBD") },
  dave: { uid: "fake-uid-dave", name: "Dave Test", email: "dave@example.com", photoURL: avatar("#B40023") },
  kam: { uid: "fake-uid-kam", name: "Kam Test", email: "kam@example.com", photoURL: avatar("#58B48C") },
};
export const FAKE_USER = FAKE_USERS.reech;

function who() {
  try {
    const q = new URLSearchParams(location.search).get("fakeuser");
    if (q) sessionStorage.setItem("reechDarts:fakeuser", q);
    return FAKE_USERS[sessionStorage.getItem("reechDarts:fakeuser")] ?? FAKE_USER;
  } catch {
    return FAKE_USER;
  }
}

export function createFakeBackend() {
  const me = who();
  const userListeners = new Set();
  const friendWatchers = new Set();
  const later = (v) => new Promise((r) => setTimeout(() => r(v), 30)); // feel like a network
  const userDb = (db, uid) => (db.users[uid] ??= { profile: null, matches: {}, deleted: {} });
  const signedIn = () => Boolean(read().signedIn[me.uid]);
  const emitUser = () => userListeners.forEach((cb) => cb(signedIn() ? me : null));
  const emitFriends = () => friendWatchers.forEach((w) => w());
  const areFriends = (db, a, b) => db.friendships[a < b ? `${a}_${b}` : `${b}_${a}`]?.status === "accepted";

  // Other tabs changing the fake cloud count as live updates.
  const watchers = new Set(); // every live listener re-reads on any change
  window.addEventListener("storage", (e) => e.key === KEY && (emitFriends(), watchers.forEach((w) => w())));
  const changed = () => {
    emitFriends();
    watchers.forEach((w) => w());
  };
  const live = (run) => {
    watchers.add(run);
    setTimeout(run, 0);
    return () => watchers.delete(run);
  };
  // "seats.1.lastSeen" style paths, like Firestore's updateDoc.
  const applyPatch = (obj, patch) => {
    for (const [path, value] of Object.entries(copy(patch))) {
      const keys = path.split(".");
      let o = obj;
      for (const k of keys.slice(0, -1)) o = o[k] ??= {};
      o[keys[keys.length - 1]] = value;
    }
    return obj;
  };

  const guard = (uid) => {
    if (!signedIn() || uid !== me.uid) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
  };

  return {
    kind: "fake",
    onUser(cb) {
      userListeners.add(cb);
      setTimeout(() => cb(signedIn() ? me : null), 0);
      return () => userListeners.delete(cb);
    },
    async signIn() {
      const db = read();
      db.signedIn[me.uid] = true;
      write(db);
      emitUser();
    },
    async signOut() {
      const db = read();
      db.signedIn[me.uid] = false;
      write(db);
      emitUser();
    },

    async getProfile(uid) {
      guard(uid);
      return later(userDb(read(), uid).profile);
    },
    async setProfile(uid, data) {
      guard(uid);
      const db = read();
      const u = userDb(db, uid);
      u.profile = { ...(u.profile || {}), ...copy(data) };
      write(db);
      return later();
    },
    async listMatches(uid) {
      guard(uid);
      return later(Object.values(userDb(read(), uid).matches));
    },
    async putMatch(uid, record) {
      guard(uid);
      const db = read();
      userDb(db, uid).matches[record.id] = copy(record);
      write(db);
      return later();
    },
    async deleteMatch(uid, id) {
      guard(uid);
      const db = read();
      const u = userDb(db, uid);
      delete u.matches[id];
      u.deleted[id] = Date.now();
      write(db);
      return later();
    },
    async listDeleted(uid) {
      guard(uid);
      return later(Object.keys(userDb(read(), uid).deleted));
    },

    // ------------------------------------------------------------- friends
    async claimCode(code, card) {
      const db = read();
      if (db.codes[code] && db.codes[code].uid !== card.uid) return later(false);
      db.codes[code] = copy(card);
      write(db);
      return later(true);
    },
    async updateCode(code, card) {
      const db = read();
      if (db.codes[code]?.uid !== me.uid) return later();
      db.codes[code] = { ...db.codes[code], ...copy(card) };
      write(db);
      return later();
    },
    async lookupCode(code) {
      return later(read().codes[code] ?? null);
    },
    async setPublicProfile(uid, data) {
      guard(uid);
      const db = read();
      db.profiles[uid] = { ...(db.profiles[uid] || {}), ...copy(data) };
      write(db);
      return later();
    },
    // Like the real rules: only you and your friends can read it.
    async getPublicProfile(uid) {
      const db = read();
      if (uid !== me.uid && !areFriends(db, me.uid, uid)) return later(null);
      return later(db.profiles[uid] ?? null);
    },
    async getFriendship(id) {
      const f = read().friendships[id];
      return later(f ? { id, ...f } : null);
    },
    watchFriendships(uid, cb) {
      const run = () => {
        const db = read();
        cb(Object.entries(db.friendships).filter(([, f]) => f.users.includes(uid)).map(([id, f]) => ({ id, ...f })));
      };
      friendWatchers.add(run);
      setTimeout(run, 0);
      return () => friendWatchers.delete(run);
    },
    // ------------------------------------------------------------- lobbies
    async createLobby(code, data) {
      const db = read();
      if (db.lobbies[code]) return later(false);
      db.lobbies[code] = copy(data);
      write(db);
      changed();
      return later(true);
    },
    async getLobby(code) {
      return later(read().lobbies[code] ? copy(read().lobbies[code]) : null);
    },
    watchLobby(code, cb) {
      let last = null;
      return live(() => {
        const l = read().lobbies[code] ?? null;
        const json = JSON.stringify(l);
        if (json === last) return;
        last = json;
        cb(l ? copy(l) : null);
      });
    },
    async updateLobby(code, patch) {
      const db = read();
      if (!db.lobbies[code]) throw new Error("No such lobby");
      applyPatch(db.lobbies[code], patch);
      write(db);
      changed();
      return later();
    },
    async lobbyTransaction(code, fn) {
      await later();
      const db = read();
      const patch = fn(db.lobbies[code] ? copy(db.lobbies[code]) : null);
      if (patch) {
        applyPatch(db.lobbies[code], patch);
        write(db);
        changed();
      }
      return patch;
    },
    async myLobbies(uid) {
      return later(Object.values(read().lobbies).filter((l) => (l.members || []).includes(uid)).map(copy));
    },
    async sendChat(code, msg) {
      const db = read();
      (db.chat[code] ??= []).push({ id: `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`, ...copy(msg) });
      write(db);
      changed();
      return later();
    },
    watchChat(code, cb) {
      let last = null;
      return live(() => {
        const list = (read().chat[code] || []).slice(-100);
        const json = JSON.stringify(list);
        if (json === last) return;
        last = json;
        cb(copy(list));
      });
    },
    async sendInvite(data) {
      const db = read();
      const id = `i${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      db.invites[id] = copy(data);
      write(db);
      changed();
      return later({ id });
    },
    watchInvites(uid, cb) {
      let last = null;
      return live(() => {
        const list = Object.entries(read().invites).filter(([, i]) => i.to === uid).map(([id, i]) => ({ id, ...i }));
        const json = JSON.stringify(list);
        if (json === last) return;
        last = json;
        cb(list);
      });
    },
    async deleteInvite(id) {
      const db = read();
      delete db.invites[id];
      write(db);
      changed();
      return later();
    },

    async createFriendship(id, data) {
      const db = read();
      db.friendships[id] = copy(data);
      write(db);
      emitFriends();
      return later();
    },
    async acceptFriendship(id) {
      const db = read();
      if (db.friendships[id]?.to !== me.uid) throw new Error("Only the person asked can accept");
      db.friendships[id].status = "accepted";
      db.friendships[id].acceptedAt = Date.now();
      write(db);
      emitFriends();
      return later();
    },
    async deleteFriendship(id) {
      const db = read();
      delete db.friendships[id];
      write(db);
      emitFriends();
      return later();
    },
  };
}
