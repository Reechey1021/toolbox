// screens/courses.js
// The course list, a page per course (map, records, splits, management) and
// the split editor.
//
// The split editor replaces the old pinch-and-tap preview: a slider moves a
// marker along the route (or tap the map near the line), the position shows in
// km, and one big button drops a split there. Equal splits in one tap, undo,
// and every split listed with its distance and its sector's length.

import { h, icon, put } from "../ui/dom.js";
import { openPage, confirmSheet, openSheet, toast } from "../ui/layers.js";
import { trackSvg, TileMap } from "../ui/map.js";
import { fmtTime, fmt1, fmtDate, fmtSigned } from "../engine/format.js";
import { cumulative, nearestIndexInWindow } from "../engine/geo.js";

const SECTOR_COLORS = ["#c2fe00", "#5ec8ff"];

/** Draw a course on a TileMap: sectors in alternating colours, numbered splits, start and finish. */
function drawCourse(api, route, splits, { cursor = null } = {}) {
  const bounds = [0, ...splits, route.length - 1];
  for (let i = 0; i < bounds.length - 1; i++) {
    api.line(route.slice(bounds[i], bounds[i + 1] + 1), { stroke: "#040817", "stroke-width": 9 });
    api.line(route.slice(bounds[i], bounds[i + 1] + 1), { stroke: SECTOR_COLORS[i % 2], "stroke-width": 5 });
  }
  api.dot(route[route.length - 1], { r: 10, fill: "#ff4d5a" });
  api.dot(route[0], { r: 10, fill: "#ececec" });
  splits.forEach((idx, i) => { api.dot(route[idx], { r: 14, fill: "#f4d35e" }); api.text(route[idx], String(i + 1)); });
  if (cursor != null) {
    api.dot(route[cursor], { r: 18, fill: "none", stroke: "#ffffff", "stroke-width": 5 });
    api.dot(route[cursor], { r: 6, fill: "#ffffff", stroke: "none" });
  }
}

export function coursesScreen(app) {
  const el = h("div");
  function render() {
    const { repo, engine } = app;
    const list = h("div", { class: "stack" });
    for (const c of repo.courses) {
      const runs = repo.runsFor(c.id).length;
      const near = engine.isNearby(c.id);
      const start = h("button", { class: "btn primary", style: { minHeight: "68px" }, onClick: (e) => { e.stopPropagation(); app.startRace(c.id); } }, icon("flag"), "Indítás");
      list.append(h("div", { class: "card", role: "button", tabindex: 0, onClick: () => openCourse(app, c.id), onKeydown: (e) => { if (e.key === "Enter") openCourse(app, c.id); } },
        h("div", { class: "thumb" }, trackSvg(c.routePoints, { w: 64, h: 64, pad: 6, width: 3 })),
        h("div", {},
          h("div", { class: "title" }, c.name, near ? h("span", { class: "badge" }, "A közelben") : null),
          h("div", { class: "meta" }, c.recordTimeSeconds != null ? ["Rekord ", h("b", {}, fmtTime(c.recordTimeSeconds))] : "Még nincs rekord"),
          h("div", { class: "meta" }, `${fmt1(c.distanceKm)} km, `, runs ? `${runs} futam` : "még nem futottad", c.splitIndices.length ? `, ${c.splitIndices.length + 1} szektor` : "")),
        h("div", { class: "actions" }, start)));
    }
    el.replaceChildren(
      h("div", { class: "screen-head" }, h("h1", {}, "Pályák")),
      h("div", { class: "section" }, list,
        h("button", { class: "btn secondary", style: { marginTop: "14px", width: "100%" }, onClick: () => { app.setTab("ride"); app.startRecording(); } }, icon("record"), "Új pálya felvétele"),
        h("p", { class: "help", style: { marginTop: "12px" } }, "Koppints egy pályára a térképhez, a legjobb időkhöz és a részidők beállításához.")));
  }
  render();
  return { el, render };
}

