// engine/arcade/core.js
// Every arcade game runs through here. A match is its settings plus a list of
// events (like X01), replayed from the start:
//   { p, s: 60 }                  a visit total (High Score, Race)
//   { p, d: ["S4", "D5", "M"] }   a visit's darts (the target pad games)
//   { p, bt: { x, y } }           a tie-break dart at the bull
//
// Fairness rules:
//   - Everyone gets the same number of visits: wins are only checked at the end
//     of a full round.
//   - Several players finishing in the same round, or level when the rounds run
//     out, is a tie, settled by the match's tie rule:
//       sudden   the tied players throw one more visit each; best visit wins
//       bull     the tied players throw for the bull; closest wins (ties rethrow)
//       starter  whoever threw earliest in that game's order wins
//       allow    the game's a draw
//   - Each new game starts one place further round, so everyone leads off in turn.

import { MODES } from "./modes.js";
import { resolveBull, cleanThrow } from "../bull.js";
import { newId } from "../match.js";

export const isArcade = (cfg) => Boolean(cfg && MODES[cfg.kind]);

export function createArcade({ kind, players, options = {}, format = { type: "firstTo", legs: 1 }, tie = "sudden", firstPlayer = 0, id = newId("a"), createdAt = Date.now() }) {
  const mode = MODES[kind];
  if (!mode) throw new Error(`Unknown game: ${kind}`);
  if (!Array.isArray(players) || players.length < 1 || players.length > 4) throw new Error("1 to 4 players");
  const o = { ...mode.defaults, ...options };
  const n = players.length;
  const legs = Math.max(1, Math.min(21, Number(format?.legs) || 1));
  const type = n === 2 && format?.type === "bestOf" ? "bestOf" : "firstTo";
  let first = firstPlayer;
  let bull = null;
  if (first === "bull" && n > 1) {
    first = null;
    bull = { throws: [], winner: null };
  } else {
    if (first === "random" || first === "bull") first = Math.floor(Math.random() * n);
    first = Math.max(0, Math.min(n - 1, Number(first) || 0));
  }
  return {
    v: 1,
    id,
    kind,
    createdAt,
    options: o,
    tie: ["sudden", "bull", "starter", "allow"].includes(tie) ? tie : "sudden",
    format: { type, legs: type === "bestOf" && legs % 2 === 0 ? legs + 1 : legs },
    players: players.map((p, i) => ({ id: String(p.id || `guest:${i}`), name: String(p.name || `Player ${i + 1}`).slice(0, 20), ...(p.call ? { call: p.call } : {}) })),
    firstPlayer: first,
    ...(bull ? { bull } : {}),
  };
}

export function gamesToWin(cfg) {
  return cfg.format.type === "bestOf" ? Math.floor(cfg.format.legs / 2) + 1 : cfg.format.legs;
}

function newGame(cfg, index) {
  const n = cfg.players.length;
  const start = ((cfg.firstPlayer ?? 0) + index) % n;
  const order = Array.from({ length: n }, (_, k) => (start + k) % n);
  const mode = MODES[cfg.kind];
  return {
    index,
    order,
    phase: "play", // "play" | "sudden" | "bull" | "over"
    active: [...order], // who's still in (sudden death and bull narrow this)
    round: 0,
    pos: 0, // position in this round
    ps: cfg.players.map(() => mode.init(cfg.options)),
    visits: [], // { player, round, value, text, phase }
    roundValues: {}, // sudden death: this round's visit values
    bullThrows: {},
    result: null, // player index, or "draw"
    decidedBy: null, // "play" | "sudden" | "bull" | "starter" | "draw"
  };
}

const inOrder = (g) => g.order.filter((p) => g.active.includes(p));

// Who's up in this game: { player, kind: "visit" | "bull" } or null.
function turnIn(g) {
  if (g.phase === "over") return null;
  if (g.phase === "bull") {
    const p = inOrder(g).find((q) => !g.bullThrows[q]);
    return p === undefined ? null : { player: p, kind: "bull" };
  }
  return { player: inOrder(g)[g.pos], kind: "visit" };
}

function settleTie(cfg, g, tied, from) {
  if (tied.length === 1) return finishGame(g, tied[0], from);
  switch (cfg.tie) {
    case "allow":
      return finishGame(g, "draw", "draw");
    case "starter":
      return finishGame(g, g.order.find((p) => tied.includes(p)), "starter");
    case "bull":
      g.phase = "bull";
      g.active = tied;
      g.bullThrows = {};
      return;
    default:
      g.phase = "sudden";
      g.active = tied;
      g.round++;
      g.pos = 0;
      g.roundValues = {};
  }
}

function finishGame(g, result, by) {
  g.phase = "over";
  g.result = result;
  g.decidedBy = by;
}

