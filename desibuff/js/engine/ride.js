// engine/ride.js
// The ride engine. Every GPS fix goes through onFix(), in the same order and
// with the same thresholds as the Android app's MainActivity:
//
//   distance  only counts steps of 0.5–250 m between fixes that are both
//             within 30 m accuracy
//   points    a track point is saved when accuracy ≤ 30 m and it is ≥ 6 m
//             from the last saved one
//   race      the rider is followed along the route in a window of
//             3 points back / 20 points ahead; the finish unlocks within 50 m
//             of the end once the rider is in the last 3 route points
//   nearby    a course is "nearby" within 50 m of its start; dismissing or
//             starting it hides the prompt for 5 minutes
//
// What's new compared with the phone app (all measured, none guessed):
//   - the live delta is worked out by distance along the course, every second,
//     instead of by route-point fraction every 5 seconds
//   - auto-finish at the closest point to the finish (can be switched off);
//     with it off, the finish button stays usable once the finish was reached
//   - a call-out at every split: how far ahead or behind the record you are
//   - heart rate is stored with each point and summarised per ride
//   - if the screen was off and GPS paused, the straight-line gap is added
//     back when it's believable (≤ 60 km/h), instead of being lost
//   - max speed ignores fixes worse than 30 m, so one bad fix can't set it
//   - a course run's delta is always against the record (the old app compared
//     the total with the record but the sectors with the very first ride)
//
// Pure module: time comes in with each call. No DOM, no storage.

import { dist, nearestIndexInWindow, cumulative, alongRoute } from "./geo.js";
import { computeSectorTimes, computeSectorDeltas, buildReference, refElapsedAt, deltaState, sectorRows } from "./sectors.js";

const ACC_OK = 30;           // metres
const MIN_STEP = 0.5, MAX_STEP = 250;
const POINT_SPACING = 6;     // metres between saved points
const NEARBY_M = 50;
const SUPPRESS_MS = 300000;  // 5 minutes
const COUNTDOWN_MS = 3000;
const HR_FRESH_MS = 5000;

export class RideEngine {
  constructor({ repo, settings = {} }) {
    this.repo = repo;
    this.settings = settings;
    this.listeners = new Set();
    this.fix = null;
    this.heading = null;
    this.hr = null;               // { bpm, at }
    this.mode = "idle";           // idle | freeroam | record | race
    this.countdown = null;        // { kind, course, endsAt, shown }
    this.session = { startMs: 0, distanceKm: 0, maxKmh: 0 };
    this.lastAccepted = null;
    this.freeroam = null;
    this.record = null;
    this.race = null;
    this.pending = null;          // a recorded track waiting for a name
    this.result = null;           // what the finish screen shows
    this.nearby = [];             // courses within 50 m of their start, not dismissed
    this.suppressed = new Map();  // courseId -> until (ms)
  }

  // ---------- events (toasts, voice, haptics are the UI's job) ----------
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(evt) { for (const fn of this.listeners) fn(evt); }

  get busy() { return this.mode !== "idle" || !!this.countdown; }

  // ---------- GPS ----------
  onFix(fix) {
    const t = fix.t;
    if (this.session.startMs === 0) this.resetSession(t);
    this.fix = fix;
    if (fix.heading != null && Number.isFinite(fix.heading)) this.heading = fix.heading;

    const paused = this.mode === "freeroam" && this.freeroam.paused;
    if (!paused && fix.acc <= ACC_OK && fix.speedKmh > this.session.maxKmh) this.session.maxKmh = fix.speedKmh;

    this.updateNearby(fix, t);
    this.updateDistance(fix, t);
    if (this.mode === "race") this.updateRace(fix, t);
    if (this.mode === "freeroam" && !this.freeroam.paused) this.maybeAddPoint(this.freeroam, fix, this.freeroamElapsedMs(t));
    if (fix.acc <= ACC_OK) this.lastAccepted = fix;
    if (this.mode === "record") this.maybeAddPoint(this.record, fix, t - this.session.startMs);
  }

