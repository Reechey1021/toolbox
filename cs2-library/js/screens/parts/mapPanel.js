// screens/parts/mapPanel.js
// A map with its lineups, usable anywhere: the map page, and beside the Voice
// assistant. One marker per spot (the grenade's icon, or a count when several
// share it). Hover a spot for a menu of its lineups; hover a card to see which
// path it is; click a card (or a lone lineup's spot) to watch it.
//
// options:
//   tools   "full" (every filter) | "compact" (grenades and thrown/lands only)
//   side    fixed side ("T" | "CT") instead of the side filter

import { h, replaceChildren } from "../../ui/dom.js";
import { switchRow } from "../../ui/components.js";
import { icon } from "../../ui/icons.js";
import { TYPES, typeById, THROWS, nameOf } from "../../data/tags.js";
import { filterLineups, authorsOf, groupBySpot, areaRadius } from "../../data/lineups.js";
import { prefs } from "../../services/store.js";
import { listLineups, onLibraryChange } from "../../services/library.js";
import { accountState, onAccount, isFavourite } from "../../services/account.js";
import { seedDemo } from "../../services/demo.js";
import { createMapCanvas, pathLine, dot, svgEl } from "./mapCanvas.js";
import { nadeBadge, nadeIconEl } from "./nadeIcons.js";
import { openPlayer } from "../player.js";
import { getLabels, onLabels, showCallouts, setShowCallouts, addLabel, renameLabel, deleteLabel } from "../../services/labels.js";
import { customCallouts } from "../../services/library.js";
import { openSheet, toast } from "../../ui/components.js";
import { preferences, setPreferences, onPlayback } from "../../services/playback.js";

