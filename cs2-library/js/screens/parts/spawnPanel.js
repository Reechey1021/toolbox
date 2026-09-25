// screens/parts/spawnPanel.js
// A close-up of one side's spawns, numbered. Instant smokes are thrown straight
// from a spawn, so the number is how you ask for them: "spawn 2 window smoke".
//
//   onPick(n, spawn)   pick mode (Add content): choosing the spawn a lineup is from
//   (no onPick)        library mode (Voice tab): each spawn shows its instant
//                      lineups; click one to choose which to watch
// Setting spawns up: stand on each spawn in a practice server, getpos, paste.

import { h, replaceChildren } from "../../ui/dom.js";
import { toast } from "../../ui/components.js";
import { parseGetpos, worldToRadar, onRadar, levelFor } from "../../data/lineups.js";
import { getSpawns, saveSpawns, spawnsShared, onSpawns } from "../../services/spawns.js";
import { cloudAvailable } from "../../services/cloud.js";
import { accountState } from "../../services/account.js";
import { createMapCanvas, dot, svgEl } from "./mapCanvas.js";
import { nadeIconEl } from "./nadeIcons.js";
import { openPlayer } from "../player.js";

export function createSpawnPanel(map, side, { onPick = null, selected = null, lineups = [] } = {}) {
  let spawns = [];
  let editing = false;
  let chosen = selected;
  let list = lineups;
  const canvas = createMapCanvas({ radar: map.radar, label: `${map.name} ${side} spawns`, onTap: (pos, _e, target) => tapped(pos, target) });
  const hint = h("p", { class: "spawn__hint muted" });
  const tools = h("div", { class: "spawn__tools" });
  const menu = h("div", { class: "spotmenu spawn__menu", hidden: true });
  const el = h("section", { class: `spawn spawn--${side === "T" ? "t" : "ct"}` }, h("div", { class: "spawn__head" }, h("h3", { class: "spawn__title" }, `${side} spawns`), tools), hint, h("div", { class: "spawn__map" }, canvas.el, menu));

  const canEdit = () => !cloudAvailable() || accountState().status === "offline" || spawnsShared();
  const instantAt = (n) => list.filter((l) => l.map === map.id && l.spawn === n && (l.side === side || l.side === "both"));

  function render() {
    canvas.layers.dots.replaceChildren(
      ...spawns.map((s) => {
        const count = instantAt(s.n).length;
        const g = svgEl("g", { class: ["spawnpt", chosen === s.n && "is-chosen", count && "has-some"].filter(Boolean).join(" "), "data-n": s.n, tabindex: 0, role: "button", "aria-label": `Spawn ${s.n}${count ? `, ${count} instant ${count === 1 ? "lineup" : "lineups"}` : ""}` });
        // Sized for the panel: about 22px across on screen, whatever the zoom.
        // The square map is scaled to the panel's smaller side.
        const unit = 1000 / Math.max(160, Math.min(canvas.el.clientWidth || 400, canvas.el.clientHeight || 260));
        g.append(dot(s, "spawnpt__disc", 11 * unit));
        const t = svgEl("text", { x: s.x * 1000, y: s.y * 1000, "data-fs": 13 * unit, class: "spawnpt__n", "text-anchor": "middle", "dominant-baseline": "central" });
        t.textContent = String(s.n);
        g.append(t);
        g.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), choose(s.n)));
        return g;
      })
    );
    if (spawns.length) {
      const xs = spawns.map((s) => s.x);
      const ys = spawns.map((s) => s.y);
      // Like NadesDB: the spawns with the area around them.
      canvas.fitTo({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, 0.06, 0.2);
      // Vertigo's T spawns are on the lower level.
      const z = spawns[0]?.world?.z;
      canvas.setRadar(map.lowerRadar && levelFor(map, z) === "lower" ? map.lowerRadar : map.radar);
    } else canvas.reset();
    canvas.refresh();

    hint.textContent = editing
      ? "Stand on each spawn in a practice server, type getpos in the console and paste it below: spawn 1, then 2, and so on. Or tap the map. Everyone uses these numbers, so keep the order sensible (left to right, say)."
      : !spawns.length
        ? `No ${side} spawns set on ${map.name} yet.${canEdit() ? " Set them up once and they're numbered for everyone." : " A contributor can set them up."}`
        : onPick
          ? "Pick the spawn this lineup is thrown from."
          : `Say \u201cspawn 2 window smoke\u201d, or click a spawn for its instant lineups.`;

    const getpos = h("input", { class: "field stepbody__getpos", type: "text", placeholder: "setpos … ;setang …", "aria-label": `Paste getpos for spawn ${spawns.length + 1}` });
    const add = () => {
      const g = parseGetpos(getpos.value);
      if (!g) return toast("That doesn't look like getpos output.", { tone: "bad" });
      const pos = worldToRadar(map, g);
      if (!onRadar(pos)) return toast("That's off this map's radar. Right map?", { tone: "bad" });
      addSpawn({ ...pos, world: g });
    };
    getpos.addEventListener("change", add);
    getpos.addEventListener("paste", () => setTimeout(add, 0));
    replaceChildren(
      tools,
      editing
        ? [
            h("div", { class: "stepbody__row spawn__add" }, h("span", { class: "stepbody__label" }, `Spawn ${spawns.length + 1}`), getpos),
            spawns.length ? h("button", { class: "btn btn--quiet spawn__btn", type: "button", onclick: () => update(spawns.slice(0, -1)) }, "Undo last") : null,
            h("button", { class: "btn btn--primary spawn__btn", type: "button", onclick: () => ((editing = false), render()) }, "Done"),
          ]
        : canEdit()
          ? h("button", { class: "btn btn--quiet spawn__btn", type: "button", onclick: () => ((editing = true), render()) }, spawns.length ? "Edit spawns" : "Set up spawns")
          : null
    );
  }

  async function update(next) {
    try {
      spawns = await saveSpawns(map.id, side, next);
    } catch (err) {
      toast(err.message || "Couldn't save the spawns", { tone: "bad" });
    }
    render();
  }
  const addSpawn = (s) => update([...spawns, s]);

  function choose(n) {
    if (onPick) {
      chosen = n;
      render();
      return onPick(n, spawns.find((s) => s.n === n));
    }
    const here = instantAt(n);
    if (!here.length) return toast(`No instant lineups from spawn ${n} yet.`);
    if (here.length === 1) return openPlayer(here[0]);
    replaceChildren(
      menu,
      h("p", { class: "spotmenu__head" }, `Spawn ${n}`),
      here.map((l) => h("button", { class: "spotcard", type: "button", onclick: () => ((menu.hidden = true), openPlayer(l)) }, h("span", { class: "spotcard__body" }, h("span", { class: "spotcard__title" }, l.name), h("span", { class: "spotcard__tags" }, h("span", { class: "callpill" }, l.dest))), nadeIconEl(l.type, 28)))
    );
    menu.hidden = false;
  }

  function tapped(pos, target) {
    const pt = target?.closest?.("[data-n]");
    if (pt) return choose(Number(pt.dataset.n));
    menu.hidden = true;
    if (editing && onRadar(pos)) addSpawn(pos);
  }

  const off = onSpawns((c) => c.map === map.id && c.side === side && ((spawns = c.spawns), render()));
  const ready = getSpawns(map.id, side).then((s) => {
    spawns = s;
    render();
    requestAnimationFrame(() => render());
  });
  return {
    el,
    ready,
    setLineups(l) {
      list = l;
      render();
    },
    select(n) {
      chosen = n;
      render();
    },
    destroy: off,
  };
}
