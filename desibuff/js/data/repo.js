// data/repo.js
// Courses, course runs and free rides, kept in memory and handed to a
// `persist(key, list)` function whenever something changes (store.js saves to
// IndexedDB; tests keep it in memory). Ids use the Android app's patterns.
//
// Pure module apart from the persist callback.

import { defaultCourses } from "./defaults.js";

const round1 = (x) => Math.round(x * 10) / 10;

export class Repo {
  constructor({ persist = () => {}, data = {} } = {}) {
    this.persist = persist;
    this.courses = data.courses && data.courses.length ? data.courses : defaultCourses();
    this.freeroamSessions = data.freeroamSessions || [];
    this.courseRuns = data.courseRuns || [];
    this.listeners = new Set();
    this.lastId = 0;
    if (!(data.courses && data.courses.length)) this.save("courses");
    if (this.relinkOrphanRuns()) this.save("courseRuns");
  }

  /**
   * Runs whose course id no longer exists get attached to the course with the
   * same name, when exactly one course has that name. The old Android importer
   * gave courses new ids, so runs from before an import on the phone pointed at
   * ids that were gone. Returns how many runs were relinked.
   */
  relinkOrphanRuns() {
    const ids = new Set(this.courses.map((c) => c.id));
    const byName = new Map();
    for (const c of this.courses) {
      const k = c.name.trim().toLowerCase();
      byName.set(k, byName.has(k) ? null : c.id); // null = ambiguous, leave alone
    }
    let n = 0;
    for (const r of this.courseRuns) {
      if (ids.has(r.courseId)) continue;
      const id = byName.get((r.courseName || "").trim().toLowerCase());
      if (id) { r.courseId = id; n++; }
    }
    return n;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  save(...keys) {
    for (const k of keys) this.persist(k, this[k]);
    for (const fn of this.listeners) fn(keys);
  }

  // Unique, time-based ids like the Android app's ("course_run_1712345678901").
  newId(prefix, t) {
    const ms = Math.max(t, this.lastId + 1);
    this.lastId = ms;
    return `${prefix}${ms}`;
  }

  // ---------- courses ----------
  course(id) { return this.courses.find((c) => c.id === id) || null; }

  addRecordedCourse({ name, distanceKm, routePoints, recordTimeSeconds, referenceSamples, splitIndices }, t) {
    if (routePoints.length < 2) return null;
    const course = {
      id: this.newId("recorded_", t), name, distanceKm: round1(distanceKm),
      startPoint: { ...routePoints[0] }, routePoints, recordTimeSeconds,
      referenceSamples, splitIndices: [...splitIndices],
    };
    this.courses.push(course);
    this.save("courses");
    return course;
  }

  updateCourse(id, patch) {
    const i = this.courses.findIndex((c) => c.id === id);
    if (i < 0) return null;
    this.courses[i] = { ...this.courses[i], ...patch };
    this.save("courses");
    return this.courses[i];
  }
  updateCourseRecord(id, seconds, samples) { return this.updateCourse(id, { recordTimeSeconds: seconds, referenceSamples: samples }); }
  updateSplits(id, splits) {
    const c = this.course(id);
    if (!c) return null;
    const last = c.routePoints.length - 1;
    const clean = [...new Set(splits.map((i) => Math.round(i)))].filter((i) => i >= 1 && i < last).sort((a, b) => a - b);
    return this.updateCourse(id, { splitIndices: clean });
  }
  renameCourse(id, name) {
    const clean = (name || "").trim();
    if (!clean) return null;
    return this.updateCourse(id, { name: clean });
  }
  moveCourse(id, by) {
    const i = this.courses.findIndex((c) => c.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= this.courses.length) return;
    const [c] = this.courses.splice(i, 1);
    this.courses.splice(j, 0, c);
    this.save("courses");
  }
  /** Deletes the course. Its runs stay in the history, as in the old app. */
  deleteCourse(id) {
    this.courses = this.courses.filter((c) => c.id !== id);
    if (!this.courses.length) this.courses = defaultCourses();
    this.save("courses");
  }

  // ---------- rides ----------
  addFreeroamSession({ elapsedSeconds, distanceKm, averageSpeedKmh, maxSpeedKmh, samples, avgHeartRate, maxHeartRate }, t) {
    const s = {
      id: this.newId("freeroam_", t), finishedAtEpochMs: t, elapsedSeconds, distanceKm, averageSpeedKmh, maxSpeedKmh,
      routePoints: samples.map(({ lat, lng }) => ({ lat, lng })), samples, isStarred: false,
      ...(avgHeartRate ? { avgHeartRate, maxHeartRate } : {}),
    };
    this.freeroamSessions.push(s);
    this.save("freeroamSessions");
    return s;
  }

  addCourseRun(r, t) {
    const run = {
      id: this.newId("course_run_", t), finishedAtEpochMs: t, isStarred: false,
      routePoints: r.samples.map(({ lat, lng }) => ({ lat, lng })),
      sectorTimesSeconds: [], sectorDeltaSeconds: [], deltaReferenceSamples: [],
      ...r,
    };
    if (!run.avgHeartRate) { delete run.avgHeartRate; delete run.maxHeartRate; }
    this.courseRuns.push(run);
    this.save("courseRuns");
    return run;
  }

  runsFor(courseId) { return this.courseRuns.filter((r) => r.courseId === courseId); }

  toggleStar(kind, id) {
    const list = kind === "run" ? this.courseRuns : this.freeroamSessions;
    const item = list.find((x) => x.id === id);
    if (!item) return;
    item.isStarred = !item.isStarred;
    this.save(kind === "run" ? "courseRuns" : "freeroamSessions");
  }
  deleteRide(kind, id) {
    const key = kind === "run" ? "courseRuns" : "freeroamSessions";
    this[key] = this[key].filter((x) => x.id !== id);
    this.save(key);
  }

  // ---------- backup ----------
  snapshot() {
    return JSON.parse(JSON.stringify({ courses: this.courses, freeroamSessions: this.freeroamSessions, courseRuns: this.courseRuns }));
  }
  restoreSnapshot(s) {
    this.courses = s.courses; this.freeroamSessions = s.freeroamSessions; this.courseRuns = s.courseRuns;
    this.save("courses", "freeroamSessions", "courseRuns");
  }

  /**
   * Bring in a parsed backup without losing anything already here.
   * Courses: the backup's courses in the backup's order, then any courses only
   * this app has. Same id = the backup's version wins (so the built-in
   * Reservoir courses pick up the old app's records). Runs and free rides are
   * merged by id the same way.
   */
  importData(parsed) {
    const counts = { courses: 0, courseRuns: 0, freeroamSessions: 0, added: { courses: 0, courseRuns: 0, freeroamSessions: 0 } };
    const merge = (key, incoming, { incomingFirst }) => {
      if (!incoming) return;
      // within one file, a repeated id keeps its last copy
      const byId = new Map(incoming.map((x) => [x.id, x]));
      const list = [...byId.values()];
      const haveIds = new Set(this[key].map((x) => x.id));
      counts[key] = list.length;
      counts.added[key] = list.filter((x) => !haveIds.has(x.id)).length;
      if (incomingFirst) {
        this[key] = [...list, ...this[key].filter((x) => !byId.has(x.id))];
      } else {
        // existing items keep their place (replaced if the file has them), new ones go at the end
        this[key] = [...this[key].map((x) => byId.get(x.id) || x), ...list.filter((x) => !haveIds.has(x.id))];
      }
    };
    merge("courses", parsed.courses && parsed.courses.filter((c) => c.routePoints.length >= 2), { incomingFirst: true });
    merge("courseRuns", parsed.courseRuns, { incomingFirst: false });
    merge("freeroamSessions", parsed.freeroamSessions, { incomingFirst: false });
    counts.relinked = this.relinkOrphanRuns();
    this.save("courses", "freeroamSessions", "courseRuns");
    return counts;
  }
}