// ---------- one course ----------
export function openCourse(app, id) {
  let map = null;
  const page = openPage({
    title: app.repo.course(id)?.name || "Pálya",
    onClose: () => { map?.destroy(); unsub(); },
    render: (body, page) => {
      map?.destroy();
      const c = app.repo.course(id);
      if (!c) { page.close(); return; }
      page.setTitle(c.name);
      const route = c.routePoints;
      map = new TileMap({ height: 270, points: route, draw: (api) => drawCourse(api, route, c.splitIndices) });
      const runs = app.repo.runsFor(c.id);
      const best = runs.slice().sort((a, b) => a.elapsedSeconds - b.elapsedSeconds).slice(0, 10);
      const length = cumulative(route).at(-1) / 1000;

      put(body, map.el,
        h("div", { class: "section" },
          h("div", { class: "stats" },
            stat("Hossz", fmt1(c.distanceKm || length), "km"),
            stat("Rekord", c.recordTimeSeconds != null ? fmtTime(c.recordTimeSeconds) : "–"),
            stat("Futamok", String(runs.length)),
            stat("Szektorok", String(c.splitIndices.length + 1))),
          h("button", { class: "btn primary", style: { width: "100%", marginTop: "14px" }, onClick: () => { page.close(); app.startRace(c.id); } }, icon("flag"), "Indítás"),

          h("h2", {}, "Legjobb idők"),
          best.length ? h("div", { class: "stack" }, ...best.map((r, i) => h("button", { class: "hist", onClick: () => app.openRide("run", r.id) },
            h("div", { class: "title" }, `${i + 1}.`, r.wasNewRecord && r.elapsedSeconds === c.recordTimeSeconds ? h("span", { class: "badge" }, "Rekord") : null, r.isStarred ? h("span", { class: "star" }, "★") : null),
            h("div", { class: "when" }, fmtDate(r.finishedAtEpochMs), r.deltaSeconds != null ? `, ${fmtSigned(r.deltaSeconds)}` : ""),
            h("div", { class: "right" }, h("div", { class: "big" }, fmtTime(r.elapsedSeconds)), h("div", { class: "small" }, `${fmt1(r.averageSpeedKmh)} km/h`)))))
            : h("div", { class: "empty" }, "Még nincs futam ezen a pályán."),

          h("h2", {}, "Részidők"),
          c.splitIndices.length ? sectorList(route, c.splitIndices) : h("p", { class: "help" }, "Nincs részidő. Részidőkkel szakaszonként látod, hol nyersz vagy vesztesz időt."),
          h("button", { class: "btn sector", style: { width: "100%" }, onClick: () => openSplitEditor(app, c.id) }, icon("split"), c.splitIndices.length ? "Részidők szerkesztése" : "Részidők beállítása"),

          h("h2", {}, "Kezelés"),
          h("div", { class: "stack" },
            h("button", { class: "btn secondary small", onClick: () => renameCourse(app, c.id) }, icon("edit"), "Átnevezés"),
            h("div", { class: "sheet-actions two", style: { marginTop: 0 } },
              h("button", { class: "btn secondary small", onClick: () => { app.repo.moveCourse(c.id, -1); toast("Előrébb került a listában."); } }, icon("up"), "Előrébb"),
              h("button", { class: "btn secondary small", onClick: () => { app.repo.moveCourse(c.id, 1); toast("Hátrébb került a listában."); } }, icon("down"), "Hátrébb")),
            h("button", { class: "btn danger small", onClick: async () => {
              if (await confirmSheet({ title: "Pálya törlése?", text: `Biztos törlöd: ${c.name}? A futamai megmaradnak az előzményekben.`, ok: "Törlés", danger: true })) {
                app.repo.deleteCourse(c.id); page.close(); toast("Pálya törölve.");
              }
            } }, icon("trash"), "Pálya törlése"))));
    },
  });
  const unsub = app.repo.on((keys) => { if (keys.includes("courses") || keys.includes("courseRuns")) page.refresh(); });
}

function stat(label, value, unit = "") {
  return h("div", { class: "cell" }, h("div", { class: "lab" }, label), h("div", { class: "val num" }, value, unit ? h("small", {}, unit) : null));
}

function sectorList(route, splits) {
  const cum = cumulative(route);
  const bounds = [0, ...splits, route.length - 1];
  return h("div", { class: "stack", style: { marginBottom: "12px" } }, ...bounds.slice(0, -1).map((b, i) => {
    const from = cum[b] / 1000, to = cum[bounds[i + 1]] / 1000;
    return h("div", { class: "split-row" },
      h("span", { class: `n ${i % 2 === 0 ? "s0" : ""}`, style: i % 2 ? { background: SECTOR_COLORS[1] } : null }, String(i + 1)),
      h("div", { class: "what" }, `${i + 1}. szektor: ${fmt1(to - from)} km`, h("small", {}, `${from.toFixed(2)} → ${to.toFixed(2)} km`)), h("span"));
  }));
}

function renameCourse(app, id) {
  const c = app.repo.course(id);
  let input;
  const sheet = openSheet({
    render: (el) => {
      input = h("input", { class: "input", value: c.name, maxlength: 60, "aria-label": "Új név" });
      put(el, h("h2", { class: "sheet-title" }, "Pálya átnevezése"),
        h("div", { class: "field" }, h("label", {}, "Új név"), input),
        h("div", { class: "sheet-actions two" },
          h("button", { class: "btn secondary", onClick: () => sheet.close() }, "Mégse"),
          h("button", { class: "btn primary", onClick: () => { if (app.repo.renameCourse(id, input.value)) { sheet.close(); toast("Átnevezve."); } } }, "Mentés")));
      setTimeout(() => input.select(), 50);
    },
  });
}