export function createMapPanel(map, { tools = "full", side = null } = {}) {
  const saved = prefs.get("filters", {});
  const f = {
    types: new Set(saved.types ?? TYPES.map((t) => t.id)),
    sides: side ? new Set([side]) : new Set(saved.sides ?? ["T", "CT"]),
    authors: saved.authors ? new Set(saved.authors) : null, // null: everyone
    view: saved.view ?? "from",
    level: "upper",
  };
  const favsOnly = () => Boolean(accountState().user && preferences().favsOnly);
  const keep = () => prefs.set("filters", { types: [...f.types], sides: side ? saved.sides ?? ["T", "CT"] : [...f.sides], authors: f.authors ? [...f.authors] : null, view: f.view });
  let all = [];
  let groups = [];
  let openSpot = null; // index of the spot whose menu is showing
  let pinned = false; // clicked or tapped open (stays until you click away)
  let hideTimer = null;

  const canvas = createMapCanvas({ radar: map.radar, label: `${map.name} radar`, onTap: (pos, e, target) => (editing ? editTap(pos, target) : tapped(target, e)) });
  const menu = h("div", { class: "spotmenu", hidden: true, role: "menu" });
  const empty = h("div", { class: "mapempty", hidden: true });
  // Controls inside the map: Filters and Throwing / Landing top-left, zoom top-right.
  const ctlLeft = h("div", { class: "mapctl mapctl--tl" });
  const ctlRight = h("div", { class: "mapctl mapctl--tr" });
  const pop = h("div", { class: "mapfilters", hidden: true, role: "dialog", "aria-label": "Filters" });
  const count = h("span", { class: "mapfilters__count" });

  // ---------------------------------------------------------------- callouts
  let labels = [];
  let editing = false; // the callout builder
  const banner = h("div", { class: "calloutbar", hidden: true });

  function renderLabels() {
    const visible = showCallouts() || editing;
    canvas.layers.labels.replaceChildren(
      ...(visible ? labels.filter((c) => (c.level || "upper") === f.level) : []).map((c) => {
        const t = svgEl("text", { x: c.x * 1000, y: c.y * 1000, "data-fs": 13, class: ["callout", editing && "is-editable"].filter(Boolean).join(" "), "data-label": c.id, "text-anchor": "middle", "dominant-baseline": "central" });
        t.textContent = c.text;
        return t;
      })
    );
    canvas.layers.dots.style.display = editing ? "none" : "";
    canvas.refresh();
  }

  async function nameSheet({ title, value = "", onDelete = null }) {
    const names = [...new Set([...map.callouts, ...(await customCallouts(map.id)).map((c) => c.name)])].sort((a, b) => a.localeCompare(b));
    const listId = `callout-names-${map.id}`;
    const input = h("input", { class: "field", type: "text", maxlength: 40, value, list: listId, placeholder: "e.g. Tetris", "aria-label": "Callout" });
    return new Promise((resolve) => {
      const sheet = openSheet({
        title,
        lead: "Community names read best: the ones your team actually says.",
        body: [input, h("datalist", { id: listId }, names.map((n) => h("option", { value: n })))],
        actions: [
          h("button", { class: "btn btn--primary btn--block", type: "button", onclick: () => sheet.close({ text: input.value.trim() }) }, "Save"),
          onDelete ? h("button", { class: "btn btn--ghost btn--block", type: "button", onclick: () => sheet.close({ delete: true }) }, "Delete this callout") : null,
        ],
      });
      input.addEventListener("keydown", (e) => e.key === "Enter" && sheet.close({ text: input.value.trim() }));
      setTimeout(() => (input.focus(), input.select()), 200);
      sheet.closed.then((r) => resolve(r || null));
    });
  }

  // Building: a click on the map places a callout there; a click on one renames or deletes it.
  async function editTap(pos, target) {
    const id = target?.closest?.("[data-label]")?.dataset.label;
    try {
      if (id) {
        const c = labels.find((x) => x.id === id);
        const r = await nameSheet({ title: `Edit \u201c${c.text}\u201d`, value: c.text, onDelete: true });
        if (r?.delete) labels = await deleteLabel(map.id, id);
        else if (r?.text) labels = await renameLabel(map.id, id, r.text);
      } else if (pos.x >= 0 && pos.x <= 1 && pos.y >= 0 && pos.y <= 1) {
        const r = await nameSheet({ title: "New callout" });
        if (r?.text) labels = await addLabel(map.id, { text: r.text, x: pos.x, y: pos.y, level: f.level });
      }
    } catch (err) {
      toast(err.message || "Couldn't save that callout", { tone: "bad" });
    }
    renderLabels();
  }

  function setEditing(on) {
    editing = on;
    hideMenu();
    canvas.el.classList.toggle("is-building", on);
    banner.hidden = !on;
    replaceChildren(
      banner,
      h("span", null, h("strong", null, "Adding callouts. "), "Click the map to place one; click a callout to rename or delete it."),
      h("button", { class: "btn btn--primary calloutbar__done", type: "button", onclick: () => setEditing(false) }, "Done")
    );
    renderLabels();
  }

  const shown = () => filterLineups(all, f).filter((l) => (l.level || "upper") === f.level && (!favsOnly() || isFavourite(l.id)));

  function renderDots() {
    const list = shown();
    count.textContent = `Showing ${list.length} of ${all.length} ${all.length === 1 ? "lineup" : "lineups"}`;
    paintFiltersBtn();
    groups = groupBySpot(list, f.view);
    canvas.layers.dots.replaceChildren(
      ...groups.map((g, i) => {
        const one = g.items.length === 1 ? g.items[0] : null;
        const el = svgEl("g", { class: ["spot", one ? "spot--one" : "spot--many"].join(" "), "data-group": i, tabindex: 0, role: "button", "aria-label": one ? one.name : `${g.items.length} lineups here` });
        el.append(one ? nadeBadge(one.type, g.pos, { attrs: { "data-id": one.id } }) : dot(g.pos, "lu lu--many", 11, { fill: "#fcf0d6" }));
        if (!one) {
          const t = svgEl("text", { x: g.pos.x * 1000, y: g.pos.y * 1000, "data-fs": 12, class: "spot__count", "text-anchor": "middle", "dominant-baseline": "central" });
          t.textContent = String(g.items.length);
          el.append(t);
        }
        el.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && !pinned && showMenu(i));
        el.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && !pinned && hideSoon());
        el.addEventListener("focus", () => showMenu(i));
        el.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          if (g.items.length === 1) return openPlayer(g.items[0]);
          showMenu(i, { pin: true });
          menu.querySelector(".spotcard")?.focus();
        });
        return el;
      })
    );
    canvas.refresh();
    empty.hidden = all.length > 0;
    if (openSpot !== null && !groups[openSpot]) hideMenu();
  }

  // Paths for a spot's lineups; `focus` is the one to stand out (others dim).
  // Where it lands, the grenade's rough area, to scale; flashes have none, so a small ring.
  function drawPaths(g, focus = null) {
    const lines = [];
    for (const l of g.items) {
      const path = [l.from, ...(l.arc || []), l.to];
      const pts = f.view === "from" ? path : [...path].reverse();
      const cls = focus === null ? "" : focus === l.id ? " is-focus" : " is-dim";
      const colour = typeById(l.type)?.colour;
      const r = areaRadius(map, l);
      if (r) lines.push(svgEl("circle", { cx: l.to.x * 1000, cy: l.to.y * 1000, r, class: `lu-area lu-area--${l.type}${cls}`, fill: colour, stroke: colour, "data-w": 2 }));
      lines.push(pathLine(pts, `lu-path lu-path--${l.type}${cls}`, focus === l.id ? 4 : 3));
      if (!r) lines.push(dot(l.to, `lu-end lu-end--${l.type}${cls}`, 7, { stroke: colour }));
    }
    canvas.layers.lines.replaceChildren(...lines);
    canvas.refresh();
  }

  function card(l, g) {
    const sideTag = l.side === "both" ? ["T/CT", "both"] : [l.side, l.side === "T" ? "t" : "ct"];
    const el = h(
      "button",
      { class: "spotcard", type: "button", role: "menuitem", onclick: () => (hideMenu(), openPlayer(l)) },
      h(
        "span",
        { class: "spotcard__body" },
        h("span", { class: "spotcard__title" }, isFavourite(l.id) ? "\u2605 " : "", l.name || "Untitled", l.author ? h("span", { class: "spotcard__by" }, ` by ${l.author}`) : null),
        h(
          "span",
          { class: "spotcard__tags" },
          h("span", { class: `sidetag sidetag--${sideTag[1]}` }, sideTag[0]),
          l.spawn ? h("span", { class: "callpill callpill--spawn" }, `Spawn ${l.spawn}`) : h("span", { class: "callpill" }, l.origin),
          h("span", { class: "spotcard__arrow", "aria-hidden": "true" }, "\u203a"),
          h("span", { class: "callpill" }, l.dest),
          h("span", { class: "spotcard__throw" }, nameOf(THROWS, l.throw))
        )
      ),
      nadeIconEl(l.type, 34)
    );
    const focusIt = () => {
      for (const c of menu.querySelectorAll(".spotcard")) c.classList.toggle("is-focus", c === el);
      drawPaths(g, l.id);
    };
    el.addEventListener("pointerenter", focusIt);
    el.addEventListener("focus", focusIt);
    return el;
  }

  function showMenu(i, { pin = false } = {}) {
    const g = groups[i];
    if (!g) return;
    clearTimeout(hideTimer);
    openSpot = i;
    pinned = pin;
    const single = g.items.length === 1;
    drawPaths(g, single ? g.items[0].id : null);
    replaceChildren(
      menu,
      single ? null : h("p", { class: "spotmenu__head" }, `${g.items.length} lineups ${f.view === "from" ? "thrown from here" : "landing here"}`),
      g.items.map((l) => card(l, g))
    );
    menu.hidden = false;
    for (const c of canvas.layers.dots.children) c.classList.toggle("is-on", c.dataset.group === String(i));
    // Beside the spot, kept inside the map.
    const at = canvas.toScreen(g.pos);
    const box = canvas.el.getBoundingClientRect();
    const w = menu.offsetWidth || 380;
    const hgt = menu.offsetHeight || 120;
    const left = at.x + 22 + w <= box.width ? at.x + 22 : Math.max(8, at.x - 22 - w);
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.min(Math.max(at.y - 28, 8), Math.max(8, box.height - hgt - 8))}px`;
  }

  function hideMenu() {
    clearTimeout(hideTimer);
    openSpot = null;
    pinned = false;
    menu.hidden = true;
    canvas.layers.lines.replaceChildren();
    for (const c of canvas.layers.dots.children) c.classList.remove("is-on");
  }
  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideMenu, 260);
  };
  menu.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  menu.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && !pinned && hideSoon());

  // A lone lineup: click plays it (touch: first tap shows its card). Several: the menu stays open to pick.
  function tapped(target, e) {
    const el = target?.closest?.("[data-group]");
    if (!el) return hideMenu();
    const i = Number(el.dataset.group);
    const g = groups[i];
    if (g.items.length === 1 && (e.pointerType === "mouse" || openSpot === i)) return (hideMenu(), openPlayer(g.items[0]));
    showMenu(i, { pin: true });
  }

  // ---------------------------------------------------------------- the controls
  const changed = () => (keep(), hideMenu(), renderDots());
  const filtersBtn = h("button", { class: "mapctl__btn mapctl__filters", type: "button", "aria-expanded": "false", onclick: () => togglePop() });
  // How many filters are off their defaults (all types, both sides, everyone, not favourites only).
  function activeFilters() {
    return (f.types.size < TYPES.length ? 1 : 0) + (!side && f.sides.size < 2 ? 1 : 0) + (f.authors ? 1 : 0) + (favsOnly() ? 1 : 0);
  }
  function paintFiltersBtn() {
    const n = activeFilters();
    replaceChildren(filtersBtn, icon("sliders", { size: 16 }), h("span", null, "Filters"), n ? h("span", { class: "mapctl__badge" }, n) : null);
  }
  function togglePop(open = pop.hidden) {
    pop.hidden = !open;
    filtersBtn.setAttribute("aria-expanded", String(open));
    if (open) (hideMenu(), renderPop());
  }

  function viewPill() {
    return h(
      "div",
      { class: "mapctl__pill", role: "radiogroup", "aria-label": "Show where lineups are" },
      [["from", "Throwing"], ["to", "Landing"]].map(([v, label]) =>
        h("button", { type: "button", role: "radio", class: "mapctl__opt", "data-view": v, "aria-checked": String(f.view === v), onclick: () => ((f.view = v), changed(), renderControls()) }, label)
      )
    );
  }
  function levelPill() {
    if (!map.lowerRadar) return null;
    return h(
      "div",
      { class: "mapctl__pill", role: "radiogroup", "aria-label": "Level" },
      [["upper", "Upper"], ["lower", "Lower"]].map(([v, label]) =>
        h(
          "button",
          {
            type: "button",
            role: "radio",
            class: "mapctl__opt",
            "aria-checked": String(f.level === v),
            onclick: () => {
              f.level = v;
              canvas.setRadar(v === "lower" ? map.lowerRadar : map.radar);
              hideMenu();
              renderDots();
              renderLabels();
              renderControls();
            },
          },
          label
        )
      )
    );
  }

  function renderControls() {
    paintFiltersBtn();
    replaceChildren(ctlLeft, filtersBtn, viewPill(), levelPill());
    replaceChildren(
      ctlRight,
      h(
        "div",
        { class: "mapctl__pill mapctl__zoom" },
        h("button", { class: "mapctl__opt", type: "button", "aria-label": "Zoom in", onclick: () => canvas.zoomIn() }, icon("plus", { size: 16 })),
        h("button", { class: "mapctl__opt", type: "button", "aria-label": "Zoom out", onclick: () => canvas.zoomOut() }, icon("minus", { size: 16 }))
      )
    );
    if (!pop.hidden) renderPop();
  }

  const check = (label, checked, onChange, lead = null, attrs = {}) =>
    h("label", { class: "fcheck" }, h("input", { type: "checkbox", checked, onchange: (e) => onChange(e.target.checked), ...attrs }), h("span", { class: "fcheck__box", "aria-hidden": "true" }), lead, h("span", { class: "fcheck__label" }, label));
  const divider = () => h("hr", { class: "mapfilters__rule" });
  const heading = (t) => h("p", { class: "mapfilters__h" }, t);

  function renderPop() {
    const signedIn = Boolean(accountState().user);
    const authors = authorsOf(all);
    const authorSet = f.authors ?? new Set(authors);
    const authorsLabel = !f.authors ? "Everyone" : f.authors.size === 0 ? "Nobody" : f.authors.size === 1 ? [...f.authors][0] : `${f.authors.size} authors`;
    const setAuthors = (next) => {
      f.authors = next.size === authors.length && authors.every((a) => next.has(a)) ? null : next;
      changed();
      renderPop();
    };
    replaceChildren(
      pop,
      h("div", { class: "mapfilters__head" }, h("strong", null, "Filters"), count),
      signedIn
        ? switchRow({ label: "Show favourites only", checked: favsOnly(), onChange: (v) => (setPreferences({ favsOnly: v }), hideMenu(), renderDots()) })
        : h("p", { class: "mapfilters__note" }, "Sign in to keep favourites and show only those."),
      divider(),
      heading("Utility type"),
      h(
        "div",
        { class: "mapfilters__list" },
        TYPES.map((t) =>
          check(
            { smoke: "Smoke", flash: "Flashbang", molotov: "Molotov / Incendiary", he: "HE Grenade" }[t.id],
            f.types.has(t.id),
            (on) => (on ? f.types.add(t.id) : f.types.delete(t.id), changed()),
            nadeIconEl(t.id, 18),
            { "data-type": t.id }
          )
        )
      ),
      divider(),
      heading("Show utility for"),
      side
        ? h("p", { class: "mapfilters__note" }, h("span", { class: `sidetag sidetag--${side === "T" ? "t" : "ct"}` }, side), ` Set by \u201cWhat you're playing\u201d.`)
        : h(
            "div",
            { class: "mapfilters__list" },
            [["T", "Terrorist", "t"], ["CT", "Counter-Terrorist", "ct"]].map(([id, label, cls]) =>
              check(label, f.sides.has(id), (on) => (on ? f.sides.add(id) : f.sides.delete(id), changed()), h("span", { class: `sidetag sidetag--${cls}` }, id), { "data-side": id })
            )
          ),
      divider(),
      switchRow({ label: "Show callouts", checked: showCallouts(), onChange: (v) => setShowCallouts(v) }),
      divider(),
      heading("Authors"),
      authors.length
        ? h(
            "details",
            { class: "fauthors" },
            h("summary", { class: "fauthors__sum field" }, h("span", null, authorsLabel), icon("chevron", { size: 16 })),
            h(
              "div",
              { class: "fauthors__list" },
              check("Everyone", !f.authors, (on) => setAuthors(on ? new Set(authors) : new Set()), null, { "data-author": "*" }),
              authors.map((a) =>
                check(a, authorSet.has(a), (on) => {
                  const next = new Set(authorSet);
                  on ? next.add(a) : next.delete(a);
                  setAuthors(next);
                }, null, { "data-author": a })
              )
            )
          )
        : h("p", { class: "mapfilters__note" }, "No authors yet.")
    );
    // Keep the authors list open while ticking.
    if (renderPop.authorsOpen) pop.querySelector(".fauthors")?.setAttribute("open", "");
    pop.querySelector(".fauthors")?.addEventListener("toggle", (e) => (renderPop.authorsOpen = e.target.open));
  }

  function renderEmpty() {
    replaceChildren(
      empty,
      h("h2", null, `No lineups on ${map.name} yet`),
      h("p", { class: "muted" }, "Add your first one from Add content."),
      h("div", { class: "btn-row" }, h("a", { class: "btn btn--primary", href: `#/add?map=${map.id}` }, "Add a lineup"), map.id === "de_mirage" ? h("button", { class: "btn btn--quiet", type: "button", onclick: () => seedDemo() }, "Load demo lineups") : null)
    );
  }

  async function load() {
    [all, labels] = await Promise.all([listLineups(map.id), getLabels(map.id)]);
    renderControls();
    renderEmpty();
    renderDots();
    renderLabels();
  }
  const offLabels = onLabels((ev) => {
    if (ev.type === "visible") {
      if (!pop.hidden) renderPop();
      renderLabels();
    } else if (ev.map === map.id) {
      labels = ev.labels;
      renderLabels();
    }
  });
  const off = onLibraryChange(load);
  const offAccount = onAccount(() => (renderControls(), renderDots()));
  const offPrefs = onPlayback(() => (paintFiltersBtn(), renderDots(), !pop.hidden && renderPop()));
  const onDocClick = (e) => {
    if (pinned && !menu.contains(e.target) && !canvas.el.contains(e.target)) hideMenu();
    if (!pop.hidden && !pop.contains(e.target) && !filtersBtn.contains(e.target)) togglePop(false);
  };
  const onKey = (e) => e.key === "Escape" && !pop.hidden && togglePop(false);
  document.addEventListener("pointerdown", onDocClick);
  document.addEventListener("keydown", onKey);

  const el = h("div", { class: "mappanel" }, h("div", { class: "mapwrap" }, canvas.el, ctlLeft, ctlRight, pop, menu, empty, banner));
  const ready = load();
  return {
    el,
    canvas,
    ready,
    editCallouts: setEditing,
    // The Voice tab changes the side you're on.
    setSide(s) {
      f.sides = s ? new Set([s]) : new Set(["T", "CT"]);
      hideMenu();
      renderDots();
    },
    destroy() {
      off();
      offAccount();
      offLabels();
      offPrefs();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDocClick);
    },
  };
}
