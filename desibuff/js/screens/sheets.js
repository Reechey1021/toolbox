// screens/sheets.js
// Everything that pops up: finish screens, naming a new course, carrying on
// after a crash, settings, and the GPS / heart-rate / screen status cards.

import { h, icon, put } from "../ui/dom.js";
import { openSheet, openPage, twoTap, toast } from "../ui/layers.js";
import { trackSvg } from "../ui/map.js";
import { fmtTime, fmt1, fmtSigned } from "../engine/format.js";
import { gpsQuality } from "../services/gps.js";
import { hasHungarianVoice, speak, beep } from "../services/voice.js";

const line = (label, value) => h("div", { class: "row" }, h("span", { class: "txt" }, label), h("span", { class: "num", style: { fontSize: "30px", fontWeight: 700, whiteSpace: "nowrap" } }, value));

// ---------- finish: course run ----------
export function showRaceResult(app, r) {
  const run = r.run;
  const sheet = openSheet({
    render: (el) => {
      put(el, 
        h("h2", { class: "sheet-title" }, r.wasNewRecord ? "Új rekord!" : "Cél!"),
        h("p", { class: "sheet-text", style: { margin: 0 } }, r.courseName),
        h("div", { class: `result-time num${r.wasNewRecord ? " record" : ""}` }, fmtTime(r.elapsedSeconds)),
        h("p", { class: `result-note ${r.recordDelta == null ? "" : r.recordDelta < 0 ? "good" : "bad"}` },
          r.recordDelta == null ? "Ez az első időd ezen a pályán." : r.wasNewRecord ? `${fmtSigned(r.recordDelta)} az előző rekordhoz képest` : `Rekord: ${fmtTime(r.bestSeconds)}  (${fmtSigned(r.recordDelta)})`),
        r.sectors.length ? h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", {}, "Szektor"), h("th", { class: "r" }, "Idő"), h("th", { class: "r" }, "A rekordhoz"))),
          h("tbody", {}, ...r.sectors.map((s) => h("tr", {},
            h("td", { class: "l" }, `${s.n}.`), h("td", { class: "r" }, fmtTime(s.duration)),
            h("td", { class: `r ${s.delta < 0 ? "good" : s.delta > 0 ? "bad" : ""}` }, s.last ? "" : s.delta == null ? "–" : fmtSigned(s.delta)))))) : null,
        line("Táv", `${fmt1(run.distanceKm)} km`),
        line("Átlag", `${fmt1(run.averageSpeedKmh)} km/h`),
        line("Max", `${fmt1(run.maxSpeedKmh)} km/h`),
        run.avgHeartRate ? line("Pulzus (átlag, max)", `${run.avgHeartRate}, ${run.maxHeartRate}`) : null,
        r.auto ? h("p", { class: "help", style: { marginTop: "10px", fontSize: "17px", color: "var(--muted)" } }, "Az óra magától állt meg, amikor a legközelebb értél a célhoz.") : null,
        h("div", { class: "sheet-actions two" },
          h("button", { class: "btn secondary", onClick: () => { sheet.close(); app.openRide("run", run.id); } }, "Részletek"),
          h("button", { class: "btn primary", onClick: () => sheet.close() }, "Bezárás")));
    },
  });
}

// ---------- finish: free ride ----------
export function showFreeroamResult(app, r) {
  const s = r.session;
  const sheet = openSheet({
    render: (el) => {
      put(el, 
        h("h2", { class: "sheet-title" }, "Szabad menet vége"),
        h("div", { class: "result-time num" }, fmtTime(s.elapsedSeconds)),
        s.samples.length > 1 ? h("div", { style: { height: "120px", margin: "4px 0 8px" } }, trackSvg(s.samples, { w: 380, h: 120, pad: 10, width: 4 })) : null,
        line("Táv", `${fmt1(s.distanceKm)} km`),
        line("Átlag", `${fmt1(s.averageSpeedKmh)} km/h`),
        line("Max", `${fmt1(s.maxSpeedKmh)} km/h`),
        s.avgHeartRate ? line("Pulzus (átlag, max)", `${s.avgHeartRate}, ${s.maxHeartRate}`) : null,
        h("p", { class: "help", style: { marginTop: "10px", color: "var(--muted)" } }, "Elmentve az előzmények közé."),
        h("div", { class: "sheet-actions two" },
          h("button", { class: "btn secondary", onClick: () => { sheet.close(); app.openRide("free", s.id); } }, "Részletek"),
          h("button", { class: "btn primary", onClick: () => sheet.close() }, "Bezárás")));
    },
  });
}

