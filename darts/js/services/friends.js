// services/friends.js
// Your friends, kept up to date live while you're signed in.
//
// Every friendship is one shared document (friendships/{a_b}), pending until
// the other person accepts. From that one list come three:
//   friends    accepted
//   incoming   requests waiting for you
//   outgoing   requests you've sent

import { getBackend } from "./cloud/index.js";
import { accountState, onAccountChange, myCard } from "./account.js";
import { getOwner } from "./profile.js";
import { pairId, normaliseCode } from "../engine/records.js";

let all = [];
let loaded = false;
let unwatch = null;
let watchingUid = null;
const listeners = new Set();
const profileCache = new Map(); // uid -> { at, profile }

function emit() {
  const s = friendsState();
  for (const fn of listeners) fn(s);
}

export function onFriendsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// The other person in a friendship, as a card.
function other(f, me) {
  const them = f.users.find((u) => u !== me);
  const theyAsked = f.from === them;
  return {
    id: f.id,
    uid: them,
    name: (theyAsked ? f.fromName : f.toName) || "Player",
    photoURL: (theyAsked ? f.fromPhoto : f.toPhoto) || "",
    since: f.acceptedAt ?? f.createdAt ?? null,
    createdAt: f.createdAt ?? null,
  };
}

export function friendsState() {
  const me = accountState().user?.uid ?? null;
  const byName = (a, b) => a.name.localeCompare(b.name);
  const friends = me ? all.filter((f) => f.status === "accepted").map((f) => other(f, me)).sort(byName) : [];
  const incoming = me ? all.filter((f) => f.status === "pending" && f.to === me).map((f) => other(f, me)) : [];
  const outgoing = me ? all.filter((f) => f.status === "pending" && f.from === me).map((f) => other(f, me)) : [];
  return { signedIn: Boolean(me), loaded, friends, incoming, outgoing };
}

// ---------------------------------------------------------------------------
// Watching
// ---------------------------------------------------------------------------

async function watch(uid) {
  if (watchingUid === uid) return;
  stop();
  watchingUid = uid;
  const backend = await getBackend();
  if (!backend || watchingUid !== uid) return;
  unwatch = backend.watchFriendships(uid, (list) => {
    all = list;
    loaded = true;
    emit();
  });
}

function stop() {
  unwatch?.();
  unwatch = null;
  watchingUid = null;
  all = [];
  loaded = false;
  profileCache.clear();
}

onAccountChange((s) => {
  if (s.user) watch(s.user.uid);
  else if (watchingUid) {
    stop();
    emit();
  }
});
if (accountState().user) watch(accountState().user.uid);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function need() {
  const backend = await getBackend();
  const me = myCard();
  if (!backend || !me) throw new Error("Sign in to add friends");
  return { backend, me };
}

// Who a code belongs to: { uid, name, photoURL }, or null.
export async function lookup(input) {
  const code = normaliseCode(input);
  if (!code) throw new Error("That doesn't look like a friend code. They're six letters and numbers.");
  const { backend, me } = await need();
  const card = await backend.lookupCode(code);
  if (!card) return null;
  if (card.uid === me.uid) throw new Error("That's your own code.");
  return { ...card, code };
}

// Send a request. If they've already asked you, this accepts theirs instead.
// Resolves "sent", "accepted" or "already".
export async function sendRequest(card) {
  const { backend, me } = await need();
  const id = pairId(me.uid, card.uid);
  const existing = await backend.getFriendship(id);
  if (existing?.status === "accepted") return "already";
  if (existing && existing.to === me.uid) {
    await backend.acceptFriendship(id);
    return "accepted";
  }
  if (existing) return "sent";
  await backend.createFriendship(id, {
    users: [me.uid, card.uid].sort(),
    from: me.uid,
    to: card.uid,
    status: "pending",
    fromName: me.name,
    fromPhoto: me.photoURL,
    toName: card.name,
    toPhoto: card.photoURL || "",
    createdAt: Date.now(),
  });
  return "sent";
}

export async function accept(id) {
  const { backend } = await need();
  await backend.acceptFriendship(id);
}

// Decline a request, cancel one you sent, or remove a friend: all the same underneath.
export async function removeFriendship(id) {
  const { backend } = await need();
  await backend.deleteFriendship(id);
  profileCache.delete(id.split("_").find((u) => u !== myCard()?.uid));
}

// A friend's profile (name, photo, darts, stats). Cached for a minute.
export async function friendProfile(uid, { fresh = false } = {}) {
  const hit = profileCache.get(uid);
  if (!fresh && hit && Date.now() - hit.at < 60_000) return hit.profile;
  const { backend } = await need();
  const profile = await backend.getPublicProfile(uid);
  profileCache.set(uid, { at: Date.now(), profile });
  return profile;
}

export function friendById(uid) {
  return friendsState().friends.find((f) => f.uid === uid) ?? null;
}

// The link that opens straight to "add this friend".
export function inviteLink(code = getOwner()?.friendCode) {
  if (!code) return null;
  return `${location.origin}${location.pathname}#/add/${code}`;
}
