// services/gps.js
// Location from the phone's GPS (high accuracy, every fix, like the old app's
// 1-second high-accuracy request), or from a simulated ride for desk testing.
//
// Each fix handed on: { lat, lng, acc, alt, speedKmh, heading, t }

import { cumulative, dist } from "../engine/geo.js";
import { pointAtAlong } from "../engine/ride.js";

export function createGps({ onFix, onStatus }) {
  let watchId = null;
  let sim = null;            // { timer, along, route, cum, kmh }
  let last = null;           // last raw fix, for speed when the phone gives none
  let lastAt = 0;
  let status = "off";
  let lostTimer = null;

  const setStatus = (s, extra) => { status = s; onStatus?.(s, extra); };

  function handle(fix) {
    lastAt = fix.t;
    if (status !== "ok") setStatus("ok");
    onFix(fix);
  }

  function fromPosition(pos) {
    const c = pos.coords;
    const t = Date.now();
    let speedKmh;
    if (c.speed != null && Number.isFinite(c.speed)) speedKmh = Math.max(0, c.speed * 3.6);
    else if (last && c.accuracy <= 30 && last.acc <= 30 && t - last.t >= 500 && t - last.t <= 10000) {
      speedKmh = (dist(last, { lat: c.latitude, lng: c.longitude }) / ((t - last.t) / 1000)) * 3.6;
    } else speedKmh = 0;
    const fix = {
      lat: c.latitude, lng: c.longitude, acc: c.accuracy,
      alt: c.altitude != null && Number.isFinite(c.altitude) ? c.altitude : null,
      speedKmh, heading: c.heading != null && Number.isFinite(c.heading) && speedKmh > 2 ? c.heading : null, t,
    };
    last = fix;
    handle(fix);
  }

  function startReal() {
    if (!("geolocation" in navigator)) { setStatus("unavailable"); return; }
    if (!window.isSecureContext) { setStatus("insecure"); return; }
    setStatus("searching");
    watchId = navigator.geolocation.watchPosition(fromPosition, (err) => {
      if (err.code === 1) setStatus("denied");
      else if (status !== "ok") setStatus("searching");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }

  function startSim(opts) {
    const route = opts.route;
    const cum = cumulative(route);
    sim = { route, cum, along: 0, kmh: opts.kmh || 25, wobble: 0 };
    setStatus("searching");
    const step = () => {
      const s = sim;
      if (!s) return;
      const total = s.cum[s.cum.length - 1];
      s.along = (s.along + (s.kmh / 3.6)) % (total || 1);
      const p = pointAtAlong(s.route, s.cum, s.along);
      const ahead = pointAtAlong(s.route, s.cum, Math.min(total, s.along + 5));
      const heading = (Math.atan2((ahead.lng - p.lng) * Math.cos(p.lat * Math.PI / 180), ahead.lat - p.lat) * 180 / Math.PI + 360) % 360;
      s.wobble += 0.15;
      handle({
        lat: p.lat + Math.sin(s.wobble) * 0.000008, lng: p.lng + Math.cos(s.wobble * 0.7) * 0.000008,
        acc: 4 + Math.abs(Math.sin(s.wobble)) * 3, alt: 150 + Math.sin(s.along / 400) * 12,
        speedKmh: s.kmh * (0.95 + Math.sin(s.wobble * 1.3) * 0.05), heading, t: Date.now(),
      });
    };
    sim.timer = setInterval(step, 1000);
    setTimeout(step, 300);
  }

  function watchLost() {
    clearInterval(lostTimer);
    lostTimer = setInterval(() => {
      if (status === "ok" && Date.now() - lastAt > 10000) setStatus("lost");
    }, 2000);
  }

  return {
    get status() { return status; },
    get simulating() { return !!sim; },
    start(simOpts = null) {
      this.stop();
      if (simOpts) startSim(simOpts); else startReal();
      watchLost();
    },
    setSimSpeed(kmh) { if (sim) sim.kmh = kmh; },
    stop() {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      if (sim) clearInterval(sim.timer);
      sim = null;
      last = null;
      clearInterval(lostTimer);
      setStatus("off");
    },
  };
}

/** Plain-language GPS quality, from the old app's thresholds (8 / 15 / 30 m). */
export function gpsQuality(acc) {
  if (acc == null) return { label: "Nincs jel", level: 0 };
  if (acc <= 8) return { label: "Kiváló", level: 4 };
  if (acc <= 15) return { label: "Jó", level: 3 };
  if (acc <= 30) return { label: "Elfogadható", level: 2 };
  return { label: "Gyenge", level: 1 };
}
