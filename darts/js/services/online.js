// services/online.js
// Online lobbies and matches.
//
// A lobby is one document (lobbies/{code}) that every player listens to live:
//   seats     who's sitting where: { "0": { uid, name, photoURL, call, ready, lastSeen } | null, ... }
//   members   the uids seated (for the security rules)
//   settings  the match options (the host changes these)
//   status    "open" (in the lobby), "playing", or "closed"
//   cfg       the match config once started, and events: every visit so far
//   turn      the uid whose visit is next; lastBy: who wrote the last visit
//
// Every visit and undo goes through a transaction, so two devices can never
// both write "the next visit". Each device replays the same events through the
// same engine, so everyone always sees the same match. Your seat is your
// account: close the app, come back, and you're straight back in.

import { getBackend } from "./cloud/index.js";
import { kv } from "./storage.js";
import { accountState, onAccountChange, myCard } from "./account.js";
import { getOwner } from "./profile.js";
import { getSettings, setSetting } from "./settings.js";
import { startOnlineMatch, applyRemoteEvents, updateOnlineCfg, setOnlineBridge, onlineCode, leaveOnlineMatch, isOnline } from "./session.js";
import { createMatch, needsBull, bullThrowers } from "../engine/match.js";
import { whoThrows, isArcade } from "../engine/modes.js";
import { createArcade } from "../engine/arcade/core.js";
import { MODE_LIST } from "../engine/arcade/modes.js";
import { resolveBull, cleanThrow } from "../engine/bull.js";
import { makeFriendCode, normaliseCode } from "../engine/records.js";

export const MIN_SEATS = 2;
export const MAX_SEATS = 4;
const LOBBY_KEY = "onlineLobby";

let code = kv.get(LOBBY_KEY, null);
let lobby = null;
let chat = [];
let invites = [];
let stopLobby = null;
let stopChat = null;
let stopInvites = null;
const listeners = new Set();

export const uidOf = (cfg, playerIndex) => cfg.players[playerIndex]?.id?.replace(/^g:/, "") ?? null;
const me = () => accountState().user?.uid ?? null;

export function onlineState() {
  const uid = me();
  const seats = lobby ? seatList(lobby) : [];
  const mySeat = seats.findIndex((s) => s?.uid === uid);
  return { code, lobby, chat, invites, uid, seats, mySeat, isHost: Boolean(lobby && uid && lobby.host === uid) };
}

export function onOnlineChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason) {
  const s = onlineState();
  for (const fn of listeners) fn(s, reason);
}

export function seatList(l) {
  return Array.from({ length: l.seatCount ?? MIN_SEATS }, (_, i) => l.seats?.[String(i)] ?? null);
}

// No presence tracking: it would mean a background write every few seconds per
// player. Firebase is only written when someone actually does something.
export function isAway() {
  return false;
}

async function need() {
  const backend = await getBackend();
  const uid = me();
  if (!backend || !uid) throw new Error("Sign in to play online");
  return { backend, uid };
}

function seatFor(uid) {
  const card = myCard();
  const owner = getOwner();
  return { uid, name: card?.name ?? owner.name, photoURL: card?.photoURL ?? "", call: owner.callerName || "", ready: false };
}

// ---------------------------------------------------------------------------
// Hosting and joining
// ---------------------------------------------------------------------------

function defaultSettings() {
  const last = getSettings().lastOnline ?? {};
  return {
    startScore: last.startScore ?? 501,
    customScore: last.customScore ?? 1001,
    formatType: last.formatType ?? "firstTo",
    legs: last.legs ?? 3,
    checkIn: last.checkIn ?? "straight",
    checkOut: last.checkOut ?? "double",
    first: last.first === "random" || last.first === "bull" || Number.isInteger(last.first) ? last.first : "random",
    anyoneScores: last.anyoneScores ?? false,
    trackDoubles: getSettings().trackDoubles,
    // Arcade: which game ("x01" for a normal match), each game's options, and the tie rule.
    mode: last.mode ?? "x01",
    arcade: Object.fromEntries(MODE_LIST.map((m) => [m.id, { ...m.defaults, ...(last.arcade?.[m.id] ?? {}) }])),
    tie: last.tie ?? "sudden",
  };
}