// ---------- naming a newly recorded course ----------
export function showSaveTrack(app) {
  const p = app.engine.pending;
  if (!p) return;
  let input, saveBtn;
  const sheet = openSheet({
    dismissable: false,
    render: (el) => {
      input = h("input", { class: "input", maxlength: 60, placeholder: "például: Tókör", "aria-label": "Pálya neve",
        onInput: () => { saveBtn.disabled = !input.value.trim(); },
        onKeydown: (e) => { if (e.key === "Enter" && input.value.trim()) save(); } });
      saveBtn = h("button", { class: "btn primary", disabled: true, onClick: () => save() }, "Mentés");
      const discard = twoTap(h("button", { class: "btn danger" }, "Elvetés"), { armedLabel: "Biztos eldobod?", onConfirm: () => { app.engine.discardPending(); sheet.close(); toast("A felvételt eldobtad."); } });
      put(el, 
        h("h2", { class: "sheet-title" }, "Új pálya mentése"),
        h("div", { style: { height: "120px", margin: "4px 0 8px" } }, trackSvg(p.points, { w: 380, h: 120, pad: 10, width: 4 })),
        line("Táv", `${fmt1(p.distanceKm)} km`),
        line("Idő (ez lesz a rekord)", fmtTime(p.elapsedSeconds)),
        line("Részidők", String(p.splits.length)),
        h("div", { class: "field" }, h("label", {}, "Adj nevet a pályának"), input),
        h("div", { class: "sheet-actions two" }, discard, saveBtn));
      setTimeout(() => input.focus(), 100);
    },
  });
  function save() {
    const course = app.engine.savePending(input.value, Date.now());
    if (!course) return;
    sheet.close();
    toast(`Mentve: ${course.name}`, { kind: "good" });
    app.setTab("courses");
  }
}

// ---------- carrying on after the app was closed mid-ride ----------
export function showRecovery(app, snap) {
  const kind = { freeroam: "Szabad menet", record: "Pálya felvétele", race: "Pályafutam" }[snap.mode] || "Menet";
  const ago = Math.round((Date.now() - snap.savedAt) / 60000);
  const sheet = openSheet({
    dismissable: false,
    render: (el) => {
      put(el, 
        h("h2", { class: "sheet-title" }, "Félbeszakadt menet"),
        h("p", { class: "sheet-text" }, `${kind}, ${fmt1(snap.session.distanceKm)} km. Az app ${ago < 1 ? "épp most" : `${ago} perce`} bezárult menet közben.`),
        h("div", { class: "sheet-actions" },
          h("button", { class: "btn primary", onClick: () => { sheet.close(); app.resumeRide(snap); } }, icon("play", { filled: true }), "Folytatom"),
          snap.mode !== "race" ? h("button", { class: "btn secondary", onClick: () => { sheet.close(); app.resumeRide(snap, { finishAt: snap.savedAt }); } }, "Lezárom és elmentem") : null,
          twoTap(h("button", { class: "btn danger" }, "Eldobom"), { armedLabel: "Biztos eldobod?", onConfirm: () => { sheet.close(); app.dropSnapshot(); } })),
        h("p", { class: "help", style: { color: "var(--muted)", fontSize: "17px", marginTop: "10px" } }, snap.mode === "freeroam" ? "Szabad menetnél a kiesett idő szünetnek számít." : "Pályafutamnál és felvételnél az óra közben is ment."));
    },
  });
}