// The end of a full round: has anyone won, or is it a tie?
function endOfRound(cfg, g) {
  const mode = MODES[cfg.kind];
  const o = cfg.options;
  if (g.phase === "sudden") {
    const best = Math.max(...g.active.map((p) => g.roundValues[p] ?? 0));
    const top = g.active.filter((p) => (g.roundValues[p] ?? 0) === best);
    if (top.length === 1) return finishGame(g, top[0], "sudden");
    if (cfg.tie === "sudden") {
      g.active = top;
      g.round++;
      g.pos = 0;
      g.roundValues = {};
      return;
    }
    return settleTie(cfg, g, top, "sudden");
  }
  const done = g.active.filter((p) => mode.done(g.ps[p], o));
  if (done.length) return settleTie(cfg, g, done, "play");
  const limit = mode.limit(o);
  if (limit && g.round + 1 >= limit) {
    const best = Math.max(...g.active.map((p) => mode.score(g.ps[p], o)));
    return settleTie(cfg, g, g.active.filter((p) => mode.score(g.ps[p], o) === best), "play");
  }
  g.round++;
  g.pos = 0;
}

export function replayArcade(cfg, events = []) {
  const mode = MODES[cfg.kind];
  const n = cfg.players.length;
  const need = gamesToWin(cfg);
  const state = { cfg, mode, games: [], gamesWon: Array(n).fill(0), draws: 0, finished: false, winner: null, applied: 0, rejected: [] };
  let g = newGame(cfg, 0);
  state.games.push(g);

  events.forEach((e, i) => {
    if (state.finished) return;
    const turn = turnIn(g);
    if (!turn) return;
    if (turn.kind === "bull") {
      if (!e.bt) return state.rejected.push(i);
      g.bullThrows[turn.player] = cleanThrow(e.bt);
      g.visits.push({ player: turn.player, round: g.round, phase: "bull", bull: g.bullThrows[turn.player], eventIndex: i, t: e.t ?? null });
      state.applied++;
      if (inOrder(g).every((p) => g.bullThrows[p])) {
        const entrants = inOrder(g);
        const r = resolveBull(entrants.map((p) => g.bullThrows[p]));
        if (r.tie) {
          g.active = r.tied.map((k) => entrants[k]);
          g.bullThrows = {};
        } else finishGame(g, entrants[r.winner], "bull");
      }
    } else {
      if (e.bt || (mode.input === "total" ? e.s === undefined : !Array.isArray(e.d))) return state.rejected.push(i);
      const out = mode.applyVisit(g.ps[turn.player], e, cfg.options);
      g.ps[turn.player] = out.ps;
      if (g.phase === "sudden") g.roundValues[turn.player] = out.value;
      g.visits.push({ player: turn.player, round: g.round, phase: g.phase, value: out.value, text: out.text, eventIndex: i, t: e.t ?? null, d: e.d, s: e.s });
      state.applied++;
      g.pos++;
      if (g.pos >= inOrder(g).length) endOfRound(cfg, g);
    }

    if (g.phase === "over") {
      if (g.result === "draw") state.draws++;
      else state.gamesWon[g.result]++;
      const played = state.games.length;
      const leader = state.gamesWon.indexOf(Math.max(...state.gamesWon));
      if (state.gamesWon[leader] >= need) {
        state.finished = true;
        state.winner = leader;
      } else if (g.result === "draw" && cfg.format.legs === 1) {
        // A one-game match that's drawn ends as a draw.
        state.finished = true;
        state.winner = null;
      } else if (cfg.format.type === "bestOf" && played >= cfg.format.legs) {
        // Best of N ran out (draws used games up): most games wins, or it's a draw.
        state.finished = true;
        const top = state.gamesWon.filter((w) => w === state.gamesWon[leader]).length;
        state.winner = top === 1 ? leader : null;
      } else {
        g = newGame(cfg, played);
        state.games.push(g);
      }
    }
  });

  state.game = g;
  state.turn = state.finished ? null : turnIn(g);
  return state;
}

// Whose turn it is for a config and events (for online turn-keeping).
export function arcadeTurn(cfg, events) {
  const st = replayArcade(cfg, events);
  return st.turn ? st.turn.player : null;
}

// A visit's darts, previewed before it's entered: the player's state afterwards,
// and whether the visit is over (three darts, or they've finished).
export function previewDarts(state, codes) {
  const g = state.game;
  const p = state.turn?.player;
  if (p === undefined || state.mode.input !== "darts") return null;
  const before = g.ps[p];
  const out = state.mode.applyVisit(before, { d: codes }, state.cfg.options);
  const finished = !state.mode.done(before, state.cfg.options) && state.mode.done(out.ps, state.cfg.options);
  return { ps: out.ps, value: out.value, over: codes.length >= 3 || finished };
}
