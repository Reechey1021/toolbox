// ui/minimap.js
// The live map on the ride screen, GTA style: it follows him, turns so his
// direction of travel is always up, and glides between GPS fixes.
//
//   behind him   neon green (his trail, or the part of the course he's done)
//   ahead        white (the rest of the course, in a race)
//   other courses nearby  grey, with their start marked
//   record ghost red,   splits yellow,   finish red and white
//   corners      compass (top left), wind (top right, when online)
//
// Two layers: our own canvas draws all of the above and always works, even
// with no signal; underneath, a street map (MapLibre + OpenFreeMap, free, no
// key) is added when it can be loaded. Both use the same camera, so they line
// up. The edges fade softly into the background.

import { h, s } from "./dom.js";
import { camera, mercX, mercY, angleDiff, bearingTo, zoomForSpeed } from "../engine/camera.js";
import { compassHu, dist } from "../engine/geo.js";
import { pointAtAlong } from "../engine/ride.js";
import { windFeel } from "../services/wind.js";

const LIB_URLS = [
  "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js",
];

// A dark, label-free street style in the bike's colours (OpenMapTiles layers).
const lineW = (a, b) => ["interpolate", ["exponential", 1.6], ["zoom"], 12, a, 18, b];
const cls = (...names) => ["match", ["get", "class"], names, true, false];
export const STREET_STYLE = {
  version: 8,
  sources: { omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0a1330" } },
    { id: "landuse", type: "fill", source: "omt", "source-layer": "landuse", paint: { "fill-color": "#0e1a3d" } },
    { id: "green", type: "fill", source: "omt", "source-layer": "landcover", filter: cls("wood", "grass", "wetland", "farmland"), paint: { "fill-color": "#0b2224" } },
    { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": "#0b2224" } },
    { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": "#062a52" } },
    { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": "#062a52", "line-width": lineW(1, 5) } },
    { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 14, paint: { "fill-color": "#17234f" } },
    { id: "path", type: "line", source: "omt", "source-layer": "transportation", filter: cls("path", "track"), paint: { "line-color": "#2f3f7a", "line-width": lineW(0.5, 4), "line-dasharray": [2, 1.5] } },
    { id: "rail", type: "line", source: "omt", "source-layer": "transportation", filter: cls("rail", "transit"), paint: { "line-color": "#2a3566", "line-width": lineW(0.6, 3) } },
    { id: "minor", type: "line", source: "omt", "source-layer": "transportation", filter: cls("minor", "service"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#33478c", "line-width": lineW(0.6, 14) } },
    { id: "major", type: "line", source: "omt", "source-layer": "transportation", filter: cls("tertiary", "secondary", "primary", "trunk", "motorway"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#5068b8", "line-width": lineW(1.2, 20) } },
  ],
};

let libPromise = null;
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (libPromise) return libPromise;
  libPromise = new Promise((resolve, reject) => {
    const tryNext = (i) => {
      if (i >= LIB_URLS.length) { libPromise = null; reject(new Error("no map library")); return; }
      const el = document.createElement("script");
      el.src = LIB_URLS[i];
      el.async = true;
      const timer = setTimeout(() => { el.remove(); tryNext(i + 1); }, 15000);
      el.onload = () => { clearTimeout(timer); window.maplibregl ? resolve(window.maplibregl) : tryNext(i + 1); };
      el.onerror = () => { clearTimeout(timer); el.remove(); tryNext(i + 1); };
      document.head.appendChild(el);
    };
    tryNext(0);
  });
  return libPromise;
}

const mcache = new WeakMap();
function merc(p) {
  let v = mcache.get(p);
  if (!v) { v = [mercX(p.lng), mercY(p.lat)]; mcache.set(p, v); }
  return v;
}

export function createMinimap(app) {
  const base = h("div", { class: "mm-base" });
  const canvas = h("canvas", { class: "mm-ov" });
  const view = h("div", { class: "mm-view" }, base, canvas);

  // the needle and the É (north) letter turn together; the letter sits inside the dial
  const needle = s("g", {},
    s("path", { d: "M28 17 L33 30 L23 30 Z", fill: "#ff4d5a" }),
    s("path", { d: "M28 46 L33 30 L23 30 Z", fill: "#ececec" }),
    s("text", { x: 28, y: 15, "text-anchor": "middle", "font-size": 13, "font-weight": 800, fill: "#ff4d5a", "font-family": "Barlow, sans-serif" }, "É"));
  const compassSvg = s("svg", { viewBox: "0 0 56 56", width: 56, height: 56 }, needle);
  const compass = h("div", { class: "mm-compass", "aria-label": "Iránytű" }, compassSvg);

  const windArrow = s("svg", { viewBox: "0 0 24 24", width: 30, height: 30 }, s("path", { d: "M12 2 L19 20 L12 16 L5 20 Z", fill: "#5ec8ff", stroke: "#040817", "stroke-width": 1.5, "stroke-linejoin": "round" }));
  const windSpeed = h("span", { class: "num" });
  const windWord = h("span", { class: "w" });
  const wind = h("div", { class: "mm-wind", hidden: true, "aria-label": "Szél" }, windArrow, h("span", { class: "t" }, windSpeed, windWord));
  const note = h("div", { class: "mm-note" });
  const attr = h("div", { class: "mm-attr" });
  const el = h("div", { class: "minimap" }, view, compass, wind, note, attr);

  const ctx = canvas.getContext("2d");
  let map = null, mapReady = false, mapFailed = false;
  let raf = 0, lastDraw = 0;
  let lastFix = null, glideFrom = null, glideTo = null, glideStart = 0, glideDur = 1000;
  let bearing = 0, bearingTarget = 0, zoom = 16.5, zoomTarget = 16.5, lastHeadingPt = null;
  let nearbyCourses = [], nearbyAt = 0;

  const ro = new ResizeObserver(() => {
    el.classList.toggle("mm-tiny", el.clientHeight < 110);
    map?.resize();
  });
  ro.observe(el);

  function startStreetMap() {
    if (map || mapFailed) return;
    loadMapLibre().then((lib) => {
      if (map) return;
      try {
        map = new lib.Map({
          container: base, style: STREET_STYLE, interactive: false, attributionControl: false,
          center: [17.82, 46.39], zoom, bearing, fadeDuration: 0, renderWorldCopies: false, maxZoom: 19,
        });
        map.on("load", () => { mapReady = true; el.classList.add("mm-streets"); });
        map.on("error", () => { /* a tile failed (no signal): the overlay carries on */ });
      } catch {
        mapFailed = true; // no WebGL, for example: the overlay alone still works
      }
    }).catch(() => { /* offline on first run: try again next time the app opens */ });
  }

  function followFix(now) {
    const f = app.engine.fix;
    if (!f || f === lastFix) return;
    const cur = glidePos(now) || f;
    glideDur = lastFix ? Math.min(1500, Math.max(400, f.t - lastFix.t)) : 1;
    glideFrom = cur; glideTo = f; glideStart = now;
    lastFix = f;
    // heading: the GPS's own when moving, otherwise from how he moved, otherwise hold
    if (f.heading != null && f.speedKmh > 4) bearingTarget = f.heading;
    else if (lastHeadingPt && dist(lastHeadingPt, f) > 10 && f.speedKmh > 2) bearingTarget = bearingTo(lastHeadingPt, f);
    if (!lastHeadingPt || dist(lastHeadingPt, f) > 10) lastHeadingPt = f;
    zoomTarget = zoomForSpeed(f.speedKmh);
  }

  function glidePos(now) {
    if (!glideTo) return null;
    const k = Math.min(1, (now - glideStart) / glideDur);
    return { lat: glideFrom.lat + (glideTo.lat - glideFrom.lat) * k, lng: glideFrom.lng + (glideTo.lng - glideFrom.lng) * k };
  }

  function coursesNear(p, now) {
    if (now - nearbyAt < 5000) return nearbyCourses;
    nearbyAt = now;
    nearbyCourses = app.repo.courses.filter((c) => c.routePoints.length > 1 && c.routePoints.some((q, i) => i % 5 === 0 && dist(p, q) < 3000));
    return nearbyCourses;
  }

  function line(cam, pts, color, width, { outline = true, alpha = 1 } = {}) {
    if (pts.length < 2) return;
    ctx.beginPath();
    pts.forEach((p, i) => { const [x, y] = cam.project(...merc(p)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (outline) { ctx.globalAlpha = alpha; ctx.strokeStyle = "rgba(4,8,23,0.85)"; ctx.lineWidth = width + 4; ctx.stroke(); }
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function dot(cam, p, r, fill, ring = "#040817") {
    const [x, y] = cam.project(...merc(p));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = ring; ctx.stroke();
  }

  /**
   * The record ghost: a red dot, or, when it's off the map (far ahead or behind),
   * a red arrow on the map's edge pointing to where it is, like GTA's markers.
   */
  function ghost(cam, p, w, hgt, rider) {
    const [x, y] = cam.project(...merc(p));
    const m = 26;
    if (x >= m && x <= w - m && y >= m && y <= hgt - m) { dot(cam, p, 8, "#ff4d5a"); return; }
    const [bx, by] = cam.project(mercX(rider.lng), mercY(rider.lat));
    const dx = x - bx, dy = y - by;
    // walk from his blip towards the ghost until we hit the edge box
    const k = Math.min(dx > 0 ? (w - m - bx) / dx : dx < 0 ? (m - bx) / dx : Infinity,
      dy > 0 ? (hgt - m - by) / dy : dy < 0 ? (m - by) / dy : Infinity);
    const ex = bx + dx * k, ey = by + dy * k, ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath();
    ctx.fillStyle = "#ff4d5a"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#040817"; ctx.lineJoin = "round"; ctx.stroke();
    ctx.restore();
  }

  function drawOverlay(cam, w, hgt, rider) {
    const e = app.engine;
    ctx.clearRect(0, 0, w, hgt);
    if (e.mode !== "race") {
      for (const c of coursesNear(rider, performance.now())) {
        line(cam, c.routePoints, "#7d89b8", 4);
        dot(cam, c.routePoints[0], 7, "#ececec");
      }
    }
    if (e.mode === "race" && e.race) {
      const r = e.race, route = r.course.routePoints;
      const along = Math.max(0, r.along);
      const at = pointAtAlong(route, r.cum, along);
      let i = 1;
      while (i < route.length - 1 && r.cum[i] < along) i++;
      line(cam, [at, ...route.slice(i)], "#e6ebff", 5);      // ahead: white
      line(cam, [...route.slice(0, i), at], "#c2fe00", 6);   // behind: green
      for (const si of r.splits) dot(cam, route[si], 6, "#f4d35e");
      dot(cam, route[route.length - 1], 9, "#ff4d5a", "#ececec");
      if (r.ref && r.ghostAlong != null) ghost(cam, pointAtAlong(route, r.cum, r.ghostAlong), w, hgt, rider);
    } else {
      const trail = e.mode === "freeroam" ? e.freeroam.points : e.mode === "record" ? e.record.points : app.breadcrumb;
      line(cam, trail.length ? [...trail, rider] : [], "#c2fe00", 6);
      if (e.mode === "record") for (const si of e.record.splits) if (e.record.points[si]) dot(cam, e.record.points[si], 6, "#f4d35e");
    }
    // his blip: an arrow pointing up (the map turns, not the arrow)
    const [bx, by] = cam.project(mercX(rider.lng), mercY(rider.lat));
    ctx.save();
    ctx.translate(bx, by);
    ctx.shadowColor = "rgba(194,254,0,0.55)"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(12, 12); ctx.lineTo(0, 6); ctx.lineTo(-12, 12); ctx.closePath();
    ctx.fillStyle = "#c2fe00"; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = "#040817"; ctx.lineJoin = "round"; ctx.stroke();
    ctx.restore();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!el.isConnected || document.hidden || el.classList.contains("mm-tiny")) return;
    if (now - lastDraw < 33) return; // ~30 frames a second is plenty and easy on the battery
    const dt = Math.min(200, now - lastDraw);
    lastDraw = now;
    followFix(now);
    const w = view.clientWidth, hgt = view.clientHeight;
    if (w < 10 || hgt < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
      canvas.style.width = `${w}px`; canvas.style.height = `${hgt}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rider = glidePos(now);
    const fresh = app.engine.fix && Date.now() - app.engine.fix.t < 15000;
    note.textContent = rider ? (fresh ? "" : "GPS jelre vár…") : "GPS jelre vár…";
    if (!rider) { ctx.clearRect(0, 0, w, hgt); return; }

    bearing += angleDiff(bearing, bearingTarget) * (1 - Math.exp(-dt / 350));
    bearing = (bearing + 360) % 360;
    zoom += (zoomTarget - zoom) * (1 - Math.exp(-dt / 1500));
    const cam = camera({ rider, bearing, zoom, w, h: hgt });
    if (mapReady) {
      try { map.jumpTo({ center: [cam.center.lng, cam.center.lat], zoom, bearing }); } catch { /* ignore */ }
    }
    drawOverlay(cam, w, hgt, rider);
    needle.setAttribute("transform", `rotate(${-bearing} 28 30)`);
    drawWind();
  }

  function drawWind() {
    const wd = app.settings.wind !== false ? app.wind?.get() : null;
    wind.hidden = !wd;
    const parts = [];
    if (mapReady) parts.push("© OpenMapTiles © OpenStreetMap");
    if (wd) parts.push("szél: Open-Meteo");
    const a = parts.join(", ");
    if (attr.textContent !== a) attr.textContent = a;
    if (!wd) return;
    const f = app.engine.fix;
    const moving = f && f.speedKmh > 5;
    const feel = windFeel(wd.from, moving ? bearingTarget : null, wd.speed);
    windArrow.style.transform = `rotate(${wd.from + 180 - bearing}deg)`; // points where the wind blows
    windArrow.style.visibility = wd.speed < 3 ? "hidden" : "visible";
    const sp = `${Math.round(wd.speed)} km/h`;
    if (windSpeed.textContent !== sp) windSpeed.textContent = sp;
    const word = feel || `${compassHu(wd.from)} felől`;
    if (windWord.textContent !== word) windWord.textContent = word;
    wind.dataset.feel = feel || "";
  }

  return {
    el,
    /** Put the map into a ride screen (it's the same map every time, so nothing reloads). */
    mount(parent) {
      parent.appendChild(el);
      if (!raf) raf = requestAnimationFrame(frame);
      startStreetMap();
    },
    get hasStreets() { return mapReady; },
    get bearing() { return bearing; },
  };
}
