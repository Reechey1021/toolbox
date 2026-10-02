// main.js
// Starts the app and wires everything together.

import { h, icon } from "./ui/dom.js";
import { closeTop, toast, hasLayers, closeAll } from "./ui/layers.js";
import { RideEngine } from "./engine/ride.js";
import { sayDelta, sayTime, sayNum, fmtDelta } from "./engine/format.js";
import { Repo } from "./data/repo.js";
import * as store from "./data/store.js";
import { createGps } from "./services/gps.js";
import { createHeartRate } from "./services/hr.js";
import { createWakeLock } from "./services/wakelock.js";
import { speak, beep, buzz, unlockAudio } from "./services/voice.js";
import { rideScreen } from "./screens/ride.js";
import { coursesScreen, openCourse } from "./screens/courses.js";
import { profileScreen, openRidePage } from "./screens/profile.js";
import { showRaceResult, showFreeroamResult, showSaveTrack, showRecovery, showGpsInfo, showHeartRate, showWakeInfo, openSettings } from "./screens/sheets.js";

const VERSION = "1.0.0";
const DEFAULT_SETTINGS = { maxHr: 170, voice: true, kmVoice: true, autoFinish: true, raceMap: true, simGps: false, simKmh: 25, simCourseId: "reservoir_cw", simHr: false };
const ORDINALS = ["", "Első", "Második", "Harmadik", "Negyedik", "Ötödik", "Hatodik", "Hetedik", "Nyolcadik", "Kilencedik", "Tizedik"];

