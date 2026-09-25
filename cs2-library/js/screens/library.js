// screens/library.js
// The maps, as a grid of tiles. Tap one to open it.

import { h } from "../ui/dom.js";
import { MAPS, imageSrc } from "../data/maps.js";
import { TYPES } from "../data/tags.js";
import { nadeIconEl } from "./parts/nadeIcons.js";
import { listLineups } from "../services/library.js";

export async function libraryScreen() {
  const all = await listLineups();
  const count = (id) => all.filter((l) => l.map === id).length;
  const byType = (id, type) => all.filter((l) => l.map === id && l.type === type).length;
  const el = h(
    "main",
    { class: "page cs-page" },
    h("header", { class: "cs-head" }, h("h1", { class: "cs-title" }, "Library")),
    h(
      "div",
      { class: "maps" },
      MAPS.map((m) => {
        return h(
          "a",
          { class: "maptile", href: `#/library/${m.id}` },
          imageSrc(h("img", { class: "maptile__bg", alt: "", loading: "lazy" }), m.thumb),
          h("span", { class: "maptile__shade", "aria-hidden": "true" }),
          imageSrc(h("img", { class: "maptile__icon", alt: "", loading: "lazy" }), m.icon),
          h("span", { class: "maptile__name" }, m.name),
          // Each grenade's count, with its icon.
          h(
            "span",
            { class: "maptile__counts", "aria-label": TYPES.map((t) => `${byType(m.id, t.id)} ${t.name.toLowerCase()}`).join(", ") },
            TYPES.map((t) => h("span", { class: ["maptile__count", byType(m.id, t.id) && "has-some"] }, nadeIconEl(t.id, 16), h("span", { class: "num" }, byType(m.id, t.id))))
          )
        );
      })
    )
  );
  return { el, title: "Library" };
}
