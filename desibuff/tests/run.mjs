// tests/run.mjs
// Run with:  node desibuff/tests/run.mjs
// Covers the parts that must be exactly right: distance maths, the ride rules,
// races against a record, split timing, and Android backup import/export.

import { distanceBetween, dist, cumulative } from "../js/engine/geo.js";
import { RideEngine, pointAtAlong } from "../js/engine/ride.js";
import { computeSectorTimes, sectorRows, deltaSeriesByDistance, filterSpeedOutliers } from "../js/engine/sectors.js";
import { fmtTime, fmtSigned, fmtDelta, sayDelta } from "../js/engine/format.js";
import { Repo } from "../js/data/repo.js";
import { parseBackup, exportBackup } from "../js/data/backup.js";
import { defaultCourses } from "../js/data/defaults.js";

let passed = 0;
const failed = [];
function check(cond, msg) { if (cond) passed++; else failed.push(msg); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------- helpers ----------
const memRepo = (data) => { const saved = {}; const r = new Repo({ persist: (k, v) => { saved[k] = v; }, data }); r._saved = saved; return r; };
const fixAt = (p, t, extra = {}) => ({ lat: p.lat, lng: p.lng, acc: 5, alt: 150, speedKmh: 25, heading: 90, t, ...extra });

/** Ride along `route` at `mps` metres/second, one fix per second, starting at t0. */
function rideRoute(engine, route, mps, t0, { extraEnd = 30, onEach } = {}) {
  const cum = cumulative(route);
  const total = cum[cum.length - 1];
  let t = t0;
  for (let along = 0; along <= total + extraEnd * mps; along += mps) {
    t += 1000;
    const p = along <= total ? pointAtAlong(route, cum, along) : pointAtAlong(route, cum, total);
    engine.tick(t);
    engine.onFix(fixAt(p, t, { speedKmh: mps * 3.6 }));
    if (onEach) onEach(t);
    if (engine.mode === "idle" && engine.result) break;
  }
  return t;
}
function startAndWait(engine, startFn, t) { startFn(t); engine.tick(t + 3000); return t + 3000; }

// ---------- geo ----------
check(near(distanceBetween(0, 0, 0, 1), 111319.49, 0.05), `1° of longitude at the equator is 111319.49 m (got ${distanceBetween(0, 0, 0, 1)})`);
check(near(distanceBetween(46.393743, 17.818607, 46.394359, 17.818558), distanceBetween(46.394359, 17.818558, 46.393743, 17.818607), 1e-3), "distance is symmetric");
check(distanceBetween(46.39, 17.81, 46.39, 17.81) === 0, "same point is 0 m");
check(near(distanceBetween(51.5074, -0.1278, 48.8566, 2.3522), 343923, 600), "London–Paris about 344 km");

// ---------- distance & point rules ----------
{
  const repo = memRepo();
  const e = new RideEngine({ repo });
  const base = { lat: 46.4, lng: 17.8 };
  const mv = (m) => ({ lat: base.lat, lng: base.lng + m / (111320 * Math.cos(46.4 * Math.PI / 180)) });
  let t = 1000;
  e.onFix(fixAt(mv(0), t));
  e.onFix(fixAt(mv(0.3), (t += 1000)));                       // under 0.5 m: ignored
  check(e.session.distanceKm === 0, "a 0.3 m step does not count");
  // the 0.3 m fix still becomes the last accepted point (as in the old app), so the next step is 19.7 m
  e.onFix(fixAt(mv(20), (t += 1000)));
  check(near(e.session.distanceKm * 1000, 19.7, 0.2), "a 19.7 m step counts");
  e.onFix(fixAt(mv(40), (t += 1000), { acc: 45 }));          // bad accuracy: no distance, not accepted
  check(near(e.session.distanceKm * 1000, 19.7, 0.2), "a 45 m-accuracy fix adds nothing");
  e.onFix(fixAt(mv(600), (t += 1000)));                       // 580 m in 2 s: a jump, ignored
  check(near(e.session.distanceKm * 1000, 19.7, 0.2), "a 580 m jump in 2 s is ignored");
  e.onFix(fixAt(mv(900), (t += 60000)));                      // 300 m after a minute: screen was off, bridged
  check(near(e.session.distanceKm * 1000, 319.7, 1), "a 300 m gap over a minute (18 km/h) is bridged");
  e.onFix(fixAt(mv(900), (t += 1000), { speedKmh: 80, acc: 60 }));
  check(e.session.maxKmh === 25, "max speed ignores a 60 m-accuracy fix");
}

// ---------- free ride with pause ----------
{
  const repo = memRepo();
  const e = new RideEngine({ repo });
  let t = startAndWait(e, (x) => e.startFreeroam(x), 10_000);
  check(e.mode === "freeroam", "free ride starts after the 3 s countdown");
  const route = defaultCourses()[0].routePoints.slice(0, 10);
  const cum = cumulative(route);
  for (let a = 0; a < 300; a += 7) e.onFix(fixAt(pointAtAlong(route, cum, a), (t += 1000)));
  const kmBefore = e.session.distanceKm;
  e.togglePause(t);
  for (let a = 300; a < 600; a += 7) e.onFix(fixAt(pointAtAlong(route, cum, a), (t += 1000)));
  check(e.session.distanceKm === kmBefore, "no distance is added while paused");
  const pausedFor = 43 * 1000;
  e.togglePause(t);
  t += 5000;
  const elapsed = e.freeroamElapsedMs(t);
  check(near(elapsed, 43 * 1000 + 5000, 1), `moving time excludes the pause (${elapsed} ms)`);
  const snap = e.snapshot(t);
  const s = e.finishFreeroam(t);
  check(s && repo.freeroamSessions.length === 1 && s.id.startsWith("freeroam_"), "free ride is saved");
  check(s.samples.length > 30 && s.samples.every((p) => p.altitudeMeters === 150), "free ride points carry altitude");
  check(near(s.averageSpeedKmh, s.distanceKm / (elapsed / 3600000), 0.01), "average = distance / moving time");

  // crash recovery: the closed time counts as a pause
  const e2 = new RideEngine({ repo: memRepo() });
  check(e2.restore(snap, t + 60000) && e2.mode === "freeroam", "a saved snapshot restores the free ride");
  check(near(e2.freeroamElapsedMs(t + 60000), elapsed, 1), "time the app was closed doesn't count as riding");
  void pausedFor;
}

// ---------- recording a course ----------
let recorded;
{
  const repo = memRepo();
  const e = new RideEngine({ repo });
  const route = defaultCourses()[0].routePoints;
  let t = startAndWait(e, (x) => e.startRecording(x), 0);
  const cum = cumulative(route);
  const total = cum[cum.length - 1];
  let marked = 0;
  for (let a = 0; a <= total; a += 6.5) {
    e.onFix(fixAt(pointAtAlong(route, cum, a), (t += 1000)));
    if (marked === 0 && a > total / 3) { e.addSplit(); marked++; }
    if (marked === 1 && a > (2 * total) / 3) { e.addSplit(); marked++; }
  }
  const p = e.stopRecording(t);
  check(p && p.splits.length === 2, "two splits marked while recording");
  const typedFor = 45000; // time spent typing the name must not count
  const course = e.savePending("Kör a tónál", t + typedFor);
  check(course && course.id.startsWith("recorded_"), "recorded course is saved");
  check(course.distanceKm === Math.round(p.distanceKm * 10) / 10, "course distance is rounded to 0.1 km like the old app");
  check(course.recordTimeSeconds === p.elapsedSeconds, "the recording time becomes the record");
  const run = repo.courseRuns[0];
  check(run && run.wasNewRecord && run.sectorTimesSeconds.length === 2, "the recording is also the first run, with 2 split times");
  check(run.elapsedSeconds === Math.trunc((t - 3000) / 1000), `time is measured when recording stopped (${run.elapsedSeconds} s)`);
  recorded = { repo, course };
}

// ---------- racing the Reservoir course ----------
{
  const repo = memRepo();
  const settings = { autoFinish: true };
  const e = new RideEngine({ repo, settings });
  const course = repo.course("reservoir_cw");
  repo.updateSplits(course.id, [24, 48]);
  const route = course.routePoints;

  // Race 1: no record yet, 7 m/s.
  let t = startAndWait(e, (x) => e.startRace(repo.course("reservoir_cw"), x), 100_000);
  check(e.mode === "race", "race starts after the countdown");
  const startT = t;
  t = rideRoute(e, route, 7, t);
  check(e.mode === "idle" && e.result?.kind === "race", "race 1 finished by itself at the line");
  const r1 = e.result;
  const total = cumulative(route).at(-1);
  check(near(r1.elapsedSeconds, total / 7, 3), `race 1 time matches the ride (${r1.elapsedSeconds} s vs ${Math.round(total / 7)})`);
  check(r1.wasNewRecord && repo.course("reservoir_cw").recordTimeSeconds === r1.elapsedSeconds, "race 1 sets the record");
  check(r1.sectors.length === 3, "race 1 shows 3 sectors");
  check(repo.course("reservoir_cw").referenceSamples.length > 100, "the record ride is stored as the ghost");
  void startT;

  // Race 2: faster, 8 m/s. Delta should be negative and growing.
  const splits = [], deltas = [];
  e.on((ev) => { if (ev.type === "split") splits.push(ev); });
  t = startAndWait(e, (x) => e.startRace(repo.course("reservoir_cw"), x), t + 400_000);
  t = rideRoute(e, route, 8, t, { onEach: () => { if (e.race?.delta != null) deltas.push(e.race.delta); } });
  const r2 = e.result;
  check(r2.wasNewRecord && r2.recordDelta < 0, `race 2 is a new record, ${r2.recordDelta} s`);
  check(deltas.length > 100 && deltas.every((d) => d <= 0.6), "live delta never shows behind when riding faster all the way");
  const expectedEnd = total / 8 - total / 7;
  check(near(deltas.at(-1), expectedEnd, 4), `live delta at the end ≈ ${expectedEnd.toFixed(1)} s (got ${deltas.at(-1)?.toFixed(1)})`);
  check(splits.length === 2 && splits.every((s) => s.delta < 0), "both split call-outs say ahead");
  const run2 = repo.courseRuns.at(-1);
  check(run2.deltaSeconds === r2.recordDelta, "the run's delta is against the record");
  check(run2.sectorDeltaSeconds.length === 2 && run2.sectorDeltaSeconds.every((d) => d < 0), "sector deltas are against the record too");

  // Race 3: slower. Not a record; delta positive.
  t = startAndWait(e, (x) => e.startRace(repo.course("reservoir_cw"), x), t + 400_000);
  let maxDelta = -Infinity;
  t = rideRoute(e, route, 6, t, { onEach: () => { if (e.race?.delta != null) maxDelta = Math.max(maxDelta, e.race.delta); } });
  const r3 = e.result;
  check(!r3.wasNewRecord && r3.recordDelta > 0, "race 3 is slower and not a record");
  check(maxDelta > 30, `live delta shows behind (${maxDelta.toFixed(0)} s)`);
  check(repo.course("reservoir_cw").recordTimeSeconds === r2.elapsedSeconds, "the record stays race 2's");

  // Manual finish only unlocks near the end.
  const e2 = new RideEngine({ repo, settings: { autoFinish: false } });
  t = startAndWait(e2, (x) => e2.startRace(repo.course("reservoir_cw"), x), t + 400_000);
  e2.onFix(fixAt(route[10], (t += 1000)));
  check(e2.finishRace(t) === null && e2.mode === "race", "the finish can't be pressed mid-course");
  rideRoute(e2, route, 7, t, { extraEnd: 0 });
  check(e2.mode === "race" && e2.race.finishEligible, "with auto-finish off, the race waits at the line with finish unlocked");
  check(e2.finishRace(t + 999999) !== null, "and the finish button then works");
}

// ---------- auto-finish edge cases ----------
{
  const repo = memRepo();
  const e = new RideEngine({ repo, settings: { autoFinish: true } });
  const route = repo.course("reservoir_cw").routePoints;
  const cum = cumulative(route);
  const total = cum.at(-1);
  let t = startAndWait(e, (x) => e.startRace(repo.course("reservoir_cw"), x), 0);
  // 19.4 m per fix (70 km/h), then the next fix is back at the start (like riding another lap)
  let a = 0;
  for (; a <= total - 14; a += 19.4) e.onFix(fixAt(pointAtAlong(route, cum, a), (t += 1000), { speedKmh: 70 }));
  const closestT = t;
  check(e.mode === "race", "still racing just before the line");
  e.onFix(fixAt(route[0], (t += 1000)));
  check(e.mode === "idle" && e.result, "a fix far past the line still finishes the race");
  check(e.result && e.result.elapsedSeconds === Math.trunc((closestT - (3000)) / 1000), "…timed at the closest fix, not the late one");

  // a bad fix near the end must not finish the race early
  const e2 = new RideEngine({ repo: memRepo(), settings: { autoFinish: true } });
  const c2 = e2.repo.course("reservoir_cw");
  t = startAndWait(e2, (x) => e2.startRace(c2, x), 0);
  for (a = 0; a <= total - 30; a += 7) e2.onFix(fixAt(pointAtAlong(route, cum, a), (t += 1000)));
  e2.onFix(fixAt(route[0], (t += 1000), { acc: 80 }));
  check(e2.mode === "race", "a 80 m-accuracy fix can't finish the race");

  // auto-finish off: riding past the zone keeps the finish button usable
  const e3 = new RideEngine({ repo: memRepo(), settings: { autoFinish: false } });
  const c3 = e3.repo.course("reservoir_cw");
  t = startAndWait(e3, (x) => e3.startRace(c3, x), 0);
  for (a = 0; a <= total; a += 7) e3.onFix(fixAt(pointAtAlong(route, cum, a), (t += 1000)));
  e3.onFix(fixAt(route[0], (t += 1000)));
  check(e3.mode === "race" && !e3.race.finishEligible && e3.race.finishReached, "with auto-finish off, riding on keeps the race open");
  check(e3.finishRace(t) !== null, "…and Cél still works after riding out of the zone");
}

// ---------- nearby prompt ----------
{
  const repo = memRepo();
  const e = new RideEngine({ repo });
  const start = repo.course("reservoir_cw").startPoint;
  e.onFix(fixAt(start, 1000));
  check(e.nearby.some((c) => c.id === "reservoir_cw"), "standing at a course start shows it as nearby");
  e.dismissNearby("reservoir_cw", 1000);
  e.onFix(fixAt(start, 2000));
  check(!e.nearby.some((c) => c.id === "reservoir_cw"), "dismissed course stays hidden");
  e.onFix(fixAt(start, 1000 + 300001));
  check(e.nearby.some((c) => c.id === "reservoir_cw"), "…and comes back after 5 minutes");
}

// ---------- sector helpers ----------
{
  const rows = sectorRows([60, 150], 200, [-2, 3]);
  check(rows.length === 3 && rows[1].duration === 90 && rows[2].duration === 50 && rows[2].last, "sector rows split cumulative times into durations");
  const route = recorded.course.routePoints;
  const times = computeSectorTimes(route, [5000], recorded.course.referenceSamples, 999);
  check(times.length === 1, "a split past the end is clamped to the last point");
  const ds = deltaSeriesByDistance(recorded.course.referenceSamples, recorded.course.referenceSamples);
  check(ds.length > 10 && ds.every((p) => near(p.v, 0, 0.001)), "delta of a ride against itself is zero");
  const f = filterSpeedOutliers([20, 21, 22, 23, 22, 21, 200]);
  check(f[6] < 60, "a 200 km/h GPS spike is capped in the speed chart");
}

// ---------- backup: Android format ----------
const androidBackup = {
  version: 2,
  courses: [
    { id: "reservoir_cw", name: "Reservoir CW", distanceKm: 14.0, recordTimeSeconds: 2410, start: { lat: 46.393743, lng: 17.818607 },
      route: defaultCourses()[0].routePoints, referenceSamples: [{ lat: 46.393743, lng: 17.818607, elapsedMs: 0 }, { lat: 46.394359, lng: 17.818558, elapsedMs: 9000 }], splitIndices: [20, 40] },
    { id: "recorded_1741900000000", name: "Kaposvár kör", distanceKm: 8.3, recordTimeSeconds: 1500, start: { lat: 46.36, lng: 17.79 },
      route: [{ lat: 46.36, lng: 17.79 }, { lat: 46.361, lng: 17.791 }, { lat: 46.362, lng: 17.792 }],
      referenceSamples: [{ lat: 46.36, lng: 17.79, elapsedMs: 0 }, { lat: 46.362, lng: 17.792, elapsedMs: 1500000 }], splitIndices: [] },
  ],
  freeroamSessions: [
    { id: "freeroam_1741950000000", finishedAtEpochMs: 1741950000000, elapsedSeconds: 3600, distanceKm: 25.4, averageSpeedKmh: 25.4,
      maxSpeedKmh: 41.2, route: [{ lat: 46.3, lng: 17.8 }], samples: [{ lat: 46.3, lng: 17.8, elapsedMs: 0, altitudeMeters: 151.5 }, { lat: 46.31, lng: 17.81, elapsedMs: 60000 }], isStarred: true },
  ],
  courseRuns: [
    { id: "course_run_1741960000000", courseId: "recorded_1741900000000", courseName: "Kaposvár kör", finishedAtEpochMs: 1741960000000,
      elapsedSeconds: 1500, distanceKm: 8.31, averageSpeedKmh: 19.9, maxSpeedKmh: 33.1, wasNewRecord: true,
      route: [{ lat: 46.36, lng: 17.79 }], samples: [{ lat: 46.36, lng: 17.79, elapsedMs: 0 }], isStarred: false,
      sectorTimesSeconds: [], sectorDeltaSeconds: [], deltaReferenceSamples: [] },
    { id: "course_run_1741970000000", courseId: "reservoir_cw", courseName: "Reservoir CW", finishedAtEpochMs: 1741970000000,
      elapsedSeconds: 2410, distanceKm: 14.02, averageSpeedKmh: 20.9, maxSpeedKmh: 38.0, wasNewRecord: false, deltaSeconds: 12,
      route: [], samples: [], isStarred: false, sectorTimesSeconds: [800, 1650], sectorDeltaSeconds: [-3, null], deltaReferenceSamples: [] },
  ],
};
{
  const parsed = parseBackup(JSON.stringify(androidBackup, null, 2));
  check(parsed.courses.length === 2 && parsed.courses[1].id === "recorded_1741900000000", "course ids are kept on import");
  check(parsed.courseRuns[1].deltaSeconds === 12 && parsed.courseRuns[0].deltaSeconds === null, "missing deltaSeconds stays empty");
  check(parsed.courseRuns[1].sectorDeltaSeconds[1] === null, "a null sector delta survives");
  check(parsed.freeroamSessions[0].samples[0].altitudeMeters === 151.5 && !("altitudeMeters" in parsed.freeroamSessions[0].samples[1]), "altitude kept only where it existed");

  const repo = memRepo();
  const counts = repo.importData(parsed);
  check(counts.courses === 2 && counts.courseRuns === 2 && counts.freeroamSessions === 1, "import counts everything");
  check(repo.courses[0].id === "reservoir_cw" && repo.courses[0].recordTimeSeconds === 2410, "the built-in course picks up the old record");
  check(repo.courses.length === 3 && repo.courses[2].id === "reservoir_ccw", "the other built-in course is kept after the imported ones");
  check(repo.runsFor("recorded_1741900000000").length === 1, "imported runs stay attached to their course");
  repo.importData(parsed);
  check(repo.courseRuns.length === 2 && repo.courses.length === 3, "importing the same file twice doesn't duplicate anything");

  const out = JSON.parse(exportBackup(repo));
  check(out.version === 2 && out.courses.length === 3, "export writes version 2 with every course");
  const again = parseBackup(JSON.stringify(out));
  const strip = (x) => JSON.stringify(x);
  check(strip(again.courseRuns) === strip(repo.courseRuns), "runs survive export → import unchanged");
  check(strip(again.freeroamSessions) === strip(repo.freeroamSessions), "free rides survive export → import unchanged");
  check(strip(again.courses[1]) === strip(repo.courses[1]), "courses survive export → import unchanged");
  const cOut = out.courses.find((c) => c.id === "recorded_1741900000000");
  check(cOut.start && cOut.route && !("routePoints" in cOut) && !("startPoint" in cOut), "export uses the Android field names");
  check(!("recordTimeSeconds" in out.courses.find((c) => c.id === "reservoir_ccw")), "a course with no record has no recordTimeSeconds, like Android");

  // older spellings and a bare list
  const old = parseBackup(JSON.stringify([{ name: "Régi", routePoints: [{ latitude: 1, longitude: 2 }, { latitude: 1.001, longitude: 2 }], startPoint: { latitude: 1, longitude: 2 } }]), 42);
  check(old.courses[0].routePoints[1].lat === 1.001 && old.courses[0].startPoint.lng === 2 && old.courses[0].id === "imported_42_0", "older spellings and a bare list of courses import");
  let msg = "";
  try { parseBackup("not json"); } catch (err) { msg = err.message; }
  check(/nem JSON/.test(msg), "a broken file gives a clear Hungarian message");
  try { parseBackup("{}"); msg = ""; } catch (err) { msg = err.message; }
  check(/nincs pálya/.test(msg), "an empty file says there's nothing in it");
}

// ---------- formats ----------
check(fmtTime(425) === "07:05" && fmtTime(3725) === "1:02:05", "times format as mm:ss and h:mm:ss");
check(fmtSigned(-4) === "−0:04" && fmtSigned(72) === "+1:12" && fmtSigned(0) === "±0:00", "signed durations match the old app");
check(fmtDelta(-4.24) === "−4.2" && fmtDelta(64) === "+1:04", "live delta shows tenths under a minute");
check(sayDelta(-3) === "3 másodperccel előrébb" && sayDelta(2.5) === "2,5 másodperccel lemaradva", "spoken delta reads naturally");

console.log(`${passed} checks passed`);
if (failed.length) { console.log("FAILED:\n  " + failed.join("\n  ")); process.exit(1); }
