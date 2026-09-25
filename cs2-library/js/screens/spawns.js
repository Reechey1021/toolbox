// screens/spawns.js
// A map's spawns for practice: T and CT side by side, each numbered on the map
// with its setpos command to copy (all of them, or as binds).

import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/components.js";
import { mapById } from "../data/maps.js";
import { getSpawns } from "../services/spawns.js";
import { listLineups } from "../services/library.js";
import { createSpawnPanel } from "./parts/spawnPanel.js";

const setpos = (s) => (s.world ? `setpos ${s.world.x} ${s.world.y} ${s.world.z}` : null);

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`, { tone: "ok" });
  } catch {
    toast("Couldn't copy: select it instead", { tone: "bad" });
  }
}

export async function spawnsScreen({ map: mapId }) {
  const map = mapById(mapId);
  if (!map) return { el: h("main", { class: "page cs-page" }, h("a", { href: "#/library" }, "Back to the library")) };
  const lineups = await listLineups(map.id);
  const panels = [];

  async function column(side) {
    const panel = createSpawnPanel(map, side, { lineups });
    panels.push(panel);
    const spawns = await getSpawns(map.id, side);
    const lines = spawns.map(setpos).filter(Boolean);
    const prefix = side === "T" ? "t" : "ct";
    return h(
      "section",
      { class: `spawncol spawncol--${prefix}` },
      h("div", { class: "spawncol__head" }, h("h2", { class: "spawncol__title" }, h("span", { class: `sidetag sidetag--${prefix}` }, side), `${side} spawns`, h("span", { class: "spawncol__count" }, spawns.length))),
      panel.el,
      h(
        "ol",
        { class: "setposlist" },
        spawns.map((s) =>
          h(
            "li",
            { class: "setposrow", onpointerenter: () => panel.select(s.n), onpointerleave: () => panel.select(null) },
            h("span", { class: `setposrow__n spawnbadge--${prefix}` }, s.n),
            h("code", { class: "setposrow__cmd" }, setpos(s) ?? "(placed by hand: no setpos)"),
            setpos(s) ? h("button", { class: "icon-btn setposrow__copy", type: "button", "aria-label": `Copy spawn ${s.n}`, onclick: () => copy(setpos(s), `${side} spawn ${s.n}`) }, icon("copy", { size: 16 })) : null
          )
        )
      ),
      lines.length
        ? h(
            "div",
            { class: "btn-row setposall" },
            h("button", { class: "btn btn--quiet", type: "button", onclick: () => copy(lines.join("\n"), `All ${side} spawns`) }, "Copy all"),
            h("button", { class: "btn btn--quiet", type: "button", onclick: () => copy(spawns.filter((s) => s.world).map((s) => `alias ${prefix}${s.n} "${setpos(s)}"`).join("\n"), `${side} binds`) }, "Copy as binds")
          )
        : null
    );
  }

  const el = h(
    "main",
    { class: "page cs-page spawnspage" },
    h("header", { class: "cs-head cs-head--row" }, h("a", { class: "icon-btn", href: `#/library/${map.id}`, "aria-label": `Back to ${map.name}` }, icon("back")), h("h1", { class: "cs-title" }, `${map.name} spawns`)),
    h("p", { class: "muted spawnspage__lead" }, "Turn on sv_cheats 1 in a practice server, then paste a setpos to stand exactly on that spawn. Numbers match the voice assistant: \u201cspawn 2 window smoke\u201d."),
    h("div", { class: "spawngrid" }, await column("T"), await column("CT"))
  );
  return { el, title: `${map.name} spawns`, destroy: () => panels.forEach((p) => p.destroy()) };
}