// ---------- status cards ----------
export function showGpsInfo(app) {
  const f = app.engine.fix;
  openSheet({
    render: (el) => {
      const q = gpsQuality(f?.acc);
      put(el, 
        h("h2", { class: "sheet-title" }, "GPS"),
        app.gps.simulating ? h("p", { class: "sheet-text" }, "Szimulált GPS van bekapcsolva (Beállítások → Teszt).") : null,
        line("Jel", f ? `${q.label}, ±${Math.round(f.acc)} m` : "Nincs jel"),
        line("Sebesség", f ? `${fmt1(f.speedKmh)} km/h` : "–"),
        line("Magasság", f?.alt != null ? `${Math.round(f.alt)} m` : "–"),
        line("Szélesség", f ? f.lat.toFixed(5) : "–"),
        line("Hosszúság", f ? f.lng.toFixed(5) : "–"),
        line("Utolsó jel", f ? `${Math.max(0, Math.round((Date.now() - f.t) / 1000))} mp-e` : "–"),
        h("p", { class: "help", style: { color: "var(--muted)", marginTop: "10px" } }, "Távot csak 30 m-nél pontosabb jelből számol, mint a régi app. 8 m alatt kiváló, 15 m alatt jó."));
    },
  });
}

export function showHeartRate(app) {
  const sheet = openSheet({
    render: (el) => {
      const st = app.hr.status;
      const bpm = app.engine.hrBpm(Date.now());
      const head = h("h2", { class: "sheet-title" }, "Pulzusmérő");
      if (st === "unsupported" && !app.settings.simHr) {
        put(el, head, h("p", { class: "sheet-text" }, "Ez a böngésző nem tud Bluetooth eszközhöz csatlakozni. Androidon a Chrome tud; iPhone-on egyik böngésző sem."));
        return;
      }
      const connected = st === "on";
      put(el, head,
        line("Állapot", { on: "Csatlakozva", connecting: "Csatlakozás…", reconnecting: "Újracsatlakozás…", off: "Nincs csatlakozva" }[st] || "–"),
        app.hr.name ? line("Eszköz", app.hr.name) : null,
        connected ? line("Pulzus", bpm != null ? `${bpm} bpm` : "Nincs jel") : null,
        app.hr.battery != null ? line("Elem", `${app.hr.battery}%`) : null,
        h("p", { class: "help", style: { color: "var(--muted)", margin: "12px 0" } }, "CYCPLUS H1: kapcsold be (a fény villogni kezd), tedd fel a karodra, majd koppints a Csatlakoztatás gombra, és válaszd ki a listából. Ha menet közben megszakad, magától újracsatlakozik."),
        h("div", { class: "sheet-actions" },
          connected || st === "reconnecting"
            ? h("button", { class: "btn secondary", onClick: () => { app.hr.disconnect(); sheet.refresh(); } }, "Leválasztás")
            : h("button", { class: "btn primary", onClick: async () => { await app.connectHeartRate(); sheet.refresh(); } }, icon("heart", { filled: true }), "Csatlakoztatás")));
    },
  });
}

export function showWakeInfo(app) {
  openSheet({
    render: (el) => {
      const ws = app.state.wakeState;
      put(el, 
        h("h2", { class: "sheet-title" }, "Képernyő ébren tartása"),
        h("p", { class: "sheet-text" }, ws === "off"
          ? "Most nem sikerült ébren tartani a képernyőt. Koppints bárhová a képernyőn, és újra próbálja. Ha az energiatakarékos mód be van kapcsolva, kapcsold ki."
          : "Amíg az app nyitva van, a képernyő nem kapcsol ki és nem zárol le magától."),
        h("p", { class: "sheet-text" }, "A bekapcsológombot egy weboldal nem tudja letiltani. Ha véletlenül megnyomod, nyisd meg újra: a menet ideje fut tovább, a kimaradt távot pedig pótolja."),
        h("div", { class: "sheet-actions" }, h("button", { class: "btn primary", onClick: () => app.wake.acquire() }, "Rendben")));
    },
  });
}