async function boot() {
  const saved = await store.loadAll().catch(() => ({}));
  store.askPersistent();

  const settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
  const repo = new Repo({ persist: (k, v) => store.save(k, v), data: saved });
  const engine = new RideEngine({ repo, settings });

  const app = {
    version: VERSION, repo, engine, settings,
    state: { tab: "ride", gpsStatus: "off", wakeState: "off", battery: null, preImport: !!saved.preImport },
  };

  app.gps = createGps({
    onFix: (fix) => engine.onFix(fix),
    onStatus: (s) => { app.state.gpsStatus = s; },
  });
  app.hr = createHeartRate({
    onBpm: (bpm, t) => engine.onHeartRate(bpm, t),
    onStatus: () => {},
  });
  app.wake = createWakeLock({ onChange: (s) => { app.state.wakeState = s; } });

  // ---------- screens & tabs ----------
  const view = document.getElementById("view");
  const tabsEl = document.getElementById("tabs");
  const screens = { ride: rideScreen(app), courses: null, profile: null };
  const tabButtons = {};
  for (const [id, label, ic] of [["ride", "Utazás", "ride"], ["courses", "Pályák", "courses"], ["profile", "Profil", "profile"]]) {
    tabButtons[id] = h("button", { onClick: () => app.setTab(id) }, icon(ic), label);
    tabsEl.appendChild(tabButtons[id]);
  }

  app.setTab = (id) => {
    if (id !== "ride" && engine.busy) { toast("Menet közben az Utazás képernyő marad elöl."); id = "ride"; }
    app.state.tab = id;
    for (const [k, b] of Object.entries(tabButtons)) b.setAttribute("aria-current", k === id ? "page" : "false");
    if (id !== "ride" || !screens.ride) {
      screens[id] = id === "courses" ? coursesScreen(app) : id === "profile" ? profileScreen(app) : screens.ride;
    }
    view.replaceChildren(screens[id].el);
    view.scrollTop = 0;
    if (id === "ride") screens.ride.update();
  };
  app.refresh = () => {
    const s = screens[app.state.tab];
    if (app.state.tab === "ride") s.update(); else s?.render();
  };
  repo.on(() => { if (app.state.tab !== "ride") app.refresh(); });

  // ---------- actions the screens call ----------
  const now = () => Date.now();
  app.startFreeroam = () => { unlockAudio(); engine.startFreeroam(now()); app.setTab("ride"); };
  app.startRecording = () => { unlockAudio(); engine.startRecording(now()); app.setTab("ride"); };
  app.startRace = (id) => {
    unlockAudio();
    const c = repo.course(id);
    if (!c) return;
    closeAll();
    if (engine.startRace(c, now())) app.setTab("ride");
  };
  app.togglePause = () => engine.togglePause(now());
  app.finishFreeroam = () => engine.finishFreeroam(now());
  app.stopRecording = () => engine.stopRecording(now());
  app.abortRace = () => engine.abortRace();
  app.finishRace = () => engine.finishRace(now());
  app.openCourse = (id) => openCourse(app, id);
  app.openRide = (kind, id) => openRidePage(app, kind === "free" ? "free" : "run", id);
  app.openSettings = () => openSettings(app);
  app.openGpsInfo = () => showGpsInfo(app);
  app.openHeartRate = () => showHeartRate(app);
  app.openWakeInfo = () => showWakeInfo(app);
  app.saveSettings = () => store.save("settings", settings);
  app.connectHeartRate = async () => { if (settings.simHr) { settings.simHr = false; app.saveSettings(); app.hr.simulate(false); } await app.hr.pick(); };
  app.restartGps = () => {
    const c = repo.course(settings.simCourseId) || repo.courses[0];
    app.gps.start(settings.simGps && c ? { route: c.routePoints, kmh: settings.simKmh } : null);
  };
  app.saveImportUndo = async () => { await store.save("preImport", repo.snapshot()); app.state.preImport = true; };
  app.undoImport = async () => {
    const snap = await store.get("preImport");
    if (snap) repo.restoreSnapshot(snap);
    await store.del("preImport");
    app.state.preImport = false;
    app.refresh();
  };
  app.resumeRide = (snap, { finishAt } = {}) => {
    if (!engine.restore(snap, now())) { toast("Nem sikerült folytatni a menetet.", { kind: "bad" }); store.del("activeRide"); return; }
    app.setTab("ride");
    if (finishAt) {
      if (snap.mode === "freeroam") engine.finishFreeroam(now());
      else if (snap.mode === "record") engine.stopRecording(finishAt);
    } else toast("Folytatjuk. Jó utat!", { kind: "good" });
  };
  app.dropSnapshot = () => { store.del("activeRide"); toast("A félbeszakadt menetet eldobtad."); };

  // ---------- what the rider hears and feels ----------
  const say = (text) => { if (settings.voice) speak(text); };
  engine.on((ev) => {
    switch (ev.type) {
      case "countdown":
        beep(660, 160); buzz(60);
        break;
      case "go":
        beep(1320, 450); buzz([120, 60, 120]);
        break;
      case "split": {
        const cls = ev.delta == null ? "" : ev.delta < 0 ? "ahead" : ev.delta > 0 ? "behind" : "";
        toast([h("span", { class: "t" }, `${ev.n}. részidő`), h("span", { class: "d" }, ev.delta == null ? "–" : fmtDelta(ev.delta))], { kind: `split ${cls}`, ms: 6000 });
        beep(ev.delta != null && ev.delta < 0 ? 1175 : 587, 160); beep(ev.delta != null && ev.delta < 0 ? 1568 : 440, 200, 0.18);
        buzz([80, 60, 80]);
        say(`${ORDINALS[ev.n] || ev.n + "."} részidő. ${ev.delta == null ? "" : sayDelta(ev.delta)}`);
        break;
      }
      case "split-marked":
        toast(`${ev.n}. részidő megjelölve`, { kind: "good", ms: 2000 }); beep(988, 140); buzz(60);
        break;
      case "km":
        if (settings.kmVoice) say(`${ev.km} kilométer. ${sayTime(engine.freeroamElapsedMs(now()) / 1000)}. Átlag ${sayNum(engine.averageKmh(now()))}.`);
        break;
      case "pause":
        beep(ev.paused ? 440 : 880, 200); buzz(80); say(ev.paused ? "Szünet" : "Folytatás");
        break;
      case "gap":
        toast(`A GPS ${ev.seconds} mp-ig nem adott jelet (képernyő ki volt kapcsolva?). A kimaradt ${ev.metres} m-t hozzáadtam.`, { ms: 6000 });
        break;
      case "toast":
        toast(ev.text);
        break;
      case "pending":
        store.del("activeRide");
        showSaveTrack(app);
        break;
      case "finish":
        store.del("activeRide");
        buzz([200, 100, 200, 100, 400]);
        if (ev.kind === "race") {
          const r = ev.result;
          beep(1047, 180); beep(1319, 180, 0.2); beep(1568, 420, 0.4);
          say(r.wasNewRecord ? `Cél! Új rekord! ${sayTime(r.elapsedSeconds)}.` : `Cél. ${sayTime(r.elapsedSeconds)}, ${sayDelta(r.recordDelta)}.`);
          showRaceResult(app, r);
        } else {
          beep(1047, 300);
          say(`Szabad menet vége. ${sayNum(ev.result.session.distanceKm)} kilométer.`);
          showFreeroamResult(app, ev.result);
        }
        break;
    }
    if (app.state.tab === "ride") screens.ride.update();
  });

  // ---------- the loop: 4 times a second ----------
  let lastSnap = 0;
  setInterval(() => {
    const t = now();
    engine.tick(t);
    if (app.state.tab === "ride") screens.ride.update();
    tabsEl.hidden = engine.busy;
    if (engine.busy && t - lastSnap > 8000) { lastSnap = t; saveSnapshot(); }
  }, 250);
  const saveSnapshot = () => { const s = engine.snapshot(now()); if (s) store.save("activeRide", s); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveSnapshot(); });
  window.addEventListener("pagehide", saveSnapshot);

  // ---------- the back gesture ----------
  // Closes pop-ups first. Mid-ride it never leaves the app. On the main screen
  // it needs two presses to leave, so a stray swipe can't close it.
  let exitArmedUntil = 0;
  const arm = () => history.pushState({ desibuff: true }, "");
  history.replaceState({ desibuffBase: true }, "");
  arm();
  document.addEventListener("pointerdown", function once() { arm(); document.removeEventListener("pointerdown", once, true); }, true);
  window.addEventListener("popstate", () => {
    if (hasLayers()) { closeTop(); arm(); return; }
    if (engine.busy) { arm(); toast("Menet közben nem lehet kilépni. Előbb fejezd be a menetet."); buzz(80); return; }
    if (app.state.tab !== "ride") { arm(); app.setTab("ride"); return; }
    if (Date.now() < exitArmedUntil) { history.back(); return; }
    exitArmedUntil = Date.now() + 2500;
    arm();
    toast("Nyomd meg még egyszer a kilépéshez.", { ms: 2500 });
  });
  window.addEventListener("beforeunload", (e) => { if (engine.busy) { saveSnapshot(); e.preventDefault(); e.returnValue = ""; } });

  // ---------- battery (shown in the status strip) ----------
  try {
    const b = await navigator.getBattery?.();
    if (b) {
      const upd = () => {
        const was = app.state.battery;
        app.state.battery = { level: b.level, charging: b.charging };
        if (was && was.level > 0.15 && b.level <= 0.15 && !b.charging) toast("Az akkumulátor 15% alatt van.", { kind: "bad", ms: 6000 });
      };
      upd();
      b.addEventListener("levelchange", upd);
      b.addEventListener("chargingchange", upd);
    }
  } catch { /* not available */ }

  // ---------- go ----------
  app.setTab("ride");
  app.wake.acquire();
  app.restartGps();
  if (settings.simHr) app.hr.simulate(true);
  else app.hr.tryRemembered();
  document.getElementById("boot")?.remove();

  if (saved.activeRide && Date.now() - saved.activeRide.savedAt < 12 * 3600 * 1000) showRecovery(app, saved.activeRide);
  else if (saved.activeRide) store.del("activeRide");

  if ("serviceWorker" in navigator && !location.search.includes("nosw") && location.protocol === "https:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  window.__desibuff = app; // handy for debugging from the console
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById("app");
  el.innerHTML = "";
  el.appendChild(h("div", { class: "boot-note" }, h("h1", {}, "Hiba indításkor"), h("p", {}, String(err?.message || err))));
});
