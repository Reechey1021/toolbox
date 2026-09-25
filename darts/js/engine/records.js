// engine/records.js
// Pure helpers for match records, used when your matches move into your account.

// Your matches were saved under this device's local id. Signing in gives you an
// id tied to your Google account, so every device agrees who "you" are.
export function rewritePlayerId(record, fromId, toId) {
  if (!fromId || fromId === toId) return record;
  const touches = record.cfg.players.some((p) => p.id === fromId);
  if (!touches && record.ownerId !== fromId) return record;
  return {
    ...record,
    ownerId: record.ownerId === fromId ? toId : record.ownerId,
    cfg: { ...record.cfg, players: record.cfg.players.map((p) => (p.id === fromId ? { ...p, id: toId } : p)) },
  };
}

// What to do to bring this device and your account in line.
//   local:   records on this device (localOnly ones stay here)
//   remote:  records in your account
//   deleted: ids deleted on some device
export function planSync({ local, remote, deleted = [] }) {
  const gone = new Set(deleted);
  const localIds = new Set(local.map((r) => r.id));
  const remoteIds = new Set(remote.map((r) => r.id));
  return {
    removeLocal: local.filter((r) => gone.has(r.id)).map((r) => r.id),
    addLocal: remote.filter((r) => !localIds.has(r.id) && !gone.has(r.id)),
    push: local.filter((r) => !remoteIds.has(r.id) && !gone.has(r.id) && !r.localOnly),
  };
}

// Profile fields that sync: whichever was changed most recently wins.
export const SYNCED_PROFILE = ["name", "callerName", "equipment", "friendCode"];

export function mergeProfile(local, remote) {
  if (!remote) return { profile: local, pushNeeded: true };
  if ((local.updatedAt ?? 0) > (remote.updatedAt ?? 0)) return { profile: local, pushNeeded: true };
  const merged = { ...local };
  for (const k of SYNCED_PROFILE) if (remote[k] !== undefined) merged[k] = remote[k];
  merged.updatedAt = remote.updatedAt ?? local.updatedAt;
  return { profile: merged, pushNeeded: false };
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

// One document per friendship, the same id whoever creates it.
export function pairId(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

// Friend codes: six characters with nothing easily confused (no 0/O, 1/I/L).
export const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function makeFriendCode(random = Math.random) {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return out;
}

// Whatever was typed or pasted (spaces, lower case, a whole link): the code, or null.
export function normaliseCode(input) {
  const raw = String(input || "").trim();
  const fromLink = /#\/add\/([A-Za-z0-9]+)/.exec(raw);
  const code = (fromLink ? fromLink[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_CHARS.includes(c)) ? code : null;
}

// The numbers friends can see on your profile: totals only, never your matches.
export function statsSummary(life) {
  const pick = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 100) / 100);
  return {
    matches: life.matches,
    avg: pick(life.avg),
    first9: pick(life.first9),
    checkoutPct: pick(life.checkoutPct),
    highestCheckout: life.highestCheckout || null,
    highest: life.highest || null,
    bestLeg: life.bestLeg,
    bestMatchAvg: pick(life.bestMatchAvg),
    s180: life.s180,
    s140: life.s140,
    s100: life.s100,
    legsWon: life.legsWon,
    darts: life.darts,
    wins: life.wins,
    contested: life.contested,
    nemesisWins: life.nemesisWins,
    nemesisPlayed: life.nemesisPlayed,
  };
}

// ---------------------------------------------------------------------------
// Whose match is it?
// ---------------------------------------------------------------------------
// Player ids: "g:<uid>" for an account, "local_<...>" for a device guest,
// anything else is a named guest ("guest:dave") or Nemesis.

const isIdentity = (id) => typeof id === "string" && (id.startsWith("g:") || id.startsWith("local_"));

export function involves(record, id) {
  return record.cfg.players.some((p) => p.id === id);
}

// Shown in your history: matches you played, plus matches with no one's
// identity in them at all (say, two guests on your phone). Matches that belong
// to a different account or the device guest stay out of sight.
export function visibleTo(record, ownerId) {
  if (involves(record, ownerId)) return true;
  return !record.cfg.players.some((p) => isIdentity(p.id));
}