// ---------- settings ----------
export function openSettings(app) {
  const S = app.settings;
  const sw = (key, label, sub, after) => {
    const b = h("button", { class: "switch", role: "switch", "aria-checked": String(!!S[key]), "aria-label": label,
      onClick: () => { S[key] = !S[key]; b.setAttribute("aria-checked", String(!!S[key])); app.saveSettings(); after?.(S[key]); } });
    return h("div", { class: "row" }, h("span", { class: "txt" }, label, sub ? h("small", {}, sub) : null), b);
  };
  const stepper = (key, label, sub, step, min, max, after) => {
    const v = h("span", { class: "num" }, String(S[key]));
    const set = (n) => { S[key] = Math.max(min, Math.min(max, n)); v.textContent = String(S[key]); app.saveSettings(); after?.(S[key]); };
    return h("div", { class: "row" }, h("span", { class: "txt" }, label, sub ? h("small", {}, sub) : null),
      h("div", { class: "stepper" }, h("button", { "aria-label": "Kevesebb", onClick: () => set(S[key] - step) }, "−"), v, h("button", { "aria-label": "Több", onClick: () => set(S[key] + step) }, "+")));
  };

  openPage({
    title: "Beállítások",
    render: (body) => {
      const voiceNote = hasHungarianVoice() ? null : h("p", { class: "help" }, "Ezen az eszközön nincs magyar felolvasó hang, ezért csak sípolás lesz. Telefonon: Beállítások → Általános kezelés → Szövegfelolvasó → Google, nyelv: magyar.");
      const courseSel = h("select", { class: "input", style: { fontSize: "21px" }, "aria-label": "Szimulált útvonal",
        onChange: (e) => { S.simCourseId = e.target.value; app.saveSettings(); if (S.simGps) app.restartGps(); } },
        ...app.repo.courses.map((c) => h("option", { value: c.id, selected: c.id === S.simCourseId }, c.name)));
      put(body, h("div", { class: "section" },
        h("h2", {}, "Pulzus"),
        h("button", { class: "btn secondary small", style: { width: "100%" }, onClick: () => app.openHeartRate() }, icon("heart", { filled: true }), app.hr.status === "on" ? `Pulzusmérő: ${app.hr.name || "csatlakozva"}` : "Pulzusmérő csatlakoztatása"),
        stepper("maxHr", "Maximális pulzus", "A zónákhoz. Ökölszabály: 220 − életkor (50 évesen 170).", 1, 120, 220),

        h("h2", {}, "Hang"),
        sw("voice", "Bemondás", "Visszaszámlálás, részidők, cél"),
        sw("kmVoice", "Kilométerenként", "Szabad menetben: táv, idő, átlag"),
        voiceNote,
        h("button", { class: "btn secondary small", style: { width: "100%", marginTop: "10px" }, onClick: () => { beep(880, 120); if (!speak("Második szektor, három másodperccel előrébb.", { interrupt: true })) toast("Nincs magyar hang, csak sípolás."); } }, "Hang kipróbálása"),

        h("h2", {}, "Pályafutam"),
        sw("autoFinish", "Automatikus cél", "Az óra magától megáll ott, ahol a legközelebb érsz a célhoz. Nem kell gombot nyomni."),
        sw("raceMap", "Pályarajz futam közben", "Kis térkép rólad és a rekord menetről"),

        h("h2", {}, "Képernyő"),
        h("p", { class: "help" }, "Amíg az app nyitva van, a képernyő ébren marad és nem zárol le magától. Ezt nem lehet kikapcsolni."),

        h("h2", {}, "Teszt (asztali géphez)"),
        sw("simGps", "Szimulált GPS", "Kitalált menet a kiválasztott pályán, GPS nélkül", () => app.restartGps()),
        h("div", { class: "field" }, h("label", {}, "Szimulált útvonal"), courseSel),
        stepper("simKmh", "Szimulált sebesség", "km/h", 5, 5, 120, (v) => app.gps.setSimSpeed(v)),
        sw("simHr", "Szimulált pulzus", "Kitalált pulzus pulzusmérő nélkül", (on) => app.hr.simulate(on)),

        h("h2", {}, "Egyéb"),
        h("a", { class: "btn secondary small", href: "../", style: { textDecoration: "none" } }, icon("home"), "Vissza a toolboxba"),
        h("p", { class: "footer-note" }, `DesiBuff web ${app.version}. Az adatok csak ezen az eszközön vannak.`)));
    },
  });
}