  resetSession(t) {
    this.session = { startMs: t, distanceKm: 0, maxKmh: 0 };
    this.lastAccepted = null;
  }

  updateDistance(fix, t) {
    if (this.mode === "freeroam" && this.freeroam.paused) return;
    const prev = this.lastAccepted;
    if (!prev || prev.acc > ACC_OK || fix.acc > ACC_OK) return;
    const d = dist(prev, fix);
    if (d >= MIN_STEP && d <= MAX_STEP) {
      this.addDistance(d);
      return;
    }
    // GPS paused (screen off / app in background): bridge the gap if plausible.
    const gap = t - prev.t;
    if (d > MAX_STEP && gap > 5000 && (d / (gap / 1000)) * 3.6 <= 60) {
      this.addDistance(d);
      if (this.mode !== "idle") this.emit({ type: "gap", seconds: Math.round(gap / 1000), metres: Math.round(d) });
    }
  }

  addDistance(m) {
    const before = this.session.distanceKm;
    this.session.distanceKm += m / 1000;
    if (this.mode === "freeroam" && Math.floor(this.session.distanceKm) > Math.floor(before)) {
      this.emit({ type: "km", km: Math.floor(this.session.distanceKm) });
    }
  }

  maybeAddPoint(target, fix, elapsedMs) {
    if (fix.acc > ACC_OK) return;
    if (target.lastRec && dist(target.lastRec, fix) < POINT_SPACING) return;
    const p = { lat: fix.lat, lng: fix.lng, elapsedMs: Math.max(0, Math.round(elapsedMs)) };
    if (fix.alt != null && Number.isFinite(fix.alt)) p.altitudeMeters = fix.alt;
    const bpm = this.hrBpm(fix.t);
    if (bpm != null) p.heartRate = bpm;
    target.points.push(p);
    target.lastRec = fix;
  }

  // ---------- heart rate ----------
  onHeartRate(bpm, t) {
    if (!(bpm > 0)) return;
    const prev = this.hr;
    this.hr = { bpm, at: t };
    const acc = this.activeHr();
    if (!acc) return;
    const dt = prev ? Math.min(t - prev.at, HR_FRESH_MS) : 1000;
    if (dt > 0) { acc.sum += bpm * dt; acc.ms += dt; }
    acc.max = Math.max(acc.max, bpm);
  }
  hrBpm(t) { return this.hr && t - this.hr.at < HR_FRESH_MS ? this.hr.bpm : null; }
  activeHr() {
    if (this.mode === "freeroam") return this.freeroam.paused ? null : this.freeroam.hr;
    if (this.mode === "record") return this.record.hr;
    if (this.mode === "race") return this.race.hr;
    return null;
  }
  static hrSummary(acc) {
    return acc && acc.ms > 0 ? { avgHeartRate: Math.round(acc.sum / acc.ms), maxHeartRate: acc.max } : {};
  }

  // ---------- nearby courses ----------
  updateNearby(fix, t) {
    for (const [id, until] of this.suppressed) if (until <= t) this.suppressed.delete(id);
    this.nearby = this.repo.courses.filter(
      (c) => c.routePoints.length >= 2 && dist(fix, c.startPoint) <= NEARBY_M && !this.suppressed.has(c.id),
    );
  }
  isNearby(courseId) {
    return !!this.fix && this.repo.courses.some((c) => c.id === courseId && dist(this.fix, c.startPoint) <= NEARBY_M);
  }
  dismissNearby(courseId, t) {
    this.suppressed.set(courseId, t + SUPPRESS_MS);
    this.nearby = this.nearby.filter((c) => c.id !== courseId);
  }

