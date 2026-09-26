// screens/content.js
// Your content: what you uploaded, favourited, or named. A list to browse, with
// its own filters (map, side, utility, which lists), separate from everywhere else.

import { h, replaceChildren } from "../ui/dom.js";
import { MAPS, mapById, imageSrc } from "../data/maps.js";
import { TYPES, typeById } from "../data/tags.js";
import { throwLabel } from "../data/lineups.js";
import { listLineups, onLibraryChange } from "../services/library.js";
import { accountState, onAccount, isFavourite, customName } from "../services/account.js";
import { nadeIconEl } from "./parts/nadeIcons.js";
import { openPlayer } from "./player.js";

export async function contentScreen() {
  const f = { map: "all", side: "all", type: "all", show: "all" };
  const lists = h("div", { class: "cm__lists" });
  let all = [];

  const sel = (label, key, options) =>
    h(
      "label",
      { class: "addfield cm__filter" },
      h("span", { class: "addfield__label" }, label),
      h("select", { class: "field select", "aria-label": label, onchange: (e) => ((f[key] = e.target.value), paint()) }, options.map(([v, n]) => h("option", { value: v, selected: f[key] === v }, n)))
    );

  function card(l) {
    const map = mapById(l.map);
    const name = customName(l.id);
    return h(
      "button",
      { class: "spotcard cm__card", type: "button", onclick: () => openPlayer(l) },
      map ? imageSrc(h("img", { class: "cm__mapicon", alt: map.name, loading: "lazy" }), map.icon) : null,
      h(
        "span",
        { class: "spotcard__body" },
        h("span", { class: "spotcard__title" }, isFavourite(l.id) ? h("span", { class: "favstar", "aria-label": "Favourite" }, "\u2605") : null, name ? `${name} \u00b7 ` : "", l.name || "Untitled", h("span", { class: "spotcard__by" }, ` ${map?.name ?? ""}`)),
        h(
          "span",
          { class: "spotcard__tags" },
          h("span", { class: `sidetag sidetag--${l.side === "T" ? "t" : l.side === "CT" ? "ct" : "both"}` }, l.side === "both" ? "T/CT" : l.side),
          h("span", { class: "callpill" }, l.spawn ? `Spawn ${l.spawn}` : l.origin),
          h("span", { class: "spotcard__arrow", "aria-hidden": "true" }, "\u203a"),
          l.type === "group" ? h("span", { class: "callpill callpill--group" }, `${(l.items || []).length} utility`) : h("span", { class: "callpill" }, l.dest),
          throwLabel(l) ? h("span", { class: "spotcard__throw" }, throwLabel(l)) : null
        )
      ),
      nadeIconEl(l.type, 30)
    );
  }

  function paint() {
    const me = accountState().user?.uid;
    const pass = (l) => (f.map === "all" || l.map === f.map) && (f.side === "all" || l.side === f.side || l.side === "both") && (f.type === "all" || l.type === f.type);
    const sections = [
      ["uploads", "Your uploads", (l) => l.source === "device" || (me && l.authorUid === me)],
      ["favs", "Favourites", (l) => isFavourite(l.id)],
      ["named", "Named lineups", (l) => Boolean(customName(l.id))],
    ].filter(([id]) => f.show === "all" || f.show === id);
    replaceChildren(
      lists,
      ...sections.map(([id, title, test]) => {
        const rows = all.filter((l) => test(l) && pass(l));
        return h(
          "section",
          { class: "cm__section" },
          h("h2", { class: "cm__title" }, title, h("span", { class: "cm__count" }, rows.length)),
          rows.length ? h("div", { class: "cm__list" }, rows.map(card)) : h("p", { class: "muted cm__empty" }, id === "named" ? "Give a lineup a custom name from its clip (next to Favourite)." : id === "favs" ? "Star lineups from their clip to see them here." : "Lineups you add appear here.")
        );
      })
    );
  }

  async function load() {
    all = (await listLineups()).sort((a, b) => a.map.localeCompare(b.map) || (a.name || "").localeCompare(b.name || ""));
    paint();
  }
  const off = onLibraryChange(load);
  const offA = onAccount(paint);
  await load();

  const el = h(
    "main",
    { class: "page cs-page cm" },
    h("header", { class: "cs-head" }, h("p", { class: "cs-kicker" }, "Yours"), h("h1", { class: "cs-title" }, "Content manager")),
    h(
      "div",
      { class: "cm__filters" },
      sel("Show", "show", [["all", "Everything"], ["uploads", "Your uploads"], ["favs", "Favourites"], ["named", "Named lineups"]]),
      sel("Map", "map", [["all", "All maps"], ...MAPS.map((m) => [m.id, m.name])]),
      sel("Side", "side", [["all", "T and CT"], ["T", "T side"], ["CT", "CT side"]]),
      sel("Utility", "type", [["all", "All utility"], ...TYPES.map((t) => [t.id, t.name])])
    ),
    lists
  );
  return { el, title: "Content manager", destroy: () => (off(), offA()) };
}
