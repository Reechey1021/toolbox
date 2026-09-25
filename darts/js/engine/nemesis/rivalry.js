// engine/nemesis/rivalry.js
// You versus Nemesis, from your match history: every finished match where you
// and Nemesis were on opposite sides.

import { replay, sideOfPlayer } from "../match.js";
import { matchStats } from "../stats.js";
import { isArcade } from "../arcade/core.js";

export function rivalry(records, ownerId) {
  const out = {
    matches: 0,
    youWon: 0,
    itWon: 0,
    legsYou: 0,
    legsIt: 0,
    you: { points: 0, darts: 0 },
    it: { points: 0, darts: 0 },
    streak: null, // { who: "you" | "nemesis", count }
    bestWin: null, // { avg, id, at }
    last: null, // most recent head-to-head record
  };
  const results = []; // "you" | "nemesis" | null, oldest first

  const sorted = [...records].sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  for (const rec of sorted) {
    if (isArcade(rec.cfg)) continue;
    const cfg = rec.cfg;
    const me = cfg.players.findIndex((p) => p.id === ownerId);
    const bot = cfg.players.findIndex((p) => p.bot);
    if (me < 0 || bot < 0) continue;
    const mySide = sideOfPlayer(cfg, me);
    const botSide = sideOfPlayer(cfg, bot);
    if (mySide === botSide) continue; // partners, not rivals

    const state = replay(cfg, rec.events);
    const stats = matchStats(state);
    out.matches++;
    out.legsYou += state.legsWon[mySide];
    out.legsIt += state.legsWon[botSide];
    out.you.points += stats[me].points;
    out.you.darts += stats[me].darts;
    out.it.points += stats[bot].points;
    out.it.darts += stats[bot].darts;
    out.last = rec;

    let result = null;
    if (state.winner === mySide) {
      out.youWon++;
      result = "you";
      const avg = stats[me].avg;
      if (avg !== null && (!out.bestWin || avg > out.bestWin.avg)) out.bestWin = { avg, id: rec.id, at: rec.finishedAt };
    } else if (state.winner === botSide) {
      out.itWon++;
      result = "nemesis";
    }
    results.push(result);
  }

  // Form guide: your last five results against Nemesis, oldest first.
  // "win" | "loss" | "other" (someone else in the match won it).
  out.form = results.slice(-5).map((r) => (r === "you" ? "win" : r === "nemesis" ? "loss" : "other"));

  // Current streak: the latest run of the same result, ignoring matches someone else won.
  const decided = results.filter(Boolean);
  if (decided.length) {
    const who = decided[decided.length - 1];
    let count = 0;
    for (let i = decided.length - 1; i >= 0 && decided[i] === who; i--) count++;
    out.streak = { who, count };
  }

  const avg = (x) => (x.darts ? (x.points / x.darts) * 3 : null);
  out.yourAvg = avg(out.you);
  out.itsAvg = avg(out.it);
  return out;
}
