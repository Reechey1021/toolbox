// services/account.js
// Your Google account, glued to the app.
//
// Identity: every account is its own person on this device.
//   Signed out   you're the device guest (owner.localId), with your own name and matches
//   Signed in    you're "g:<uid>": that account's name, caller, darts and friend code
//                are swapped in (cached per account, so switching back is instant),
//                and only that account's matches are synced.
//   Switching    signing in as someone else never relabels or copies anyone's matches.
//                Only matches played as the device guest are offered to bring along.

import { getBackend, cloudAvailable } from "./cloud/index.js";
import { kv, matches, onMatchesChange } from "./storage.js";
import { getOwner, saveOwnerFields, onOwnerChange } from "./profile.js";
import { rewriteActivePlayerId } from "./session.js";
import { rewritePlayerId, planSync, mergeProfile, SYNCED_PROFILE, makeFriendCode, statsSummary, involves } from "../engine/records.js";
import { lifetimeStats } from "../engine/stats.js";

// status: "off" (accounts not set up), "loading", "guest", "syncing", "synced", "offline", "error"
let status = cloudAvailable() ? "loading" : "off";
let user = null;
let lastSync = null;
let askToMigrate = async () => true;
let syncing = null;
let started = false;
const listeners = new Set();

export function accountState() {
  return { status, user, lastSync, available: cloudAvailable() };
}

export function onAccountChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(next) {
  if (next.status) status = next.status;
  if ("user" in next) user = next.user;
  if (next.lastSync) lastSync = next.lastSync;
  for (const fn of listeners) fn(accountState());
}

export const accountId = (uid) => `g:${uid}`;

export function whenAccountReady() {
  if (status !== "loading") return Promise.resolve(accountState());
  return new Promise((resolve) => {
    const off = onAccountChange((s) => {
      if (s.status === "loading") return;
      off();
      resolve(s);
    });
  });
}

// ---------------------------------------------------------------------------
// Per-identity profile fields (name, caller, darts, friend code)
// ---------------------------------------------------------------------------

const GUEST_KEY = "guestProfile";
const accountKey = (uid) => `account:${uid}`;
const pickFields = (o) => {
  const out = { updatedAt: o?.updatedAt ?? 0 };
  for (const k of SYNCED_PROFILE) if (o?.[k] !== undefined) out[k] = o[k];
  return out;
};
const blankFields = () => ({ callerName: "", equipment: null, friendCode: null });

// Remember whoever is "you" right now before someone else signs in.
function stashCurrent() {
  const owner = getOwner();
  if (!owner) return;
  if (owner.kind === "google" && owner.account?.uid) kv.set(accountKey(owner.account.uid), pickFields(owner));
  else kv.set(GUEST_KEY, pickFields(owner));
}

// ---------------------------------------------------------------------------
// Start up
// ---------------------------------------------------------------------------

export async function initAccount({ ask } = {}) {
  if (ask) askToMigrate = ask;
  if (!cloudAvailable()) return;
  const backend = await getBackend();
  if (!backend) {
    set({ status: "offline" });
    window.addEventListener("online", () => initAccount(), { once: true });
    return;
  }
  if (started) return;
  started = true;

  backend.onUser((u) => handleUser(u));

  onMatchesChange(async (change) => {
    if (!user) return;
    try {
      const mine = change.type === "put" && involves(change.record, accountId(user.uid)) && !change.record.localOnly;
      if (mine) await backend.putMatch(user.uid, change.record);
      if (change.type === "remove") await backend.deleteMatch(user.uid, change.id).catch(() => {});
      publishSoon();
    } catch {
      set({ status: navigator.onLine ? "error" : "offline" });
    }
  });

  onOwnerChange(async (owner) => {
    if (!user || owner.id !== accountId(user.uid)) return;
    kv.set(accountKey(user.uid), pickFields(owner));
    try {
      await backend.setProfile(user.uid, profilePayload(owner));
      publishSoon();
    } catch {
      set({ status: navigator.onLine ? "error" : "offline" });
    }
  });

  window.addEventListener("online", () => user && syncNow());
}

export async function signIn() {
  const backend = await getBackend();
  if (!backend) throw new Error("Couldn't reach Google. Check your connection and try again.");
  await backend.signIn();
}

export async function signOut() {
  const backend = await getBackend();
  await backend?.signOut();
}

function profilePayload(owner) {
  const out = { updatedAt: owner.updatedAt ?? Date.now(), photoURL: owner.account?.photoURL ?? "" };
  for (const k of SYNCED_PROFILE) if (owner[k] !== undefined) out[k] = owner[k];
  return out;
}

// ---------------------------------------------------------------------------
// Signing in and out
// ---------------------------------------------------------------------------

async function handleUser(u) {
  if (!u) {
    becomeGuest();
    return set({ status: "guest", user: null });
  }
  set({ status: "syncing", user: u });
  try {
    await becomeAccount(u);
    await syncNow();
  } catch (err) {
    console.warn("Account sync failed", err);
    set({ status: navigator.onLine ? "error" : "offline" });
  }
}

// Back to the device guest, with the guest's own details.
function becomeGuest() {
  const owner = getOwner();
  if (!owner || owner.kind !== "google") return;
  stashCurrent();
  const guest = { ...blankFields(), ...kv.get(GUEST_KEY, {}) };
  saveOwnerFields({ ...guest, id: owner.localId, kind: "local", account: null }, { touch: false });
}

