// screens/ride.js
// The screen on the handlebar. One hero number per mode, everything else in a
// fixed grid with three sizes of number. What's shown, in order of importance:
//
//   idle      speed · nearby course · start buttons · heading/height
//   free ride speed · moving time · distance · average/max · heart rate
//   recording speed · time · distance · splits so far · heart rate
//   race      gap to the record (the whole band turns green/red) · speed ·
//             time · distance left · thin course strip with you and the ghost
//
// The layout is only rebuilt when the mode changes; otherwise update() just
// rewrites numbers, 4 times a second.

import { h, icon, setText, setClass, fitWidth } from "../ui/dom.js";
import { twoTap } from "../ui/layers.js";
import { fmtMs, fmtTime, fmtDelta, fmtKmLive, fmt1 } from "../engine/format.js";
import { compassHu } from "../engine/geo.js";
import { gpsQuality } from "../services/gps.js";
import { zoneLimits, zoneOf, zoneFill, ZONE_COLORS } from "../engine/zones.js";

const mapOn = (app) => app.settings.liveMap !== false;
const hrOn = (app) => app.hr.status !== "off" && app.hr.status !== "unsupported";
/** The live map takes whatever space is left above the buttons. */
const mapSlot = (app, body) => { if (mapOn(app)) app.minimap.mount(body); };

function cell(label, iconName, { tier = 2, wide = false } = {}) {
  const val = h("span", { class: "num" }, "–");
  const unit = h("small");
  const sub = h("div", { class: "sub" });
  const row = h("div", { class: "val" }, val, unit);
  const el = h("div", { class: `cell${tier === 3 ? " t3" : ""}${wide ? " wide" : ""}` },
    h("div", { class: "lab" }, iconName ? icon(iconName) : null, label), row, sub);
  return { el, val, unit, sub, set(v, u = "", s = "") { setText(val, v); setText(unit, u); setText(sub, s); fitWidth(row, el); } };
}

/**
 * The heart-rate tile: a big bpm number and a fat five-part bar. The bar fills
 * with the actual pulse, not just the zone: each part covers its zone's bpm
 * range, so 135 in a 120–150 zone 4 fills half of the 4th part. The whole
 * filled bar takes the colour of the zone he's in.
 */
function hrCell(app) {
  const num = h("span", { class: "num" }, "–");
  const status = h("div", { class: "sub" });
  const fills = [0, 1, 2, 3, 4].map(() => h("b"));
  const bar = h("div", { class: "hr-bar", role: "img", "aria-label": "Pulzuszónák" }, ...fills.map((b) => h("i", {}, b)));
  const el = h("div", { class: "cell wide hr-cell" },
    h("div", { class: "hr-row" },
      h("div", { class: "hr-num" }, num, h("small", {}, "bpm")),
      h("div", { class: "hr-side" }, h("div", { class: "lab" }, icon("heart", { filled: true }), "Pulzus"), bar)),
    status);
  return {
    el,
    update(t) {
      const bpm = app.engine.hrBpm(t);
      if (bpm == null) {
        setText(num, "–");
        setText(status, app.hr.status === "reconnecting" ? "Újracsatlakozás…" : "Nincs jel a pulzusmérőtől");
        fills.forEach((b) => { b.style.width = "0%"; });
        return;
      }
      setText(num, String(bpm));
      setText(status, "");
      const L = zoneLimits(app.settings);
      const color = ZONE_COLORS[zoneOf(bpm, L)];
      zoneFill(bpm, L).forEach((f, i) => { fills[i].style.width = `${(f * 100).toFixed(1)}%`; fills[i].style.background = color; });
    },
  };
}