  // ---------- countdown (3, 2, 1) ----------
  startCountdown(kind, t, course = null) {
    if (this.busy) { this.emit({ type: "toast", text: "Előbb zárd le a mostani menetet." }); return false; }
    this.result = null;
    this.countdown = { kind, course, endsAt: t + COUNTDOWN_MS, shown: 4 };
    this.tick(t);
    return true;
  }
  cancelCountdown() { this.countdown = null; this.emit({ type: "status" }); }
  countdownValue(t) { return this.countdown ? Math.max(1, Math.ceil((this.countdown.endsAt - t) / 1000)) : 0; }

  /** Call often (the UI does every 100 ms). Starts the ride when the countdown ends. */
  tick(t) {
    const cd = this.countdown;
    if (!cd) return;
    if (t >= cd.endsAt) {
      this.countdown = null;
      const start = cd.endsAt;
      if (cd.kind === "freeroam") this.beginFreeroam(start);
      else if (cd.kind === "record") this.beginRecording(start);
      else if (cd.kind === "race") this.beginRace(cd.course, start);
      this.emit({ type: "go", kind: cd.kind });
      return;
    }
    const v = this.countdownValue(t);
    if (v !== cd.shown) { cd.shown = v; this.emit({ type: "countdown", value: v }); }
  }

  // ---------- free ride ----------
  startFreeroam(t) { return this.startCountdown("freeroam", t); }

  beginFreeroam(t) {
    this.mode = "freeroam";
    this.freeroam = { startMs: t, pausedTotalMs: 0, pauseStartedMs: 0, paused: false, points: [], lastRec: null, hr: { sum: 0, ms: 0, max: 0 } };
    this.resetSession(t);
  }

  freeroamElapsedMs(t) {
    const f = this.freeroam;
    if (!f || !f.startMs) return 0;
    const pausedNow = f.paused && f.pauseStartedMs ? t - f.pauseStartedMs : 0;
    return Math.max(0, t - f.startMs - f.pausedTotalMs - pausedNow);
  }

  togglePause(t) {
    const f = this.freeroam;
    if (this.mode !== "freeroam") return;
    if (f.paused) {
      f.pausedTotalMs += t - f.pauseStartedMs;
      f.pauseStartedMs = 0;
      f.paused = false;
      this.lastAccepted = null;
      f.lastRec = null;
    } else {
      f.paused = true;
      f.pauseStartedMs = t;
    }
    this.emit({ type: "pause", paused: f.paused });
  }

  finishFreeroam(t) {
    if (this.mode !== "freeroam") return null;
    const f = this.freeroam;
    const elapsedMs = this.freeroamElapsedMs(t);
    const distanceKm = this.session.distanceKm;
    const avg = elapsedMs > 0 ? distanceKm / (elapsedMs / 3600000) : 0;
    const session = this.repo.addFreeroamSession({
      elapsedSeconds: Math.trunc(elapsedMs / 1000), distanceKm, averageSpeedKmh: avg, maxSpeedKmh: this.session.maxKmh,
      samples: f.points.slice(), ...RideEngine.hrSummary(f.hr),
    }, t);
    this.result = { kind: "freeroam", session };
    this.mode = "idle";
    this.freeroam = null;
    this.lastAccepted = null;
    this.emit({ type: "finish", kind: "freeroam", result: this.result });
    return session;
  }

  // ---------- recording a new course ----------
  startRecording(t) { return this.startCountdown("record", t); }

  beginRecording(t) {
    this.mode = "record";
    this.record = { points: [], splits: [], lastRec: null, hr: { sum: 0, ms: 0, max: 0 } };
    this.resetSession(t);
  }

  recordElapsedMs(t) { return this.mode === "record" ? Math.max(0, t - this.session.startMs) : 0; }

  addSplit() {
    if (this.mode !== "record") return;
    const idx = this.record.points.length - 1;
    if (idx <= 0) { this.emit({ type: "toast", text: "Még kevés a pont a részidőhöz." }); return; }
    if (this.record.splits[this.record.splits.length - 1] === idx) return;
    this.record.splits.push(idx);
    this.emit({ type: "split-marked", n: this.record.splits.length });
  }

