// screens/history.js

import { h, fmt } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { topBar } from "../ui/components.js";
import { matches } from "../services/storage.js";
import { getOwner } from "../services/profile.js";
import { replay, describeFormat, sideName, sideOfPlayer, isTeamMatch } from "../engine/match.js";
import { matchStats } from "../engine/stats.js";
import { visibleTo } from "../engine/records.js";
import { isArcade, replayArcade } from "../engine/arcade/core.js";

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

// params.filter === "nemesis": only matches you played against Nemesis.
export async function historyScreen(params = {}) {
  const owner = getOwner();
  const nemesisOnly = params.filter === "nemesis";
  const all = await matches.list();
  const records = nemesisOnly
    ? all.filter((r) => {
        const me = r.cfg.players.findIndex((p) => p.id === owner.id);
        const bot = r.cfg.players.findIndex((p) => p.bot);
        return me >= 0 && bot >= 0 && sideOfPlayer(r.cfg, me) !== sideOfPlayer(r.cfg, bot);
      })
    : all.filter((r) => visibleTo(r, owner.id));
  const title = nemesisOnly ? "Against Nemesis" : "History";
  const back = nemesisOnly ? "#/nemesis" : "#/";

  if (!records.length) {
    const el = h(
      "main",
      { class: "page" },
      topBar({ title, back }),
      h(
        "div",
        { class: "empty section--first" },
        h("h2", null, "Nothing here yet"),
        h("p", null, "Every match you finish is kept here, with the full scoresheet."),
        h("a", { class: "btn btn--primary", href: "#/setup" }, "Start a match")
      )
    );
    return { el, title: "History" };
  }

  const groups = new Map();
  for (const r of records) {
    const key = dayLabel(r.finishedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const el = h(
    "main",
    { class: "page history" },
    topBar({ title, sub: `${records.length} ${records.length === 1 ? "match" : "matches"}`, back }),
    [...groups].map(([label, list]) =>
      h("section", { class: "section" }, h("h2", { class: "history__day" }, label), h("div", { class: "rows" }, list.map((r) => matchRow(r, owner))))
    )
  );
  return { el, title: "History" };
}

// An arcade game in the list: the game, who played, and how it ended.
function arcadeRow(r, owner) {
  const st = replayArcade(r.cfg, r.events);
  const me = r.cfg.players.findIndex((p) => p.id === owner.id);
  const others = r.cfg.players.filter((_, i) => i !== me).map((p) => p.name);
  const title = r.cfg.players.length === 1 ? st.mode.name : me >= 0 ? `${st.mode.name} vs ${others.join(", ")}` : st.mode.name;
  const tag =
    r.cfg.players.length > 1 && me >= 0 && st.finished
      ? st.winner === null
        ? h("span", { class: "tag" }, "Draw")
        : st.winner === me
          ? h("span", { class: "tag tag--win" }, "Won")
          : h("span", { class: "tag tag--loss" }, "Lost")
      : null;
  return h(
    "a",
    { class: "row match", href: `#/history/${encodeURIComponent(r.id)}` },
    h("span", { class: "row__text" }, h("span", { class: "row__label" }, title, tag), h("span", { class: "row__hint" }, `${st.mode.describe(r.cfg.options)}, ${fmt.time(r.finishedAt)}`)),
    h("span", { class: "match__score" }, h("span", { class: "num match__legs" }, r.cfg.players.length > 1 ? st.gamesWon.join("–") : "")),
    h("span", { class: "row__chev" }, icon("chevron", { size: 18 }))
  );
}

export function matchRow(r, owner) {
  if (isArcade(r.cfg)) return arcadeRow(r, owner);
  const cfg = r.cfg;
  const state = replay(cfg, r.events);
  const stats = matchStats(state);
  const me = cfg.players.findIndex((p) => p.id === owner.id);
  const mySide = me >= 0 ? sideOfPlayer(cfg, me) : -1;
  const others = cfg.players.filter((_, i) => i !== me).map((p) => p.name);

  let title;
  if (state.sides.length === 1) title = me === 0 ? "Practice" : cfg.players[0].name;
  else if (isTeamMatch(cfg)) title = `${sideName(cfg, 0)} vs ${sideName(cfg, 1)}`;
  else if (me >= 0) title = `vs ${joinNames(others)}`;
  else title = joinNames(cfg.players.map((p) => p.name));

  let tag = null;
  if (state.sides.length > 1 && me >= 0 && state.winner !== null) {
    tag = state.winner === mySide ? h("span", { class: "tag tag--win" }, "Won") : h("span", { class: "tag tag--loss" }, "Lost");
  }

  const score = state.sides.length > 1 ? state.legsWon.join("–") : ((n) => `${n} ${n === 1 ? "leg" : "legs"}`)(state.legs.filter((l) => l.winner !== null).length);
  const avg = me >= 0 ? stats[me].avg : stats[state.sides[state.winner ?? 0].players[0]].avg;

  return h(
    "a",
    { class: "row row--link match", href: `#/history/${encodeURIComponent(r.id)}` },
    h(
      "span",
      { class: "row__text" },
      h("span", { class: "row__label" }, title),
      h("span", { class: "row__hint" }, `${cfg.startScore}, ${describeFormat(cfg).toLowerCase()}, ${fmt.time(r.finishedAt)}`)
    ),
    h("span", { class: "match__right" }, tag, h("span", { class: "match__score num" }, score), h("span", { class: "match__avg num" }, `${fmt.avg(avg, 1)} avg`)),
    h("span", { class: "row__chev" }, icon("chevron", { size: 18 }))
  );
}

function joinNames(names) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
