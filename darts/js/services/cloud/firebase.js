// services/cloud/firebase.js
// The real backend: Google sign-in and Firestore, loaded from Google's CDN only
// when a config exists. Kept deliberately small and conventional; everything
// clever happens in account.js, which talks to this through the same interface
// as the test backend (fake.js).
//
// Data layout (see firestore.rules):
//   users/{uid}                    profile: name, callerName, equipment, photoURL
//   users/{uid}/matches/{matchId}  finished matches, exactly as stored on the device
//   users/{uid}/deleted/{matchId}  matches deleted on one device, so others remove them too
//   codes/{code}                   friend code -> { uid, name, photoURL } (the only public bit)
//   profiles/{uid}                 what friends see: name, photo, darts, stats summary
//   friendships/{a_b}              one per pair: { users, from, to, status, names, photos }

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

export async function createFirebaseBackend(config) {
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import(`${SDK}firebase-app.js`),
    import(`${SDK}firebase-auth.js`),
    import(`${SDK}firebase-firestore.js`),
  ]);

  const app = initializeApp(config);
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  // Finish a redirect sign-in if we're coming back from one.
  authMod.getRedirectResult(auth).catch(() => {});

  const toUser = (u) =>
    u ? { uid: u.uid, name: u.displayName || "", email: u.email || "", photoURL: u.photoURL || "" } : null;

  // Firestore rejects undefined values, so every write goes through JSON.
  const plain = (x) => JSON.parse(JSON.stringify(x));

  return {
    kind: "firebase",

    onUser(cb) {
      return authMod.onAuthStateChanged(auth, (u) => cb(toUser(u)));
    },

    async signIn() {
      try {
        await authMod.signInWithPopup(auth, provider);
      } catch (err) {
        // Popups blocked (or not allowed, as in some installed apps): go the redirect way.
        const code = err?.code || "";
        if (code.includes("popup-blocked") || code.includes("operation-not-supported") || code.includes("web-storage-unsupported")) {
          await authMod.signInWithRedirect(auth, provider);
          return;
        }
        if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return;
        throw err;
      }
    },

    signOut: () => authMod.signOut(auth),

    async getProfile(uid) {
      const snap = await fs.getDoc(fs.doc(db, "users", uid));
      return snap.exists() ? snap.data() : null;
    },

    setProfile: (uid, data) => fs.setDoc(fs.doc(db, "users", uid), plain(data), { merge: true }),

    async listMatches(uid) {
      const snap = await fs.getDocs(fs.collection(db, "users", uid, "matches"));
      return snap.docs.map((d) => d.data());
    },

    putMatch: (uid, record) => fs.setDoc(fs.doc(db, "users", uid, "matches", record.id), plain(record)),

    async deleteMatch(uid, id) {
      await fs.deleteDoc(fs.doc(db, "users", uid, "matches", id));
      await fs.setDoc(fs.doc(db, "users", uid, "deleted", id), { at: Date.now() });
    },

    async listDeleted(uid) {
      const snap = await fs.getDocs(fs.collection(db, "users", uid, "deleted"));
      return snap.docs.map((d) => d.id);
    },

    // ------------------------------------------------------------- friends

    // Claim a friend code. Resolves true, or false if someone already has it.
    async claimCode(code, card) {
      const ref = fs.doc(db, "codes", code);
      return fs.runTransaction(db, async (t) => {
        const snap = await t.get(ref);
        if (snap.exists() && snap.data().uid !== card.uid) return false;
        t.set(ref, plain(card));
        return true;
      });
    },

    updateCode: (code, card) => fs.setDoc(fs.doc(db, "codes", code), plain(card), { merge: true }),

    async lookupCode(code) {
      const snap = await fs.getDoc(fs.doc(db, "codes", code));
      return snap.exists() ? snap.data() : null;
    },

    setPublicProfile: (uid, data) => fs.setDoc(fs.doc(db, "profiles", uid), plain(data), { merge: true }),

    // Null when it doesn't exist or you're not allowed (not friends).
    async getPublicProfile(uid) {
      try {
        const snap = await fs.getDoc(fs.doc(db, "profiles", uid));
        return snap.exists() ? snap.data() : null;
      } catch {
        return null;
      }
    },

    async getFriendship(id) {
      const snap = await fs.getDoc(fs.doc(db, "friendships", id));
      return snap.exists() ? { id, ...snap.data() } : null;
    },

    // Live list of every friendship (pending or accepted) you're part of.
    watchFriendships(uid, cb) {
      const q = fs.query(fs.collection(db, "friendships"), fs.where("users", "array-contains", uid));
      return fs.onSnapshot(
        q,
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.warn("Friends list stopped updating", err)
      );
    },

    // ------------------------------------------------------------- lobbies
    //   lobbies/{code}              seats, settings, the match config and its visits
    //   lobbies/{code}/chat/{id}    chat messages
    //   invites/{id}                "come and play" from a friend

    async createLobby(code, data) {
      const ref = fs.doc(db, "lobbies", code);
      return fs.runTransaction(db, async (t) => {
        if ((await t.get(ref)).exists()) return false;
        t.set(ref, plain(data));
        return true;
      });
    },

    async getLobby(code) {
      const snap = await fs.getDoc(fs.doc(db, "lobbies", code));
      return snap.exists() ? snap.data() : null;
    },

    watchLobby(code, cb) {
      return fs.onSnapshot(fs.doc(db, "lobbies", code), (snap) => cb(snap.exists() ? snap.data() : null), (err) => console.warn("Lobby stopped updating", err));
    },

    // patch keys can be paths like "seats.1.lastSeen".
    updateLobby: (code, patch) => fs.updateDoc(fs.doc(db, "lobbies", code), plain(patch)),

    // fn(lobby) returns a patch, or null to leave it alone. Resolves to fn's patch.
    async lobbyTransaction(code, fn) {
      const ref = fs.doc(db, "lobbies", code);
      return fs.runTransaction(db, async (t) => {
        const snap = await t.get(ref);
        const patch = fn(snap.exists() ? snap.data() : null);
        if (patch) t.update(ref, plain(patch));
        return patch;
      });
    },

    async myLobbies(uid) {
      const q = fs.query(fs.collection(db, "lobbies"), fs.where("members", "array-contains", uid));
      return (await fs.getDocs(q)).docs.map((d) => d.data());
    },

    sendChat: (code, msg) => fs.addDoc(fs.collection(db, "lobbies", code, "chat"), plain(msg)),

    watchChat(code, cb) {
      const q = fs.query(fs.collection(db, "lobbies", code, "chat"), fs.orderBy("at"), fs.limitToLast(100));
      return fs.onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (err) => console.warn("Chat stopped updating", err));
    },

    sendInvite: (data) => fs.addDoc(fs.collection(db, "invites"), plain(data)),

    watchInvites(uid, cb) {
      const q = fs.query(fs.collection(db, "invites"), fs.where("to", "==", uid));
      return fs.onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (err) => console.warn("Invites stopped updating", err));
    },

    deleteInvite: (id) => fs.deleteDoc(fs.doc(db, "invites", id)),

    createFriendship: (id, data) => fs.setDoc(fs.doc(db, "friendships", id), plain(data)),
    acceptFriendship: (id) => fs.updateDoc(fs.doc(db, "friendships", id), { status: "accepted", acceptedAt: Date.now() }),
    deleteFriendship: (id) => fs.deleteDoc(fs.doc(db, "friendships", id)),
  };
}