export async function hostLobby() {
  const { backend, uid } = await need();
  for (let tries = 0; tries < 8; tries++) {
    const c = makeFriendCode();
    const data = {
      code: c,
      host: uid,
      status: "open",
      seatCount: 2,
      seats: { 0: seatFor(uid) },
      members: [uid],
      settings: defaultSettings(),
      cfg: null,
      events: [],
      turn: null,
      lastBy: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (await backend.createLobby(c, data)) {
      await openLobby(c);
      return c;
    }
  }
  throw new Error("Couldn't create a lobby. Try again.");
}

// Take a free seat (or come back to your own). Resolves to the code.
export async function joinLobby(input) {
  const c = normaliseCode(input);
  if (!c) throw new Error("Game codes are six letters and numbers.");
  const { backend, uid } = await need();
  await backend.lobbyTransaction(c, (l) => {
    if (!l || l.status === "closed") throw new Error("That game doesn't exist any more.");
    if (l.members.includes(uid)) return null; // already seated: just open it
    if (l.status !== "open") throw new Error("That match has already started.");
    const free = seatList(l).findIndex((s) => !s);
    if (free < 0) throw new Error("That lobby is full.");
    return { [`seats.${free}`]: seatFor(uid), members: [...l.members, uid], updatedAt: Date.now() };
  });
  await openLobby(c);
  return c;
}

// Start listening to a lobby (also how you reconnect).
export async function openLobby(c) {
  const { backend } = await need();
  if (code === c && stopLobby) return;
  closeWatchers();
  code = c;
  kv.set(LOBBY_KEY, c);
  stopLobby = backend.watchLobby(c, (data) => onLobby(data));
  stopChat = backend.watchChat(c, (list) => {
    chat = list;
    emit("chat");
  });
}

async function onLobby(data) {
  const prev = lobby;
  lobby = data;
  if (!data) return forget("gone");
  const uid = me();
  if (uid && !data.members.includes(uid)) return forget("removed");
  if (data.status === "playing" && data.cfg) {
    if (!isOnline() || onlineCode() !== data.code || prev?.cfg?.id !== data.cfg.id) await startOnlineMatch(data.cfg, data.events, data.code, data.rev);
    else await applyRemoteEvents(data.code, data.events, data.rev);
    updateOnlineCfg(data.code, data.cfg);
  }
  if (data.status === "closed") return forget("closed");
  emit(prev?.status !== data.status ? `status:${data.status}` : "update");
}

function closeWatchers() {
  stopLobby?.();
  stopChat?.();
  stopLobby = stopChat = null;
}

// Stop following this lobby on this device.
function forget(reason) {
  closeWatchers();
  if (isOnline() && onlineCode() === code) leaveOnlineMatch();
  code = null;
  lobby = null;
  chat = [];
  kv.remove(LOBBY_KEY);
  emit(reason);
}

// Leave the lobby. The host hands over to someone else, or closes it if empty.
export async function leaveLobby() {
  const { backend, uid } = await need();
  const c = code;
  if (!c) return;
  await backend
    .lobbyTransaction(c, (l) => {
      if (!l) return null;
      const seat = seatList(l).findIndex((s) => s?.uid === uid);
      const members = l.members.filter((m) => m !== uid);
      const patch = { members, updatedAt: Date.now() };
      if (seat >= 0) patch[`seats.${seat}`] = null;
      if (l.host === uid) {
        if (members.length && l.status === "open") patch.host = members[0];
        else patch.status = "closed";
      }
      return patch;
    })
    .catch(() => {});
  forget("left");
}

// Stop watching without giving up your seat (you can rejoin).
export function stepAway() {
  closeWatchers();
  if (isOnline()) leaveOnlineMatch();
  emit("away");
}

// ---------------------------------------------------------------------------
// In the lobby
// ---------------------------------------------------------------------------

export async function setReady(ready) {
  const { backend } = await need();
  const s = onlineState();
  if (s.mySeat >= 0) await backend.updateLobby(code, { [`seats.${s.mySeat}.ready`]: ready, updatedAt: Date.now() });
}

export async function updateSettings(patch) {
  const { backend } = await need();
  if (!onlineState().isHost) return;
  const settings = { ...lobby.settings, ...patch };
  setSetting("lastOnline", settings);
  await backend.updateLobby(code, { settings, updatedAt: Date.now() });
}

export async function setSeatCount(n) {
  const { backend } = await need();
  const s = onlineState();
  if (!s.isHost) return;
  const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, n));
  if (s.seats.slice(count).some(Boolean)) throw new Error("Someone's sitting in that seat.");
  // Keep "throws first" pointing at a seat that exists.
  const first = Number.isInteger(lobby.settings.first) && lobby.settings.first >= count ? "random" : lobby.settings.first;
  await backend.updateLobby(code, { seatCount: count, settings: { ...lobby.settings, first }, updatedAt: Date.now() });
}

export function canStart(s = onlineState()) {
  if (!s.lobby || !s.isHost || s.lobby.status !== "open") return { ok: false, why: "" };
  if (s.seats.some((seat) => !seat)) return { ok: false, why: "Waiting for every seat to fill" };
  if (s.seats.some((seat) => seat.uid !== s.lobby.host && !seat.ready)) return { ok: false, why: "Waiting for everyone to be ready" };
  return { ok: true, why: "" };
}