async function becomeAccount(u) {
  const owner = getOwner();
  const id = accountId(u.uid);
  const account = { uid: u.uid, email: u.email, photoURL: u.photoURL, googleName: u.name };
  const localId = owner.localId ?? (owner.kind === "google" ? null : owner.id);

  if (owner.id === id) {
    saveOwnerFields({ account, localId }, { touch: false });
    return;
  }

  const wasGuest = owner.kind !== "google";
  stashCurrent();

  // This account's details: its cloud profile, else its cache on this device. A new account
  // starts from the guest's details if you were the guest, never from another account's.
  const backend = await getBackend();
  const remote = await backend.getProfile(u.uid).catch(() => null);
  const cached = kv.get(accountKey(u.uid), null);
  const base = wasGuest ? pickFields(owner) : { name: (u.name || owner.name).split(" ")[0], ...blankFields() };
  const fields = { ...blankFields(), ...base, ...(cached || {}), ...(remote ? pickFields(remote) : {}) };
  saveOwnerFields({ ...fields, id, localId, kind: "google", account }, { touch: false });

  // Only the device guest's matches can be brought along.
  if (localId) {
    const guestMatches = (await matches.list()).filter((r) => involves(r, localId) && !r.guestKept);
    if (guestMatches.length && (await askToMigrate(guestMatches.length))) {
      for (const r of guestMatches) await matches.put(rewritePlayerId(r, localId, id), { silent: true });
    } else {
      for (const r of guestMatches) await matches.put({ ...r, guestKept: true }, { silent: true });
    }
    rewriteActivePlayerId(localId, id);
  }
}

// ---------------------------------------------------------------------------
// Syncing
// ---------------------------------------------------------------------------

export function syncNow() {
  if (syncing) return syncing;
  syncing = (async () => {
    const backend = await getBackend();
    if (!backend || !user) return;
    set({ status: "syncing" });
    try {
      const me = accountId(user.uid);
      const remoteProfile = await backend.getProfile(user.uid);
      const { profile, pushNeeded } = mergeProfile(getOwner(), remoteProfile);
      saveOwnerFields(profile, { touch: false });
      if (pushNeeded) await backend.setProfile(user.uid, profilePayload(getOwner()));

      // Matches: only this account's, both ways, deletions respected.
      const [remote, deleted, all] = await Promise.all([backend.listMatches(user.uid), backend.listDeleted(user.uid), matches.list()]);
      const plan = planSync({ local: all.filter((r) => involves(r, me)), remote, deleted });
      for (const id of plan.removeLocal) await matches.remove(id, { silent: true });
      for (const r of plan.addLocal) await matches.put(r, { silent: true });
      for (const r of plan.push) await backend.putMatch(user.uid, r);

      await ensureFriendCode(backend);
      kv.set(accountKey(user.uid), pickFields(getOwner()));
      await publishProfile();
      set({ status: "synced", lastSync: Date.now() });
    } catch (err) {
      console.warn("Sync failed", err);
      set({ status: navigator.onLine ? "error" : "offline" });
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

// ---------------------------------------------------------------------------
// What friends see
// ---------------------------------------------------------------------------

export function myCard() {
  const owner = getOwner();
  return user ? { uid: user.uid, name: owner.name, photoURL: owner.account?.photoURL ?? user.photoURL ?? "" } : null;
}

// Your friend code belongs to your account. Every sign-in checks the one shown
// really is yours, and claims a fresh one if not (or if you haven't got one yet).
async function ensureFriendCode(backend) {
  const card = myCard();
  if (!card) return;
  const current = getOwner().friendCode;
  if (current) {
    const holder = await backend.lookupCode(current).catch(() => undefined);
    if (holder === undefined) return; // couldn't check (offline): leave it
    if (holder && holder.uid === card.uid) {
      await backend.updateCode(current, card).catch(() => {});
      return;
    }
  }
  for (let tries = 0; tries < 8; tries++) {
    const code = makeFriendCode();
    if (await backend.claimCode(code, card)) {
      saveOwnerFields({ friendCode: code }, { touch: false });
      await backend.setProfile(user.uid, { friendCode: code });
      return;
    }
  }
}

export async function publishProfile() {
  const backend = await getBackend();
  if (!backend || !user) return;
  const owner = getOwner();
  if (owner.id !== accountId(user.uid)) return;
  const life = lifetimeStats(await matches.list(), owner.id);
  const card = myCard();
  await backend.setPublicProfile(user.uid, {
    ...card,
    friendCode: owner.friendCode ?? null,
    equipment: owner.equipment ?? null,
    callerName: owner.callerName || null,
    stats: statsSummary(life),
    updatedAt: Date.now(),
  });
  if (owner.friendCode) await backend.updateCode(owner.friendCode, card).catch(() => {});
}

let publishTimer = null;
function publishSoon() {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => publishProfile().catch(() => {}), 1500);
}

export function statusText(s = accountState()) {
  switch (s.status) {
    case "off":
      return "Google sign-in isn't set up yet.";
    case "loading":
      return "Checking your account…";
    case "guest":
      return "Playing as a guest on this device.";
    case "syncing":
      return "Syncing your matches…";
    case "synced":
      return "Everything's backed up to your account.";
    case "offline":
      return s.user ? "Offline. Your matches will sync when you're back online." : "Can't reach Google right now. Sign in when you're back online.";
    case "error":
      return "Couldn't sync just now. It'll try again next time.";
    default:
      return "";
  }
}