// ---------- the split editor ----------
export function openSplitEditor(app, id) {
  const c = app.repo.course(id);
  const route = c.routePoints;
  const last = route.length - 1;
  const cum = cumulative(route);
  const lengthKm = cum[last] / 1000;
  let draft = [...c.splitIndices];
  let cursor = draft[0] ?? Math.round(last / 2);
  const undo = [];
  let map;

  const change = (next) => { undo.push(draft); draft = [...new Set(next)].filter((i) => i > 0 && i < last).sort((a, b) => a - b); paint(); };

  const pos = h("span", { class: "num" });
  const posSub = h("small");
  const slider = h("input", { type: "range", class: "slider", min: 0, max: last, step: 1, value: cursor, "aria-label": "Hely a pályán",
    onInput: (e) => { cursor = Number(e.target.value); paint(false); } });
  const addBtn = h("button", { class: "btn sector", style: { width: "100%" }, onClick: () => { change([...draft, cursor]); toast(`Részidő ${draft.indexOf(cursor) + 1} hozzáadva.`, { kind: "good", ms: 1600 }); } }, icon("plus"), "Részidő ide");
  const listEl = h("div");
  const undoBtn = h("button", { class: "icon-btn", "aria-label": "Visszavonás", onClick: () => { if (undo.length) { draft = undo.pop(); paint(); } } }, icon("undo"));

  function paint(full = true) {
    const km = cum[cursor] / 1000;
    pos.textContent = `${km.toFixed(2)} km`;
    posSub.textContent = `/ ${lengthKm.toFixed(2)} km`;
    slider.value = cursor;
    const taken = draft.includes(cursor);
    addBtn.disabled = taken || cursor <= 0 || cursor >= last;
    addBtn.lastChild.textContent = taken ? "Itt már van részidő" : cursor <= 0 || cursor >= last ? "A rajtnál/célnál nem lehet" : "Részidő ide";
    undoBtn.disabled = !undo.length;
    map?.drawOverlay();
    if (!full) return;
    const bounds = [0, ...draft, last];
    listEl.replaceChildren(...(draft.length
      ? draft.map((idx, i) => h("div", { class: "split-row" },
          h("span", { class: "n" }, String(i + 1)),
          h("button", { class: "what", style: { background: "none", border: 0, textAlign: "left", padding: 0 }, onClick: () => { cursor = idx; paint(false); } },
            `${(cum[idx] / 1000).toFixed(2)} km-nél`,
            h("small", {}, `${i + 1}. szektor: ${((cum[idx] - cum[bounds[i]]) / 1000).toFixed(2)} km, utána még ${((cum[bounds[i + 2]] - cum[idx]) / 1000).toFixed(2)} km`)),
          h("button", { class: "icon-btn", "aria-label": `${i + 1}. részidő törlése`, onClick: () => change(draft.filter((x) => x !== idx)) }, icon("close"))))
      : [h("p", { class: "help" }, "Még nincs részidő. Húzd a csúszkát, vagy koppints a térképen a vonal mellé, aztán: Részidő ide.")]));
  }

  const nearestOnRoute = (p) => nearestIndexInWindow(route, p, 0, last);
  const equal = (n) => {
    const want = [];
    for (let k = 1; k < n; k++) {
      const target = (cum[last] * k) / n;
      let best = 1;
      for (let i = 1; i < last; i++) if (Math.abs(cum[i] - target) < Math.abs(cum[best] - target)) best = i;
      want.push(best);
    }
    change(want);
  };

  const page = openPage({
    title: `Részidők: ${c.name}`,
    actions: undoBtn,
    onClose: () => map?.destroy(),
    render: (body) => {
      map = new TileMap({ height: 280, points: route, draw: (api) => drawCourse(api, route, draft, { cursor }),
        onTap: (p) => { cursor = nearestOnRoute(p); paint(false); } });
      map.el.classList.add("sticky");
      put(body, map.el,
        h("div", { class: "section" },
          h("div", { class: "pos" }, h("div", {}, h("div", { class: "lab", style: { fontSize: "19px", color: "var(--muted)" } }, "Hely a pályán"), pos, " ", posSub)),
          slider,
          h("div", { class: "nudge" },
            h("button", { class: "btn secondary small", onClick: () => { cursor = Math.max(0, cursor - 1); paint(false); } }, icon("back"), "Kicsit vissza"),
            h("button", { class: "btn secondary small", onClick: () => { cursor = Math.min(last, cursor + 1); paint(false); } }, "Kicsit előre", h("span", { style: { transform: "scaleX(-1)", display: "inline-flex" } }, icon("back")))),
          addBtn,
          h("h2", {}, "Részidők"), listEl,
          h("div", { class: "equal", style: { margin: "14px 0" } }, h("span", { style: { fontSize: "19px", color: "var(--muted)", marginRight: "4px" } }, "Egyenlő részek:"),
            ...[2, 3, 4, 5, 6].map((n) => h("button", { onClick: () => equal(n) }, String(n))),
            h("button", { style: { padding: "0 14px" }, onClick: () => change([]) }, "Nincs")),
          h("p", { class: "help" }, "A már meglévő futamok részidői nem változnak. Az új beosztás a következő futamtól számít, és a rekordhoz képest mutatja az előnyt vagy a lemaradást."),
          h("div", { class: "sheet-actions two" },
            h("button", { class: "btn secondary", onClick: () => page.close() }, "Mégse"),
            h("button", { class: "btn primary", onClick: () => { app.repo.updateSplits(id, draft); page.close(); toast("Részidők mentve.", { kind: "good" }); } }, "Mentés"))));
      paint();
    },
  });
}