export async function startOnline() {
  const { backend } = await need();
  const s = onlineState();
  if (!canStart(s).ok) return;
  const st = lobby.settings;
  const players = s.seats.map((seat) => ({ id: `g:${seat.uid}`, name: seat.name, ...(seat.call ? { call: seat.call } : {}) }));
  const id = `o_${code}_${Date.now().toString(36)}`;
  const mode = st.mode && st.mode !== "x01" ? st.mode : null;
  const cfg = mode
    ? createArcade({ kind: mode, players, options: st.arcade?.[mode] ?? {}, format: { type: st.formatType, legs: st.legs }, tie: st.tie ?? "sudden", firstPlayer: st.first, id })
    : createMatch({
        players,
        startScore: st.startScore,
        checkIn: st.checkIn,
        checkOut: st.checkOut,
        format: { type: st.formatType, legs: st.legs },
        firstPlayer: st.first,
        trackDoubles: st.trackDoubles,
        id,
      });
  await backend.updateLobby(code, {
    status: "playing",
    cfg,
    bull: null,
    rev: (lobby.rev ?? 0) + 1,
    events: [],
    turn: uidOf(cfg, whoThrows(cfg, []) ?? 0),
    lastBy: null,
    updatedAt: Date.now(),
  });
}

// Back to the lobby with the same seats (host).
export async function rematch() {
  const { backend } = await need();
  const s = onlineState();
  if (!s.isHost) return;
  const patch = { status: "open", cfg: null, events: [], rev: (lobby.rev ?? 0) + 1, turn: null, lastBy: null, updatedAt: Date.now() };
  s.seats.forEach((seat, i) => seat && (patch[`seats.${i}.ready`] = false));
  await backend.updateLobby(code, patch);
}

