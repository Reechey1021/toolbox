// screens/game/board.js
// The scoreboard: one card per side, plus the chalkboard-style leg log.
// A solo side shows one name; a team shows its partners, with the one throwing
// marked on the team that's up and the one throwing next on the team waiting.
// Pure rendering: takes state in, returns elements. No side effects.

import { h, fmt } from "../../ui/dom.js";
import { dartLabel } from "../../engine/board.js";
import { suggestCheckout } from "../../engine/checkouts.js";
import { goOverNeed } from "../../engine/rules.js";
import { sideDartsInLeg, sideName, nextThrowerFor } from "../../engine/match.js";
import { average } from "../../engine/stats.js";

const shown = (v) => (v.raw ?? v.counted); // what was actually thrown

// view: { state, stats, need, activeRemaining?, activeCheckedIn?, dartsLeft? }
export function playerCard(view, s) {
  const { state, stats, need } = view;
  const cfg = state.cfg;
  const leg = state.legs[state.legs.length - 1];
  const side = state.sides[s];
  const team = side.players.length > 1;
  const active = !state.finished && leg.current === s;

  let remaining = leg.remaining[s];
  let checkedIn = leg.checkedIn[s];
  let dartsLeft = 3;
  if (active && view.activeRemaining != null) {
    remaining = view.activeRemaining;
    checkedIn = view.activeCheckedIn;
    dartsLeft = view.dartsLeft;
  }

  const rules = state.rules[s];
  const over = rules.finish === "over";
  const route = over ? null : suggestCheckout(remaining, { checkOut: rules.checkOut, dartsLeft, checkedIn });
  // Going over: show how much they need rather than a route.
  const toFinish = over && checkedIn ? goOverNeed(remaining, rules.multiplier) : null;

  const mine = leg.visits.filter((v) => (v.side ?? v.player) === s);
  const last = mine[mine.length - 1];
  const lastText = !last ? "–" : last.bust ? "Bust" : String(shown(last));
  const h0 = side.handicap;
  const hcpLabel = h0 ? (h0.multiplier !== 1 ? `\u00d7${h0.multiplier}` : "H") : null;

  // The side's match average: every dart its players have thrown.
  const pts = side.players.reduce((a, p) => a + stats[p].points, 0);
  const darts = side.players.reduce((a, p) => a + stats[p].darts, 0);
  const avg = team ? average(pts, darts) : stats[side.players[0]].avg;

  const up = nextThrowerFor(state, s); // the thrower now, if this side is up
  const names = team
    ? h(
        "span",
        { class: "pc__names" },
        side.players.map((p) =>
          h(
            "span",
            { class: ["pc__member", p === up && (active ? "is-throwing" : "is-next")] },
            active && p === up ? h("span", { class: "pc__up", "aria-hidden": "true" }) : null,
            h("span", { class: "pc__nametext" }, cfg.players[p].name),
            !active && p === up ? h("span", { class: "pc__nexttag" }, "next") : null
          )
        ),
        hcpLabel ? h("span", { class: "pc__hcp", title: "Playing with a handicap" }, hcpLabel) : null
      )
    : h(
        "span",
        { class: "pc__name" },
        active ? h("span", { class: "pc__up", "aria-hidden": "true" }) : null,
        h("span", { class: "pc__nametext" }, cfg.players[side.players[0]].name),
        hcpLabel ? h("span", { class: "pc__hcp", title: "Playing with a handicap" }, hcpLabel) : null
      );

  const label = team ? sideName(cfg, s) : cfg.players[side.players[0]].name;

  return h(
    "article",
    {
      class: ["pc", team && "pc--team", active && "is-active", route && "has-route", remaining >= 1000 && "is-long"],
      "aria-current": active ? "true" : null,
      "aria-label": `${label}, ${remaining} left${active ? `, ${cfg.players[leg.thrower].name} throwing` : ""}`,
    },
    h("div", { class: "pc__top" }, names, state.sides.length > 1 || need > 1 ? legPips(state.legsWon[s], need) : null),
    h("div", { class: "pc__score num" }, remaining),
    h(
      "div",
      { class: "pc__route", "aria-label": route ? `Checkout: ${route.map(dartLabel).join(", ")}` : null },
      !checkedIn
        ? h("span", { class: "pc__note" }, "Needs a double to start")
        : route
          ? route.map((d) => h("span", { class: "pc__dart" }, dartLabel(d)))
          : toFinish !== null && toFinish <= 180
            ? h("span", { class: "pc__dart pc__dart--need" }, `Needs ${toFinish}`)
            : null
    ),
    h(
      "dl",
      { class: "pc__stats" },
      stat("Avg", fmt.avg(avg, 1)),
      stat("Darts", sideDartsInLeg(leg, s)),
      stat("Last", lastText)
    )
  );
}

function stat(label, value) {
  return h("div", { class: "pc__stat" }, h("dt", null, label), h("dd", { class: "num" }, value));
}

export function legPips(won, need) {
  if (need > 7) return h("span", { class: "pc__legs num", "aria-label": `${won} of ${need} legs` }, `${won}/${need}`);
  return h(
    "span",
    { class: "pc__legs", role: "img", "aria-label": `${won} of ${need} legs` },
    Array.from({ length: need }, (_, k) => h("span", { class: ["pip", k < won && "is-won"] }))
  );
}

// Chalkboard: one row per round, each side's score and what's left.
// In a team game each score is tagged with who threw it.
export function legLog(state, legIndex = state.legs.length - 1) {
  const cfg = state.cfg;
  const leg = state.legs[legIndex];
  const n = state.sides.length;
  const teams = state.sides.some((sd) => sd.players.length > 1);
  const rounds = Math.ceil(leg.visits.length / n);

  // Sides in throwing order starting from this leg's starter.
  const order = Array.from({ length: n }, (_, k) => (leg.starter + k) % n);
  const grid = Array.from({ length: rounds }, () => Array(n).fill(null));
  leg.visits.forEach((v, k) => (grid[Math.floor(k / n)][v.side ?? v.player] = v));

  const head = h(
    "tr",
    null,
    h("th", { scope: "col", class: "log__darts" }, h("span", { class: "visually-hidden" }, "Darts")),
    order.map((sd) => h("th", { scope: "col", colspan: 2 }, sideName(cfg, sd)))
  );

  const startRow = h(
    "tr",
    { class: "log__start" },
    h("td", { class: "log__darts" }),
    order.map((sd) => [h("td", { class: "log__scored" }), h("td", { class: "log__left num" }, state.rules[sd].startScore)])
  );

  const rows = grid.map((row, r) =>
    h(
      "tr",
      null,
      h("td", { class: "log__darts num" }, (r + 1) * 3),
      order.map((sd) => {
        const v = row[sd];
        if (!v) return [h("td", { class: "log__scored" }), h("td", { class: "log__left" })];
        const scored = v.bust ? h("span", { class: "log__bust" }, "Bust") : shown(v);
        const who = teams ? h("span", { class: "log__who" }, cfg.players[v.player].name.slice(0, 1)) : null;
        return [
          h("td", { class: ["log__scored num", v.checkout && "is-out", shown(v) >= 100 && !v.bust && "is-ton"] }, who, scored),
          h("td", { class: "log__left num" }, v.checkout ? "Out" : v.remaining),
        ];
      })
    )
  );

  const empty = leg.visits.length === 0 ? h("p", { class: "log__empty faint" }, "Scores for this leg will appear here.") : null;

  return h(
    "div",
    { class: "log" },
    h("table", { class: "log__table" }, h("thead", null, head), h("tbody", null, startRow, rows)),
    empty
  );
}