export function statusBar(app) {
  const clock = h("span", { class: "clock num" });
  const gpsLabel = h("span");
  const bars = h("span", { class: "bars" }, ...[6, 10, 14, 18].map((ht) => h("i", { style: { height: `${ht}px` } })));
  const gps = h("button", { class: "chip", onClick: () => app.openGpsInfo(), "aria-label": "GPS állapot" }, bars, gpsLabel);
  const hrVal = h("span", { class: "num" });
  const hr = h("button", { class: "chip", style: { flexShrink: 0 }, onClick: () => app.openHeartRate(), "aria-label": "Pulzusmérő" }, icon("heart", { filled: true }), hrVal);
  // one chip for the screen-awake state and the battery: the sun is green while the screen is held on
  const batt = h("span", { class: "num" });
  const wake = h("button", { class: "chip", onClick: () => app.openWakeInfo(), "aria-label": "Képernyő ébren tartása és akkumulátor" }, icon("sun"), batt);
  const el = h("div", { class: "status" }, clock, gps, hr, wake);

  function update(t) {
    const d = new Date(t);
    setText(clock, `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    const st = app.state.gpsStatus;
    const fix = app.engine.fix;
    const fresh = fix && t - fix.t < 10000;
    const q = gpsQuality(fresh ? fix.acc : null);
    let gcls = "chip", glabel;
    if (st === "denied" || st === "insecure" || st === "unavailable") { gcls += " bad"; glabel = "Nincs GPS"; }
    else if (!fresh) { gcls += " warn"; glabel = st === "lost" ? "Jel elveszett" : "Keresés…"; }
    else { gcls += q.level >= 3 ? " ok" : q.level === 2 ? " warn" : " bad"; glabel = app.gps.simulating ? "Szim." : q.label; }
    // with the heart-rate chip showing there isn't room for both labels on a phone:
    // the GPS chip drops to bars only (its colour still says how good the signal is)
    const hrVisible = !(app.hr.status === "unsupported" && !app.settings.simHr);
    const narrow = hrVisible && el.clientWidth < 520;
    setClass(gps, gcls);
    setText(gpsLabel, narrow && fresh ? "" : glabel);
    [...bars.children].forEach((b, i) => setClass(b, i < (fresh ? q.level : 0) ? "on" : ""));

    const hs = app.hr.status;
    if (hs === "unsupported" && !app.settings.simHr) hr.hidden = true;
    else {
      hr.hidden = false;
      const bpm = app.engine.hrBpm(t);
      if (bpm != null) { setClass(hr, `chip z${zoneOf(bpm, zoneLimits(app.settings))}`); setText(hrVal, String(bpm)); }
      else if (hs === "reconnecting" || hs === "connecting") { setClass(hr, "chip warn"); setText(hrVal, "…"); }
      else if (hs === "on") { setClass(hr, "chip warn"); setText(hrVal, "–"); }
      else { setClass(hr, "chip off"); setText(hrVal, "+"); }
    }
    const b = app.state.battery;
    setText(batt, b ? `${Math.round(b.level * 100)}%` : "");
    batt.style.color = b && b.level <= 0.15 && !b.charging ? "var(--red)" : b ? "var(--text)" : "";
    const ws = app.state.wakeState;
    setClass(wake, `chip ${ws === "off" ? "bad" : "ok"}`);
  }
  return { el, update };
}

export function rideScreen(app) {
  const el = h("div", { class: "ride" });
  const status = statusBar(app);
  let key = null;
  let fill = () => {};

  function layoutKey(t) {
    const e = app.engine;
    const hrShown = app.hr.status !== "off" && app.hr.status !== "unsupported";
    return [
      e.mode, e.mode === "freeroam" && e.freeroam.paused, e.mode === "race" && !!e.race.ref, hrShown,
      mapOn(app), e.mode === "idle" ? e.nearby.map((c) => c.id).join(",") : "",
      e.mode === "idle" ? gpsProblem(app, t) : "", e.countdown ? "cd" : "",
    ].join("|");
  }

  function build(t) {
    const e = app.engine;
    const body = h("div", { class: "ride-body" });
    const parts = { idle: buildIdle, freeroam: buildFreeroam, record: buildRecord, race: buildRace }[e.mode];
    fill = parts(app, body, t);
    el.replaceChildren(status.el, body);
    if (e.countdown) el.appendChild(buildCountdown(app));
  }

  function update() {
    const t = Date.now();
    const k = layoutKey(t);
    if (k !== key) { key = k; build(t); }
    status.update(t);
    fill(t);
  }
  return { el, update };
}

function gpsProblem(app, t) {
  const st = app.state.gpsStatus;
  if (st === "denied" || st === "insecure" || st === "unavailable") return st;
  const fix = app.engine.fix;
  if (!fix || t - fix.t > 10000) return st === "lost" ? "lost" : "searching";
  return "";
}

const GPS_HELP = {
  denied: ["A helymeghatározás tiltva van", "Engedélyezd: Chrome-ban koppints a címsor melletti ikonra, majd Engedélyek → Hely → Engedélyezés. Telepített appnál: telefon Beállítások → Alkalmazások → DesiBuff → Engedélyek → Hely."],
  insecure: ["A GPS-hez https:// cím kell", "Nyisd meg az appot a https://reech.lol/desibuff/ címen."],
  unavailable: ["Ez a böngésző nem ad helyadatot", "Használd a Chrome-ot."],
  searching: ["GPS jel keresése…", "Állj szabad ég alá. Az első helymeghatározás fél percig is eltarthat."],
  lost: ["Elveszett a GPS jel", "Ha a képernyő ki volt kapcsolva, pár másodperc múlva visszajön."],
};

// ---------- idle ----------
function buildIdle(app, body, t) {
  const e = app.engine;
  const speed = h("span", { class: "speed num" }, "0");
  body.append(h("div", { class: "hero" }, speed, h("span", { class: "unit" }, "km/h")));

  const problem = gpsProblem(app, t);
  if (problem && GPS_HELP[problem]) {
    const [title, text] = GPS_HELP[problem];
    body.append(h("div", { class: `banner ${problem === "searching" || problem === "lost" ? "pause" : "rec"}`, style: { textAlign: "left", display: "block", fontSize: "21px" } },
      h("div", {}, title), h("div", { style: { fontWeight: 500, fontSize: "18px", marginTop: "4px" } }, text)));
  }

  for (const c of e.nearby.slice(0, 2)) {
    const rec = c.recordTimeSeconds != null ? `Rekord: ${fmtTime(c.recordTimeSeconds)}` : "Még nincs rekord";
    body.append(h("div", { class: "nearby" },
      h("div", { class: "what" }, "Pálya a közelben"),
      h("button", { class: "x", onClick: () => { e.dismissNearby(c.id, Date.now()); app.refresh(); } }, "Most nem"),
      h("div", { style: { minWidth: 0 } }, h("div", { class: "name" }, c.name), h("div", { class: "rec" }, `${fmt1(c.distanceKm)} km, ${rec}`)),
      h("button", { class: "btn primary", onClick: () => app.startRace(c.id) }, icon("flag"), "Indítás")));
  }

  const head = cell("Irány", "compass", { tier: 3 });
  const alt = cell("Magasság", "mountain", { tier: 3 });
  const dist = cell("Megtett táv", null, { tier: 3 });
  const max = cell("Max", null, { tier: 3 });
  const hr = hrOn(app) ? hrCell(app) : null;
  // With the live map on, its compass shows the direction, so the tiles are just
  // distance and max (plus heart rate). Without it, heading and height come back.
  // With a course nearby, one row is enough: the start buttons must stay in view.
  if (mapOn(app)) body.append(h("div", { class: "grid" }, dist.el, max.el, hr?.el));
  else body.append(h("div", { class: "grid" }, head.el, alt.el, e.nearby.length ? null : [dist.el, max.el], hr?.el));
  mapSlot(app, body);
  body.append(h("div", { class: "controls" },
    h("button", { class: "btn primary full", onClick: () => app.startFreeroam() }, icon("play", { filled: true }), "Szabad menet"),
    h("button", { class: "btn secondary full", onClick: () => app.startRecording() }, icon("record"), "Új pálya felvétele")));

  return (now) => {
    const f = e.fix;
    const fresh = f && now - f.t < 10000;
    setText(speed, fresh ? String(Math.round(f.speedKmh)) : "–");
    head.set(e.heading != null ? compassHu(e.heading) : "–", e.heading != null ? `${Math.round(e.heading)}°` : "");
    alt.set(fresh && f.alt != null ? String(Math.round(f.alt)) : "–", "m");
    dist.set(fmt1(e.session.distanceKm), "km");
    max.set(fmt1(e.session.maxKmh), "km/h");
    hr?.update(now);
  };
}

// ---------- free ride ----------
function buildFreeroam(app, body) {
  const e = app.engine;
  const paused = e.freeroam.paused;
  if (paused) body.append(h("div", { class: "banner pause" }, "Szünet: az idő és a táv áll"));
  const speed = h("span", { class: "speed num" });
  body.append(h("div", { class: `hero${paused ? " paused" : ""}` }, speed, h("span", { class: "unit" }, "km/h")));
  const time = cell("Idő", "clock"), dist = cell("Táv"), avg = cell("Átlag", null, { tier: 3 }), max = cell("Max", null, { tier: 3 });
  const grid = h("div", { class: "grid" }, time.el, dist.el, avg.el, max.el);
  const showHr = app.hr.status !== "off" && app.hr.status !== "unsupported";
  const hr = showHr ? hrCell(app) : null;
  const alt = showHr ? null : cell("Magasság", "mountain", { tier: 3 });
  const head = showHr ? null : cell("Irány", "compass", { tier: 3 });
  if (hr) grid.append(hr.el); else grid.append(alt.el, head.el);
  body.append(grid);

  const pauseBtn = h("button", { class: `btn ${paused ? "primary" : "amber"}`, onClick: () => app.togglePause() },
    icon(paused ? "play" : "pause", { filled: paused }), paused ? "Folytatás" : "Szünet");
  const endBtn = twoTap(h("button", { class: "btn danger" }, icon("stop"), "Vége"), { onConfirm: () => app.finishFreeroam() });
  mapSlot(app, body);
  body.append(h("div", { class: "controls" }, pauseBtn, endBtn));

  return (t) => {
    const f = e.fix;
    setText(speed, f && t - f.t < 10000 ? String(Math.round(f.speedKmh)) : "–");
    time.set(fmtMs(e.freeroamElapsedMs(t)));
    dist.set(fmtKmLive(e.session.distanceKm), "km");
    avg.set(fmt1(e.averageKmh(t)), "km/h");
    max.set(fmt1(e.session.maxKmh), "km/h");
    if (hr) hr.update(t);
    if (alt) alt.set(f && f.alt != null ? String(Math.round(f.alt)) : "–", "m");
    if (head) head.set(e.heading != null ? compassHu(e.heading) : "–", e.heading != null ? `${Math.round(e.heading)}°` : "");
  };
}

// ---------- recording a course ----------
function buildRecord(app, body) {
  const e = app.engine;
  const count = h("span", {}, "Új pálya felvétele");
  body.append(h("div", { class: "banner rec" }, h("span", { class: "dot" }), count));
  const speed = h("span", { class: "speed num" });
  body.append(h("div", { class: "hero" }, speed, h("span", { class: "unit" }, "km/h")));
  const time = cell("Idő", "clock"), dist = cell("Táv"), max = cell("Max", null, { tier: 3 }), splits = cell("Részidők", "split", { tier: 3 });
  const grid = h("div", { class: "grid" }, time.el, dist.el, max.el, splits.el);
  const showHr = app.hr.status !== "off" && app.hr.status !== "unsupported";
  const hr = showHr ? hrCell(app) : null;
  if (hr) grid.append(hr.el);
  body.append(grid);
  const splitBtn = h("button", { class: "btn sector", onClick: () => app.engine.addSplit() }, icon("split"), "Részidő");
  const stopBtn = twoTap(h("button", { class: "btn danger" }, icon("stop"), "Felvétel vége"), { onConfirm: () => app.stopRecording() });
  mapSlot(app, body);
  body.append(h("div", { class: "controls" }, splitBtn, stopBtn));

  return (t) => {
    const f = e.fix;
    const r = e.record;
    if (!r) return;
    setText(count, `Új pálya felvétele: ${r.points.length} pont`);
    setText(speed, f && t - f.t < 10000 ? String(Math.round(f.speedKmh)) : "–");
    time.set(fmtMs(e.recordElapsedMs(t)));
    dist.set(fmtKmLive(e.session.distanceKm), "km");
    max.set(fmt1(e.session.maxKmh), "km/h");
    splits.set(String(r.splits.length), "db");
    if (hr) hr.update(t);
  };
}

// ---------- race ----------
function buildRace(app, body) {
  const e = app.engine;
  const r = e.race;
  const length = r.cum[r.cum.length - 1];

  const bandLab = h("div", { class: "lab" });
  const bandVal = h("div", { class: "val num" });
  const band = h("div", { class: `delta-band ${r.ref ? "neutral" : "first"}` }, bandLab, bandVal);
  body.append(band);

  const speed = h("span", { class: "speed num" });
  const time = h("div", { class: "val num" });
  const leftNum = h("span");
  const left = h("div", { class: "val num" }, leftNum, h("small", {}, "km"));
  body.append(h("div", { class: "race-top" },
    h("div", { class: "hero" }, speed, h("span", { class: "unit" }, "km/h")),
    h("div", { class: "side" }, h("div", { class: "lab" }, "Idő"), time, h("div", { class: "lab" }, "Hátralévő"), left)));

  // the thin course strip
  const fillBar = h("div", { class: "fill" });
  const me = h("div", { class: "me" });
  const ghost = r.ref ? h("div", { class: "ghost" }) : null;
  const ticks = r.splits.map((i) => h("div", { class: "tick", style: { left: `${(r.cum[i] / length) * 100}%` } }));
  const pct = h("b"), sect = h("span");
  body.append(h("div", { class: "strip" },
    h("div", { class: "bar" }, fillBar, ...ticks, ghost, me),
    h("div", { class: "legend" }, h("span", {}, pct, " kész"), sect, r.ref ? h("span", { style: { color: "var(--red)" } }, "● rekord") : h("span"))));


  const grid = h("div", { class: "grid" });
  const showHr = app.hr.status !== "off" && app.hr.status !== "unsupported";
  const hr = showHr ? hrCell(app) : null;
  const avg = cell("Átlag", null, { tier: 3 }), max = cell("Max", null, { tier: 3 });
  grid.append(avg.el, max.el);
  if (hr) grid.append(hr.el);
  body.append(grid);

  // "Szakít" is the old app's word for it, and short enough for half a button
  const abort = twoTap(h("button", { class: "btn danger" }, icon("close"), "Szakít"), { armedLabel: "Biztos? Még egyszer", onConfirm: () => app.abortRace() });
  const finishSub = h("small");
  const finish = h("button", { class: "btn primary", onClick: () => app.finishRace() }, icon("flag"), h("span", { class: "two-line" }, "Cél", finishSub));
  mapSlot(app, body);
  body.append(h("div", { class: "controls" }, abort, finish));

  return (t) => {
    if (e.mode !== "race") return;
    const f = e.fix;
    const elapsed = e.raceElapsedMs(t);
    if (r.ref) {
      const ds = r.delta == null ? "neutral" : r.deltaState;
      setClass(band, `delta-band ${ds}`);
      setText(bandLab, r.delta == null ? "A rekordhoz képest" : ds === "ahead" ? "Előnyben a rekordhoz képest" : ds === "behind" ? "Lemaradás a rekordhoz képest" : "Fej-fej mellett a rekorddal");
      setText(bandVal, r.delta == null ? "–" : fmtDelta(r.delta));
      fitWidth(bandVal, band);
    } else {
      setText(bandLab, `${r.course.name}: most állítod be a rekordot`);
      setText(bandVal, "Első futam");
    }
    setText(speed, f && t - f.t < 10000 ? String(Math.round(f.speedKmh)) : "–");
    fitWidth(speed, speed.parentElement);
    setText(time, fmtMs(elapsed));
    fitWidth(time); fitWidth(left);
    setText(leftNum, fmt1(Math.max(0, length - r.along) / 1000));
    const p = Math.min(1, Math.max(0, r.along / length));
    fillBar.style.width = `${p * 100}%`;
    me.style.left = `${p * 100}%`;
    if (ghost) ghost.style.left = `${Math.min(1, (r.ghostAlong || 0) / length) * 100}%`;
    ticks.forEach((tk, i) => setClass(tk, i < r.nextSplit ? "tick done" : "tick"));
    setText(pct, `${Math.round(p * 100)}%`);
    setText(sect, r.splits.length ? `${Math.min(r.nextSplit + 1, r.splits.length + 1)}/${r.splits.length + 1}. szektor` : "");
    avg.set(fmt1(e.averageKmh(t)), "km/h");
    max.set(fmt1(e.session.maxKmh), "km/h");
    if (hr) hr.update(t);
    const auto = app.settings.autoFinish !== false;
    const canFinish = r.finishEligible || r.finishReached;
    finish.disabled = !canFinish;
    setText(finishSub, canFinish ? (auto ? "vagy magától" : "most nyomd") : auto ? "magától áll meg" : "még messze");
  };
}


// ---------- countdown ----------
function buildCountdown(app) {
  const cd = app.engine.countdown;
  const what = cd.kind === "race" ? cd.course.name : cd.kind === "record" ? "Pálya felvétele indul" : "Szabad menet indul";
  const n = h("div", { class: "n num" }, String(app.engine.countdownValue(Date.now())));
  const el = h("div", { class: "countdown", role: "timer" },
    h("div", { class: "what" }, what), n,
    h("button", { class: "btn secondary", onClick: () => { app.engine.cancelCountdown(); app.refresh(); } }, "Mégse"));
  const tick = () => {
    if (!el.isConnected) return;
    setText(n, String(app.engine.countdownValue(Date.now())));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return el;
}
