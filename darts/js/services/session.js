// services/session.js
// The match in progress. Two slots:
//   local    a match on this device (saved after every visit)
//   online   a mirror of an online lobby's match (the lobby is the truth)
// "current" says which one the game screen is showing. Your unfinished local
// match stays safe while you play online.
//
// When a match finishes it's filed into history straight away; undoing the
// winning visit pulls it back out.

import { kv, matches } from "./storage.js";
import { replayAny as replay } from "../engine/modes.js"; // X01 or arcade
import { getOwner } from "./profile.js";

const LOCAL_KEY = "activeMatch";
const ONLINE_KEY = "onlineMatch";
const CURRENT_KEY = "currentMatch";

let local = kv.get(LOCAL_KEY, null);
let online = kv.get(ONLINE_KEY, null);
let current = kv.get(CURRENT_KEY, "local");
const listeners = new Set();

// The online service plugs in here: append(event, expectedCount) and undo(),
// each resolving to the lobby's events afterwards.
let bridge = null;
export function setOnlineBridge(b) {
  bridge = b;
}

// Tells the game screen when someone else changed the online match.
export function onActiveChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  local ? kv.set(LOCAL_KEY, local) : kv.remove(LOCAL_KEY);
  online ? kv.set(ONLINE_KEY, online) : kv.remove(ONLINE_KEY);
  kv.set(CURRENT_KEY, current);
}

const cur = () => (current === "online" ? online : local);
function setCur(v) {
  if (current === "online") online = v;
  else local = v;
  persist();
}

export function getActive() {
  return cur();
}

export function activeState() {
  const a = cur();
  return a ? replay(a.cfg, a.events) : null;
}

export function isOnline() {
  return current === "online" && Boolean(online);
}

export function onlineCode() {
  return online?.online?.code ?? null;
}

export function startMatch(cfg) {
  local = { cfg, events: [], archived: false, startedAt: Date.now() };
  current = "local";
  persist();
  return activeState();
}

// Show the local match again (after leaving an online one).
export function useLocal() {
  current = "local";
  persist();
}

// ---------------------------------------------------------------------------
// Online mirror
// ---------------------------------------------------------------------------

export async function startOnlineMatch(cfg, events, code, rev) {
  if (online?.cfg.id !== cfg.id) online = { cfg, events: [], rev: -1, archived: false, startedAt: Date.now(), online: { code } };
  current = "online";
  persist();
  await applyRemoteEvents(code, events, rev);
  return activeState();
}

// The lobby's events arrived. Returns true if anything changed. Firebase can
// deliver an older copy after a newer one, so anything with a lower revision
// than we've already got is ignored.
export async function applyRemoteEvents(code, events, rev) {
  if (!online || online.online.code !== code) return false;
  if (Number.isInteger(rev) && Number.isInteger(online.rev) && rev < online.rev) return false;
  if (Number.isInteger(rev)) online = { ...online, rev };
  if (JSON.stringify(online.events) === JSON.stringify(events)) return (persist(), false);
  const before = replay(online.cfg, online.events);
  online = { ...online, events };
  persist();
  await settleHistory();
  const after = replay(online.cfg, online.events);
  for (const fn of listeners) fn({ before, after, remote: true });
  return true;
}

// Finished: in your history. Un-finished by an undo: back out of it.
async function settleHistory() {
  const a = cur();
  if (!a) return;
  const done = replay(a.cfg, a.events).finished;
  if (done && !a.archived) await archive();
  else if (!done && a.archived) {
    setCur({ ...a, archived: false });
    await matches.remove(a.cfg.id);
  }
}

// The lobby's match settings changed without a new match (the bull decided who starts).
export function updateOnlineCfg(code, cfg) {
  if (!online || online.online.code !== code || online.cfg.id !== cfg.id) return false;
  if (JSON.stringify(online.cfg) === JSON.stringify(cfg)) return false;
  const before = replay(online.cfg, online.events);
  online = { ...online, cfg };
  persist();
  const after = replay(online.cfg, online.events);
  for (const fn of listeners) fn({ before, after, remote: true, cfgChanged: true });
  return true;
}

export function leaveOnlineMatch() {
  online = null;
  current = "local";
  persist();
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

export async function pushEvent(event) {
  const a = cur();
  if (!a) throw new Error("No match in progress");
  if (isOnline()) {
    const code = onlineCode();
    try {
      const { events, rev } = await bridge.append(event, a.events.length); // the lobby afterwards
      await applyRemoteEvents(code, events, rev);
    } catch (err) {
      // Someone else got there first (or it's not your turn): show what the lobby has.
      if (err.events) await applyRemoteEvents(code, err.events, err.rev);
      throw err;
    }
    return activeState();
  }
  setCur({ ...a, events: [...a.events, event] });
  await settleHistory();
  return activeState();
}

export async function undo() {
  const a = cur();
  if (!a || a.events.length === 0) return activeState();
  if (isOnline()) {
    const { events, rev } = await bridge.undo();
    await applyRemoteEvents(onlineCode(), events, rev);
    return activeState();
  }
  setCur({ ...a, events: a.events.slice(0, -1) });
  await settleHistory();
  return activeState();
}

// Undo back to (and including) the last visit a human threw, taking Nemesis's
// replies with it, so it's always your turn again afterwards.
export async function undoLastHuman(isBotPlayer) {
  const a = cur();
  if (!a) return activeState();
  const lastHuman = a.events.map((e) => e.p).findLastIndex((p) => !isBotPlayer(p));
  if (lastHuman < 0) return activeState();
  let state = activeState();
  while (cur().events.length > lastHuman) state = await undo();
  return state;
}

export function hasHumanEvent(isBotPlayer) {
  return Boolean(cur()?.events.some((e) => !isBotPlayer(e.p)));
}

// Undo every visit in the current leg (local matches only).
export async function restartLeg() {
  const a = cur();
  if (!a || isOnline()) return activeState();
  const state = activeState();
  const leg = state.legs[state.legs.length - 1];
  const first = leg.visits[0]?.eventIndex;
  if (first === undefined) return state;
  setCur({ ...a, events: a.events.slice(0, first) });
  return activeState();
}

export function discardActive() {
  if (current === "online") leaveOnlineMatch();
  else {
    local = null;
    persist();
  }
}

// Signing in gives you a new player id; a local match in progress follows.
export function rewriteActivePlayerId(fromId, toId) {
  if (!local || !local.cfg.players.some((p) => p.id === fromId)) return;
  local = { ...local, cfg: { ...local.cfg, players: local.cfg.players.map((p) => (p.id === fromId ? { ...p, id: toId } : p)) } };
  persist();
}

// Throw for the bull: record every dart and who won, then the match can start.
export function setBullResult({ throws, winner }) {
  const a = cur();
  if (!a) return null;
  setCur({ ...a, cfg: { ...a.cfg, firstPlayer: winner, bull: { throws, winner } } });
  return activeState();
}

async function archive() {
  const a = cur();
  const record = {
    v: 1,
    id: a.cfg.id,
    cfg: a.cfg,
    events: a.events,
    startedAt: a.startedAt ?? a.cfg.createdAt,
    finishedAt: Date.now(),
    ownerId: getOwner()?.id ?? null,
    ...(a.online ? { online: a.online.code } : {}),
  };
  await matches.put(record);
  setCur({ ...a, archived: true });
  return record;
}