  stopRecording(t) {
    if (this.mode !== "record") return null;
    const r = this.record;
    this.mode = "idle";
    this.record = null;
    if (r.points.length < 2) {
      this.emit({ type: "toast", text: "Túl rövid volt a felvétel, nem mentettem." });
      return null;
    }
    // The old app measured the time when "save" was pressed, so time spent typing
    // the name counted as riding. Here it's measured when the recording stops.
    const elapsedMs = Math.max(0, t - this.session.startMs);
    this.pending = {
      points: r.points, splits: r.splits, distanceKm: this.session.distanceKm,
      elapsedSeconds: Math.trunc(elapsedMs / 1000), maxKmh: this.session.maxKmh,
      averageSpeedKmh: elapsedMs > 0 ? this.session.distanceKm / (elapsedMs / 3600000) : 0,
      hr: RideEngine.hrSummary(r.hr),
    };
    this.emit({ type: "pending" });
    return this.pending;
  }

  savePending(name, t) {
    const p = this.pending;
    const clean = (name || "").trim();
    if (!p || !clean) return null;
    const route = p.points.map(({ lat, lng }) => ({ lat, lng }));
    const course = this.repo.addRecordedCourse({
      name: clean, distanceKm: p.distanceKm, routePoints: route, recordTimeSeconds: p.elapsedSeconds,
      referenceSamples: p.points, splitIndices: p.splits,
    }, t);
    if (!course) return null;
    this.repo.addCourseRun({
      courseId: course.id, courseName: course.name, elapsedSeconds: p.elapsedSeconds, distanceKm: p.distanceKm,
      averageSpeedKmh: p.averageSpeedKmh, maxSpeedKmh: p.maxKmh, wasNewRecord: true, deltaSeconds: null,
      samples: p.points, sectorTimesSeconds: computeSectorTimes(course.routePoints, course.splitIndices, p.points, p.elapsedSeconds),
      sectorDeltaSeconds: [], deltaReferenceSamples: [], ...p.hr,
    }, t);
    this.pending = null;
    return course;
  }

  discardPending() { this.pending = null; }

  // ---------- racing a course ----------
  startRace(course, t) {
    if (!course || course.routePoints.length < 2) return false;
    const ok = this.startCountdown("race", t, course);
    if (ok) this.dismissNearby(course.id, t);
    return ok;
  }

  beginRace(course, t) {
    const route = course.routePoints;
    const ref = course.referenceSamples.length >= 2 ? buildReference(route, course.referenceSamples) : null;
    this.mode = "race";
    this.race = {
      course, startMs: t, cum: cumulative(route), ref,
      refSplits: computeSectorTimes(route, course.splitIndices, course.referenceSamples, null),
      splits: [...new Set(course.splitIndices)].sort((a, b) => a - b),
      currentIdx: 0, maxIdx: 0, progress: 0, along: 0, ghostAlong: ref ? 0 : null,
      finishEligible: false, finishReached: false, finishMin: Infinity, finishMinT: 0,
      delta: null, deltaState: "neutral",
      nextSplit: 0, liveSplits: [],
      points: [], lastRec: null, hr: { sum: 0, ms: 0, max: 0 },
    };
    this.session.distanceKm = 0;
    this.session.maxKmh = 0;
    this.lastAccepted = null;
  }

  raceElapsedMs(t) { return this.mode === "race" ? Math.max(0, t - this.race.startMs) : 0; }