// Start the same match again from the first dart (host).
export async function restartMatch() {
  const { backend } = await need();
  if (!onlineState().isHost || !lobby?.cfg) return;
  // A restart throws for the bull again if that's how the match began.
  const firstPlayer = lobby.settings.first === "bull" ? null : lobby.cfg.firstPlayer;
  const cfg = { ...lobby.cfg, id: `o_${code}_${Date.now().toString(36)}`, createdAt: Date.now(), firstPlayer, ...(firstPlayer === null ? { bull: { throws: [], winner: null } } : {}) };
  await backend.updateLobby(code, { cfg, bull: null, events: [], rev: (lobby.rev ?? 0) + 1, turn: uidOf(cfg, whoThrows(cfg, []) ?? 0), lastBy: null, status: "playing", updatedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Throwing for the bull online: everyone places their own dart on their own phone.
// lobby.bull = { round, entrants: [player indexes], throws: { index: {x, y} } }
// ---------------------------------------------------------------------------

export function bullEntrants(l = lobby) {
  return l?.bull?.entrants ?? (l?.cfg ? bullThrowers(l.cfg) : []);
}

export async function throwBull(playerIndex, pos) {
  const { backend } = await need();
  const t = cleanThrow(pos);
  await backend.updateLobby(code, { [`bull.throws.${playerIndex}`]: t, updatedAt: Date.now() });
}

// The host's phone settles it once every dart is in. Resolves to the result, if any.
export async function settleBull() {
  const { backend } = await need();
  if (!onlineState().isHost) return null;
  return backend
    .lobbyTransaction(code, (l) => {
      if (!l?.cfg || !needsBull(l.cfg)) return null;
      const entrants = bullEntrants(l);
      const throws = l.bull?.throws ?? {};
      if (!entrants.every((i) => throws[i])) return null;
      const r = resolveBull(entrants.map((i) => throws[i]));
      if (r.tie) {
        // Only the tied players throw again.
        const tied = r.tied.map((k) => entrants[k]);
        return { bull: { round: (l.bull?.round ?? 0) + 1, entrants: tied, throws: {}, last: { throws, tied } }, updatedAt: Date.now() };
      }
      const winner = entrants[r.winner];
      const cfg = { ...l.cfg, firstPlayer: winner, bull: { throws: entrants.map((i) => ({ p: i, ...throws[i] })), winner } };
      return { cfg, turn: uidOf(cfg, winner), rev: (l.rev ?? 0) + 1, bull: { ...(l.bull ?? {}), done: true, throws }, updatedAt: Date.now() };
    })
    .catch(() => null);
}

// Change game (host): everyone goes back to the lobby with the new game picked,
// still marked ready, so the host can tweak the options and start straight away.
export async function changeGame(mode) {
  const { backend } = await need();
  if (!onlineState().isHost) return;
  await backend.updateLobby(code, { status: "open", "settings.mode": mode, cfg: null, bull: null, events: [], rev: (lobby.rev ?? 0) + 1, turn: null, lastBy: null, updatedAt: Date.now() });
}

// End it for everyone (host).
export async function closeLobby() {
  const { backend } = await need();
  if (onlineState().isHost) await backend.updateLobby(code, { status: "closed", updatedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Playing: the bridge the session uses
// ---------------------------------------------------------------------------

// Whether you can enter the next visit: your turn, or anyone can score.
export function canScoreNow() {
  if (!lobby || lobby.status !== "playing") return false;
  return Boolean(lobby.settings?.anyoneScores) || lobby.turn === me();
}

export function canUndoNow() {
  if (!lobby?.events?.length) return false;
  return Boolean(lobby.settings?.anyoneScores) || lobby.events[lobby.events.length - 1].by === me();
}

function turnAfter(cfg, events) {
  const p = whoThrows(cfg, events);
  return p === null ? null : uidOf(cfg, p);
}

async function append(event, expected) {
  const { backend, uid } = await need();
  let conflict = false;
  const patch = await backend.lobbyTransaction(code, (l) => {
    if (!l || l.status !== "playing") throw new Error("This match has ended.");
    if (!l.settings.anyoneScores && l.turn !== uid) throw new Error("It's not your turn.");
    if (l.events.length !== expected) {
      conflict = true;
      return null;
    }
    const events = [...l.events, { ...event, by: uid }];
    return { events, rev: (l.rev ?? 0) + 1, turn: turnAfter(l.cfg, events), lastBy: uid, updatedAt: Date.now() };
  });
  if (conflict) {
    const latest = await backend.getLobby(code);
    const err = new Error("Someone else entered that visit first.");
    err.events = latest?.events ?? [];
    err.rev = latest?.rev;
    throw err;
  }
  return { events: patch.events, rev: patch.rev };
}

async function undoRemote() {
  const { backend, uid } = await need();
  const patch = await backend.lobbyTransaction(code, (l) => {
    if (!l || !l.events.length) return null;
    const last = l.events[l.events.length - 1];
    if (!l.settings.anyoneScores && last.by !== uid) throw new Error("Only the player who threw it can undo that.");
    const events = l.events.slice(0, -1);
    return { events, rev: (l.rev ?? 0) + 1, turn: turnAfter(l.cfg, events), lastBy: events.length ? events[events.length - 1].by ?? null : null, updatedAt: Date.now() };
  });
  return patch ? { events: patch.events, rev: patch.rev } : { events: lobby?.events ?? [], rev: lobby?.rev };
}

setOnlineBridge({ append, undo: undoRemote });

// ---------------------------------------------------------------------------
// Chat and invites
// ---------------------------------------------------------------------------

export async function sendChat(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 280);
  if (!clean || !code) return;
  const { backend, uid } = await need();
  await backend.sendChat(code, { uid, name: myCard()?.name ?? getOwner().name, text: clean, at: Date.now() });
}

export async function inviteFriend(friendUid) {
  const { backend, uid } = await need();
  if (!code) await hostLobby();
  const card = myCard();
  await backend.sendInvite({ from: uid, fromName: card.name, fromPhoto: card.photoURL, to: friendUid, code, at: Date.now() });
  return code;
}

export async function dismissInvite(id) {
  const { backend } = await need();
  await backend.deleteInvite(id).catch(() => {});
}

// Lobbies you're seated in (open or playing), for rejoining.
export async function myOpenLobbies() {
  const { backend, uid } = await need();
  return (await backend.myLobbies(uid)).filter((l) => l.status !== "closed" && l.members.includes(uid));
}

// ---------------------------------------------------------------------------
// Following your account
// ---------------------------------------------------------------------------

let accountUid = undefined;
async function onAccount(s) {
  const uid = s.user?.uid ?? null;
  if (uid === accountUid) return; // same person, nothing to redo
  accountUid = uid;
  stopInvites?.();
  stopInvites = null;
  invites = [];
  if (!s.user) {
    if (code) stepAway();
    return emit("signed-out");
  }
  const backend = await getBackend();
  stopInvites = backend?.watchInvites(s.user.uid, (list) => {
    invites = list.filter((i) => Date.now() - (i.at ?? 0) < 6 * 60 * 60 * 1000); // six hours
    emit("invites");
  });
  // Reconnect to the lobby you were in.
  if (code && !stopLobby) openLobby(code).catch(() => forget("gone"));
}
onAccountChange((s) => s.status !== "loading" && s.status !== "syncing" && onAccount(s));
