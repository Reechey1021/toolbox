// ui/statsTable.js
// The side-by-side stats table (stat, then one column per player), and the
// Leg 1, Leg 2 ... Final tabs that switch between legs and the whole match.

import { h, fmt, replaceChildren } from "./dom.js";
import { matchStats, legStats } from "../engine/stats.js";

const ratio = (a, b) => (b > 0 ? a / b : null);

// [label, read(stats) -> comparable value, show(stats) -> text, better, only]
//   better: "high" | "low" | null      only: "final" | "doubleIn" | undefined
const ROWS = [
  ["Legs won", (s) => s.legsWon, (s) => fmt.int(s.legsWon), "high", "final"],
  ["3-dart average", (s) => s.avg, (s) => fmt.avg(s.avg), "high"],
  ["First 9 average", (s) => s.first9, (s) => fmt.avg(s.first9), "high"],
  ["Highest checkout", (s) => (s.handicapped ? null : s.highestCheckout || null), (s) => (s.handicapped ? "–" : fmt.int(s.highestCheckout || null)), "high"],
  ["Check-in", (s) => s.checkInPct, (s) => fmt.pct(s.checkInPct), "high", "doubleIn"],
  ["Checkout %", (s) => s.checkoutPct, (s) => fmt.pct(s.checkoutPct), "high"],
  ["Checkout success", (s) => ratio(s.checkouts, s.chances), (s) => (s.chances ? `${s.checkouts}/${s.chances}` : "–"), "high"],
  ["100+", (s) => s.s100, (s) => fmt.int(s.s100), "high"],
  ["140+", (s) => s.s140, (s) => fmt.int(s.s140), "high"],
  ["180s", (s) => s.s180, (s) => fmt.int(s.s180), "high"],
  ["Darts thrown", (s) => s.darts, (s) => fmt.int(s.darts), null],
  ["Highest score", (s) => s.highest || null, (s) => fmt.int(s.highest || null), "high"],
  ["Best leg", (s) => s.bestLeg, (s) => (s.bestLeg === null ? "–" : `${s.bestLeg} darts`), "low", "final"],
];

// Rows that belong to a team rather than a player: in team games they span the team.
const TEAM_ROWS = new Set(["Legs won", "Best leg"]);

function bestOf(vals, better) {
  const present = vals.filter((v) => v !== null && v !== undefined);
  if (!better || present.length < 2) return { best: null, allSame: false };
  const best = better === "high" ? Math.max(...present) : Math.min(...present);
  return { best, allSame: present.every((v) => v === present[0]) };
}

// scope: "final" for the whole match, or a leg index.
export function statsTable(state, scope = "final", { ownerId = null, compact = false } = {}) {
  const cfg = state.cfg;
  const stats = scope === "final" ? matchStats(state) : legStats(state, scope);
  const winnerSide = scope === "final" ? state.winner : state.legs[scope]?.winner ?? null;
  const doubleIn = state.rules.some((r) => r.checkIn === "double");
  const sides = state.sides;
  const teams = sides.some((sd) => sd.players.length > 1);
  const solo = sides.length === 1 && !teams;
  // Columns: players grouped by side, in side order.
  const cols = sides.flatMap((sd, si) => sd.players.map((p) => ({ p, side: si })));

  const rows = ROWS.filter(([, , , , only]) => {
    if (only === "final") return scope === "final";
    if (only === "doubleIn") return doubleIn;
    return true;
  }).filter(([label]) => !(solo && label === "Legs won"));

  const nameHead = (c) =>
    h(
      "th",
      { scope: "col", class: [c.side === winnerSide && "is-winner"], title: cfg.players[c.p].name },
      h("span", { class: "cmp__name" }, cfg.players[c.p].name),
      !teams && cfg.players[c.p].handicap ? h("span", { class: "cmp__hcp", title: "Playing with a handicap" }, "H") : null,
      cfg.players[c.p].id === ownerId ? h("span", { class: "visually-hidden" }, " (you)") : null
    );

  const teamHead = teams
    ? h(
        "tr",
        { class: "cmp__teams" },
        h("th", { scope: "col" }, h("span", { class: "visually-hidden" }, "Team")),
        sides.map((sd, si) =>
          h(
            "th",
            { scope: "colgroup", colspan: sd.players.length, class: ["cmp__team", si === winnerSide && "is-winner"] },
            `Team ${si + 1}`,
            sd.handicap ? h("span", { class: "cmp__hcp", title: "Playing with a handicap" }, "H") : null
          )
        )
      )
    : null;

  const body = rows.map(([label, read, show, better]) => {
    if (teams && TEAM_ROWS.has(label)) {
      // One cell per team, spanning its players.
      const firstOf = sides.map((sd) => stats[sd.players[0]]);
      const vals = firstOf.map(read);
      const { best, allSame } = bestOf(vals, better);
      return h(
        "tr",
        null,
        h("th", { scope: "row" }, label),
        sides.map((sd, si) =>
          h("td", { colspan: sd.players.length, class: ["num", "cmp__span", !allSame && best !== null && vals[si] === best && "is-best"] }, show(firstOf[si]))
        )
      );
    }
    const vals = cols.map((c) => read(stats[c.p]));
    const { best, allSame } = bestOf(vals, better);
    return h(
      "tr",
      null,
      h("th", { scope: "row" }, label),
      cols.map((c, k) => h("td", { class: ["num", c.side !== cols[k - 1]?.side && k > 0 && "cmp__split", !allSame && best !== null && vals[k] === best && "is-best"] }, show(stats[c.p])))
    );
  });

  return h(
    "div",
    { class: ["cmp-wrap", compact && "cmp-wrap--compact"] },
    h(
      "table",
      { class: ["cmp", solo && "cmp--solo", teams && "cmp--teams"], dataset: { cols: String(cols.length) } },
      h("thead", null, teamHead, h("tr", null, h("th", { scope: "col" }, h("span", { class: "visually-hidden" }, "Stat")), cols.map(nameHead))),
      h("tbody", null, body)
    )
  );
}

// Tabs across the top: Leg 1, Leg 2 ... Final. Final is selected by default.
export function statsTabs(state, { ownerId = null } = {}) {
  const legs = state.legs.filter((l) => l.visits.length > 0);
  const panel = h("div", { class: "tabs__panel", role: "tabpanel" });

  if (legs.length < 2) {
    panel.append(statsTable(state, "final", { ownerId }));
    return h("div", { class: "stats-tabs" }, panel);
  }

  const options = [...legs.map((l) => ({ key: l.index, label: `Leg ${l.index + 1}` })), { key: "final", label: "Final" }];
  let selected = "final";

  const buttons = options.map((o) =>
    h(
      "button",
      {
        type: "button",
        role: "tab",
        class: "tabs__tab",
        "aria-selected": String(o.key === selected),
        onclick: () => select(o.key),
      },
      o.label
    )
  );
  const strip = h("div", { class: "tabs", role: "tablist", "aria-label": "Stats for" }, buttons);

  strip.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = options.findIndex((o) => o.key === selected);
    const next = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
    e.preventDefault();
    select(next.key);
    buttons[options.indexOf(next)].focus();
  });

  function select(key) {
    selected = key;
    buttons.forEach((b, i) => b.setAttribute("aria-selected", String(options[i].key === key)));
    replaceChildren(panel, statsTable(state, key, { ownerId }));
    // Keep the chosen tab in view on narrow screens.
    buttons[options.findIndex((o) => o.key === key)].scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  select("final");
  return h("div", { class: "stats-tabs" }, strip, panel);
}