  updateRace(fix, t) {
    const r = this.race;
    const route = r.course.routePoints;
    const last = route.length - 1;
    if (route.length < 2) return;
    const idx = nearestIndexInWindow(route, fix, Math.max(0, r.currentIdx - 3), Math.min(last, r.currentIdx + 20));
    r.currentIdx = idx;
    r.maxIdx = Math.max(r.maxIdx, idx);
    r.progress = idx / Math.max(last, 1);
    const toFinish = dist(fix, route[last]);
    r.finishEligible = toFinish <= NEARBY_M && idx >= Math.max(1, last - 3);
    this.maybeAddPoint(r, fix, t - r.startMs);

    const elapsed = t - r.startMs;
    r.along = alongRoute(route, r.cum, idx, fix);
    if (r.ref) {
      if (elapsed >= 5000) {
        r.delta = (elapsed - refElapsedAt(r.ref, r.along)) / 1000;
        r.deltaState = deltaState(r.delta);
      }
      r.ghostAlong = ghostAlongAt(r.ref, elapsed);
    }

    // Split call-outs: the first fix at or past each split point.
    while (r.nextSplit < r.splits.length && r.maxIdx >= r.splits[r.nextSplit]) {
      const n = r.nextSplit + 1;
      const at = Math.trunc(elapsed / 1000);
      const refAt = r.refSplits[r.nextSplit];
      const delta = refAt == null ? null : at - refAt;
      r.liveSplits.push({ n, at, delta });
      r.nextSplit++;
      this.emit({ type: "split", n, at, delta, of: r.splits.length + 1 });
    }

    if (r.finishEligible) r.finishReached = true;

    // Auto-finish: stop the clock at the closest approach to the finish point.
    // Once he's been close, riding away finishes the race even if that fix is
    // already outside the finish zone (fast riding, or the next fix arriving
    // late). Fixes worse than 30 m never decide the finish.
    if (this.settings.autoFinish !== false && elapsed > 20000 && fix.acc <= ACC_OK) {
      if (r.finishEligible && toFinish < r.finishMin) { r.finishMin = toFinish; r.finishMinT = t; }
      if (r.finishEligible && toFinish <= 10) this.finishRace(t, { auto: true });
      else if (r.finishMin <= 40 && toFinish > r.finishMin + 8) this.finishRace(r.finishMinT, { auto: true });
    }
  }

  abortRace() {
    if (this.mode !== "race") return;
    this.mode = "idle";
    this.race = null;
    this.lastAccepted = null;
    this.emit({ type: "toast", text: "Futam megszakítva." });
  }

  finishRace(t, { auto = false } = {}) {
    if (this.mode !== "race") return null;
    const r = this.race;
    // the old app only allowed the finish inside the 50 m zone; here it also
    // stays allowed after he's reached it, so riding on a few metres can't lock it
    if (!r.finishEligible && !r.finishReached && !auto) return null;
    const course = this.repo.courses.find((c) => c.id === r.course.id) || r.course;
    const elapsed = Math.trunc((t - r.startMs) / 1000);
    const record = course.recordTimeSeconds;
    const isNew = record == null || elapsed < record;
    const points = r.points.filter((p) => p.elapsedMs <= t - r.startMs);
    const refSamples = course.referenceSamples || [];
    const recordDelta = record != null ? elapsed - record : null;
    const sectorTimes = computeSectorTimes(course.routePoints, course.splitIndices, points, elapsed);
    const sectorDeltas = sectorTimes.length && refSamples.length
      ? computeSectorDeltas(course.routePoints, course.splitIndices, points, refSamples) : [];
    const avg = elapsed > 0 ? this.session.distanceKm / (elapsed / 3600) : 0;
    const hr = RideEngine.hrSummary(r.hr);
    if (isNew) this.repo.updateCourseRecord(course.id, elapsed, points);
    const run = this.repo.addCourseRun({
      courseId: course.id, courseName: course.name, elapsedSeconds: elapsed, distanceKm: this.session.distanceKm,
      averageSpeedKmh: avg, maxSpeedKmh: this.session.maxKmh, wasNewRecord: isNew, deltaSeconds: recordDelta,
      samples: points, sectorTimesSeconds: sectorTimes, sectorDeltaSeconds: sectorDeltas,
      deltaReferenceSamples: refSamples, ...hr,
    }, t);
    this.result = {
      kind: "race", run, courseId: course.id, courseName: course.name, elapsedSeconds: elapsed,
      bestSeconds: isNew ? elapsed : record, recordDelta, wasNewRecord: isNew, auto,
      sectors: sectorRows(sectorTimes, elapsed, sectorDeltas),
    };
    this.mode = "idle";
    this.race = null;
    this.lastAccepted = null;
    this.emit({ type: "finish", kind: "race", result: this.result });
    return run;
  }

