// screens/profile.js
// Totals, the ride history (filterable), a page per ride with map, splits and
// charts, and moving data in and out: importing the old Android app's backup
// and making new backups.

import { h, icon, put } from "../ui/dom.js";
import { openPage, confirmSheet, toast } from "../ui/layers.js";
import { TileMap } from "../ui/map.js";
import { lineChart } from "../ui/charts.js";
import { fmtTime, fmt1, fmtDate, fmtSigned } from "../engine/format.js";
import { sectorRows, speedSeries, altitudeSeries, heartSeries, deltaSeriesByDistance } from "../engine/sectors.js";
import { parseBackup, exportBackup } from "../data/backup.js";

const allRides = (repo) => [
  ...repo.freeroamSessions.map((x) => ({ kind: "free", x })),
  ...repo.courseRuns.map((x) => ({ kind: "run", x })),
].sort((a, b) => b.x.finishedAtEpochMs - a.x.finishedAtEpochMs);

function stat(label, value, unit = "") {
  return h("div", { class: "cell" }, h("div", { class: "lab" }, label), h("div", { class: "val num" }, value, unit ? h("small", {}, unit) : null));
}

function startOfWeek(now) { const d = new Date(now); const day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return d.getTime(); }
function startOfMonth(now) { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }

export function rideRow(app, { kind, x }) {
  const course = kind === "run" ? x.courseName : "Szabad menet";
  return h("button", { class: "hist", onClick: () => app.openRide(kind, x.id) },
    h("div", { class: "title" }, course,
      x.wasNewRecord && kind === "run" ? h("span", { class: "badge" }, "Rekord") : null,
      x.isStarred ? h("span", { class: "star", "aria-label": "Jelölt" }, "★") : null),
    h("div", { class: "when" }, fmtDate(x.finishedAtEpochMs), `, ${fmt1(x.distanceKm)} km, ${fmt1(x.averageSpeedKmh)} km/h`),
    h("div", { class: "right" }, h("div", { class: "big" }, fmtTime(x.elapsedSeconds)),
      kind === "run" && x.deltaSeconds != null ? h("div", { class: `small ${x.deltaSeconds < 0 ? "good" : x.deltaSeconds > 0 ? "bad" : ""}` }, fmtSigned(x.deltaSeconds)) : null));
}

export function profileScreen(app) {
  const el = h("div");
  let filter = "all";
  let shown = 30;

  function render() {
    const { repo } = app;
    const rides = allRides(repo);
    const now = Date.now();
    const sum = (list, f) => list.reduce((a, r) => a + f(r.x), 0);
    const week = rides.filter((r) => r.x.finishedAtEpochMs >= startOfWeek(now));
    const month = rides.filter((r) => r.x.finishedAtEpochMs >= startOfMonth(now));
    const longest = rides.reduce((m, r) => Math.max(m, r.x.distanceKm), 0);

    const filtered = rides.filter((r) => filter === "all" || (filter === "free" && r.kind === "free") || (filter === "run" && r.kind === "run") || (filter === "star" && r.x.isStarred));
    const chip = (id, label) => h("button", { "aria-pressed": String(filter === id), onClick: () => { filter = id; shown = 30; render(); } }, label);

    el.replaceChildren(
      h("div", { class: "screen-head" }, h("h1", {}, "Profil"),
        h("button", { class: "icon-btn", "aria-label": "Beállítások", onClick: () => app.openSettings() }, icon("settings"))),
      h("div", { class: "section" },
        h("div", { class: "stats" },
          stat("Összes táv", fmt1(sum(rides, (x) => x.distanceKm)), "km"),
          stat("Menetidő", fmtTime(sum(rides, (x) => x.elapsedSeconds))),
          stat("Ezen a héten", fmt1(sum(week, (x) => x.distanceKm)), "km"),
          stat("Ebben a hónapban", fmt1(sum(month, (x) => x.distanceKm)), "km"),
          stat("Menetek", String(rides.length)),
          stat("Leghosszabb", fmt1(longest), "km"))),
      h("div", { class: "section" }, h("h2", {}, "Előzmények")),
      h("div", { class: "chips" }, chip("all", "Mind"), chip("free", "Szabad"), chip("run", "Pálya"), chip("star", "★ Jelölt")),
      h("div", { class: "section" },
        filtered.length
          ? h("div", { class: "stack" }, ...filtered.slice(0, shown).map((r) => rideRow(app, r)),
              filtered.length > shown ? h("button", { class: "btn secondary small", onClick: () => { shown += 30; render(); } }, `Továbbiak (${filtered.length - shown})`) : null)
          : h("div", { class: "empty" }, rides.length ? "Ebben a szűrésben nincs menet." : "Még nincs menet. Indíts egy szabad menetet, vagy hozd át a régi app adatait lent.")),
      backupSection(app));
  }
  render();
  return { el, render };
}