  // ---------- numbers the screen shows ----------
  elapsedMs(t) {
    if (this.mode === "freeroam") return this.freeroamElapsedMs(t);
    if (this.mode === "record") return this.recordElapsedMs(t);
    if (this.mode === "race") return this.raceElapsedMs(t);
    return 0;
  }
  averageKmh(t) {
    const ms = this.mode === "idle" ? t - this.session.startMs : this.elapsedMs(t);
    return ms > 0 ? this.session.distanceKm / (ms / 3600000) : 0;
  }

  // ---------- crash recovery ----------
  // A small snapshot is saved every few seconds while riding, so a crashed or
  // closed browser can offer to carry on.
  snapshot(t) {
    if (this.mode === "idle") return null;
    const base = { mode: this.mode, savedAt: t, session: { ...this.session } };
    const strip = (o) => ({ ...o, lastRec: null });
    if (this.mode === "freeroam") return { ...base, freeroam: strip(this.freeroam) };
    if (this.mode === "record") return { ...base, record: strip(this.record) };
    if (this.mode === "race") {
      const { cum, ref, refSplits, course, ...rest } = this.race;
      return { ...base, race: { ...strip(rest), courseId: course.id } };
    }
    return null;
  }

  restore(snap, t) {
    if (!snap || this.mode !== "idle") return false;
    this.session = { ...snap.session };
    this.lastAccepted = null;
    if (snap.mode === "freeroam") {
      this.mode = "freeroam";
      this.freeroam = { ...snap.freeroam, lastRec: null };
      // the time the app was closed counts as a pause, so moving time stays honest
      if (!this.freeroam.paused) this.freeroam.pausedTotalMs += Math.max(0, t - snap.savedAt);
    } else if (snap.mode === "record") {
      this.mode = "record";
      this.record = { ...snap.record, lastRec: null };
    } else if (snap.mode === "race") {
      const course = this.repo.courses.find((c) => c.id === snap.race.courseId);
      if (!course) return false;
      this.beginRace(course, snap.race.startMs);
      Object.assign(this.race, snap.race, { course, lastRec: null });
      this.session = { ...snap.session };
    } else return false;
    return true;
  }
}

/** Where the record rider was along the course at `elapsedMs`. */
export function ghostAlongAt(ref, elapsedMs) {
  const { d, t } = ref;
  if (elapsedMs <= t[0]) return d[0];
  if (elapsedMs >= t[t.length - 1]) return d[d.length - 1];
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < elapsedMs) lo = mid; else hi = mid;
  }
  const span = t[hi] - t[lo];
  const k = span > 0 ? (elapsedMs - t[lo]) / span : 0;
  return d[lo] + k * (d[hi] - d[lo]);
}

/** The point at `along` metres on the route (for drawing the ghost or a cursor). */
export function pointAtAlong(route, cum, along) {
  if (along <= 0) return route[0];
  const last = route.length - 1;
  if (along >= cum[last]) return route[last];
  let i = 1;
  while (i < last && cum[i] < along) i++;
  const span = cum[i] - cum[i - 1];
  const k = span > 0 ? (along - cum[i - 1]) / span : 0;
  return { lat: route[i - 1].lat + k * (route[i].lat - route[i - 1].lat), lng: route[i - 1].lng + k * (route[i].lng - route[i - 1].lng) };
}