// ---------- backup ----------
function backupSection(app) {
  const file = h("input", { type: "file", style: { display: "none" }, onChange: async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) await importFile(app, f);
  } });
  const canShare = typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] });
  return h("div", { class: "section" },
    h("h2", {}, "Áthozás és mentés"),
    h("p", { class: "help" }, "Áthozás a régi appból: a régi appban Profil → Általános → MENTÉS, és mentsd el a fájlt a telefonra. Itt koppints a Betöltés fájlból gombra, és válaszd ki azt a fájlt. Minden pálya, rekord, futam és szabad menet átjön."),
    h("div", { class: "stack" },
      h("button", { class: "btn primary", onClick: () => file.click() }, icon("upload"), "Betöltés fájlból"),
      h("div", { class: `sheet-actions${canShare ? " two" : ""}`, style: { marginTop: 0 } },
        h("button", { class: "btn secondary small", onClick: () => exportFile(app, "download") }, icon("download"), "Mentés fájlba"),
        canShare ? h("button", { class: "btn secondary small", onClick: () => exportFile(app, "share") }, icon("share"), "Megosztás") : null),
      app.state.preImport ? h("button", { class: "btn secondary small", onClick: () => undoImport(app) }, icon("undo"), "Utolsó betöltés visszavonása") : null),
    h("p", { class: "help", style: { marginTop: "12px" } }, "Az adatok ezen a telefonon, ebben a böngészőben vannak. Havonta egyszer érdemes mentést készíteni (például Google Drive-ra a Megosztás gombbal). A mentést a régi app is be tudja olvasni."),
    file);
}

async function importFile(app, f) {
  let parsed;
  try { parsed = parseBackup(await f.text()); }
  catch (err) { toast(err.message || "Nem sikerült beolvasni a fájlt.", { kind: "bad", ms: 6000 }); return; }
  const n = (x) => (x ? x.length : 0);
  const ok = await confirmSheet({
    title: "Betöltöd ezt a mentést?",
    text: `A fájlban: ${n(parsed.courses)} pálya, ${n(parsed.courseRuns)} pályafutam és ${n(parsed.freeroamSessions)} szabad menet. Ami itt már megvan, megmarad; ami mindkét helyen szerepel, azt a fájl frissíti. A betöltés visszavonható.`,
    ok: "Betöltés",
  });
  if (!ok) return;
  await app.saveImportUndo();
  const c = app.repo.importData(parsed);
  toast(`Betöltve: ${c.courses} pálya (${c.added.courses} új), ${c.courseRuns} futam (${c.added.courseRuns} új), ${c.freeroamSessions} szabad menet (${c.added.freeroamSessions} új).`, { kind: "good", ms: 7000 });
}

async function undoImport(app) {
  if (!(await confirmSheet({ title: "Visszavonod az utolsó betöltést?", text: "Az adatok visszaállnak a betöltés előtti állapotra. Az azóta rögzített menetek is eltűnnek.", ok: "Visszavonás", danger: true }))) return;
  await app.undoImport();
  toast("Visszaállítva a betöltés előtti állapotra.", { kind: "good" });
}

function exportFile(app, how) {
  const text = exportBackup(app.repo);
  const d = new Date();
  const name = `desibuff-mentes-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
  if (how === "share") {
    const file = new File([text], name, { type: "application/json" });
    navigator.share({ files: [file], title: "DesiBuff mentés" }).catch((e) => { if (e.name !== "AbortError") toast("A megosztás nem sikerült.", { kind: "bad" }); });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = h("a", { href: url, download: name, style: { display: "none" } });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  toast(`Mentve: ${name} (a Letöltések mappába).`, { kind: "good", ms: 5000 });
}

// ---------- one ride ----------
export function openRidePage(app, kind, id) {
  let map = null;
  let chartKind = "speed";
  const find = () => (kind === "run" ? app.repo.courseRuns : app.repo.freeroamSessions).find((x) => x.id === id);
  const page = openPage({
    title: "Menet",
    onClose: () => map?.destroy(),
    render: (body, page) => {
      map?.destroy();
      const x = find();
      if (!x) { page.close(); return; }
      page.setTitle(kind === "run" ? x.courseName : "Szabad menet");
      const pts = x.samples.length >= 2 ? x.samples : x.routePoints;
      const course = kind === "run" ? app.repo.course(x.courseId) : null;
      map = new TileMap({ height: 250, points: pts, draw: (api) => {
        if (course) api.line(course.routePoints, { stroke: "#3a4a85", "stroke-width": 7 });
        api.line(pts, {});
        if (pts.length) { api.dot(pts[pts.length - 1], { fill: "#ff4d5a" }); api.dot(pts[0]); }
      } });
      const hasHr = x.avgHeartRate > 0;
      const isRecording = kind === "run" && x.wasNewRecord && x.deltaSeconds == null && !x.deltaReferenceSamples.length;

      const statsGrid = h("div", { class: "stats" },
        stat("Idő", fmtTime(x.elapsedSeconds)),
        stat("Táv", fmt1(x.distanceKm), "km"),
        stat("Átlag", fmt1(x.averageSpeedKmh), "km/h"),
        stat("Max", fmt1(x.maxSpeedKmh), "km/h"),
        hasHr ? stat("Átlagpulzus", String(x.avgHeartRate), "bpm") : null,
        hasHr ? stat("Max pulzus", String(x.maxHeartRate), "bpm") : null,
        kind === "run" ? stat("A rekordhoz", x.deltaSeconds != null ? fmtSigned(x.deltaSeconds) : "–") : null,
        kind === "run" ? stat("Új rekord", x.wasNewRecord ? "Igen" : "Nem") : null);

      const rows = kind === "run" ? sectorRows(x.sectorTimesSeconds, x.elapsedSeconds, x.sectorDeltaSeconds) : [];
      const sectors = rows.length ? h("div", {},
        h("h2", {}, "Szektorok"),
        h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", {}, "Szektor"), h("th", { class: "r" }, "Idő"), h("th", { class: "r" }, "Összesen"), h("th", { class: "r" }, "Részidő Δ"))),
          h("tbody", {}, ...rows.map((r) => h("tr", {},
            h("td", { class: "l" }, `${r.n}.`),
            h("td", { class: "r" }, fmtTime(r.duration)),
            h("td", { class: "r" }, fmtTime(r.at)),
            h("td", { class: `r ${r.delta < 0 ? "good" : r.delta > 0 ? "bad" : ""}` }, r.last ? "" : r.delta == null ? "–" : fmtSigned(r.delta)))))),
        h("p", { class: "help", style: { marginTop: "8px" } }, "Részidő Δ: az adott részidőnél mennyivel voltál előrébb (−) vagy hátrébb (+) az összehasonlított menetnél.")) : null;

      const charts = {
        speed: { label: "Sebesség", make: () => lineChart(speedSeries(x.samples), { unit: "km/h" }) },
        alt: { label: "Magasság", make: () => lineChart(altitudeSeries(x.samples), { color: "#5ec8ff", unit: "m", empty: "Ehhez a menethez nincs magasságadat (a régi app pályafutamoknál nem mentette)." }) },
        hr: hasHr || x.samples.some((p) => p.heartRate) ? { label: "Pulzus", make: () => lineChart(heartSeries(x.samples), { color: "#ff4d5a", unit: "bpm" }) } : null,
        delta: kind === "run" ? { label: "Delta", make: () => isRecording
          ? h("div", { class: "empty" }, "Ez a pálya felvétele volt, így nincs mihez hasonlítani.")
          : lineChart(deltaSeriesByDistance(x.samples, x.deltaReferenceSamples), { color: "#f4d35e", unit: "mp (− előnyben)", zero: true, digits: 0, signed: true, empty: "Ehhez a futamhoz nincs elég adat a delta grafikonhoz." }) } : null,
      };
      if (!charts[chartKind]) chartKind = "speed";
      const chartBox = h("div", {}, charts[chartKind].make());
      const tabs = h("div", { class: "chips", style: { padding: "0" } }, ...Object.entries(charts).filter(([, v]) => v).map(([k, v]) =>
        h("button", { "aria-pressed": String(k === chartKind), onClick: () => { chartKind = k; page.refresh(); } }, v.label)));

      put(body, map.el,
        h("div", { class: "section" },
          h("p", { class: "help", style: { margin: "10px 0" } }, fmtDate(x.finishedAtEpochMs)),
          statsGrid, sectors,
          h("h2", {}, "Grafikon"), tabs, chartBox,
          h("div", { class: "stack", style: { marginTop: "16px" } },
            course ? h("button", { class: "btn secondary small", onClick: () => app.openCourse(course.id) }, icon("courses"), "A pálya oldala") : null,
            h("button", { class: "btn secondary small", onClick: () => { app.repo.toggleStar(kind === "run" ? "run" : "free", x.id); page.refresh(); } },
              icon("star", { filled: x.isStarred }), x.isStarred ? "Jelölés levétele" : "Megjelölöm ★"),
            h("button", { class: "btn danger small", onClick: async () => {
              if (await confirmSheet({ title: "Menet törlése?", text: "A menet véglegesen törlődik az előzményekből. A pálya rekordja nem változik.", ok: "Törlés", danger: true })) {
                app.repo.deleteRide(kind === "run" ? "run" : "free", x.id); page.close(); toast("Menet törölve.");
              }
            } }, icon("trash"), "Menet törlése"))));
    },
  });
}

