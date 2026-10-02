// data/backup.js
// Reading and writing backup files in the Android app's format (version 2):
//
//   { "version": 2,
//     "courses":          [ { id, name, distanceKm, recordTimeSeconds?, start{lat,lng},
//                             route[{lat,lng}], referenceSamples[{lat,lng,elapsedMs}], splitIndices[] } ],
//     "freeroamSessions": [ { id, finishedAtEpochMs, elapsedSeconds, distanceKm, averageSpeedKmh,
//                             maxSpeedKmh, route[], samples[{lat,lng,elapsedMs,altitudeMeters?}], isStarred } ],
//     "courseRuns":       [ { id, courseId, courseName, finishedAtEpochMs, elapsedSeconds, distanceKm,
//                             averageSpeedKmh, maxSpeedKmh, wasNewRecord, deltaSeconds?, route[], samples[],
//                             isStarred, sectorTimesSeconds[], sectorDeltaSeconds[int|null], deltaReferenceSamples[] } ] }
//
// Reading accepts everything the Android importer accepted (including the
// older "routePoints" / "latitude" / "startPoint" spellings and a bare list of
// courses). Unlike the Android importer, it keeps each course's id, so runs
// stay attached to their course.
//
// Writing produces a file the Android app can read back. Extra fields this
// version adds (heartRate per point, avgHeartRate / maxHeartRate per ride) are
// ignored by the Android app, so nothing breaks.

const num = (v, d = 0) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};
const int = (v, d = 0) => Math.trunc(num(v, d));
const str = (v, d) => (typeof v === "string" ? v : v == null ? d : String(v));
const bool = (v) => v === true || v === "true";
const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== null;
const arr = (v) => (Array.isArray(v) ? v : []);

function latLng(o) {
  return {
    lat: has(o, "lat") ? num(o.lat) : num(o?.latitude),
    lng: has(o, "lng") ? num(o.lng) : num(o?.longitude),
  };
}

export function readLatLngList(a) { return arr(a).filter((o) => o && typeof o === "object").map(latLng); }

export function readTrackList(a) {
  return arr(a).filter((o) => o && typeof o === "object").map((o) => {
    const p = { ...latLng(o), elapsedMs: int(o.elapsedMs) };
    if (has(o, "altitudeMeters") && Number.isFinite(num(o.altitudeMeters, NaN))) p.altitudeMeters = num(o.altitudeMeters);
    if (has(o, "heartRate") && num(o.heartRate, 0) > 0) p.heartRate = int(o.heartRate);
    return p;
  });
}

const readIntList = (a) => arr(a).map((v) => int(v));
const readNullableIntList = (a) => arr(a).map((v) => (v == null ? null : int(v)));

function hrFields(o) {
  const out = {};
  if (num(o.avgHeartRate, 0) > 0) out.avgHeartRate = int(o.avgHeartRate);
  if (num(o.maxHeartRate, 0) > 0) out.maxHeartRate = int(o.maxHeartRate);
  return out;
}

export function readCourse(o, i, now) {
  const route = readLatLngList(has(o, "route") ? o.route : o.routePoints);
  let start;
  if (has(o, "start")) start = { lat: num(o.start.lat), lng: num(o.start.lng) };
  else if (has(o, "startPoint")) start = { lat: num(o.startPoint.latitude, num(o.startPoint.lat)), lng: num(o.startPoint.longitude, num(o.startPoint.lng)) };
  else start = route.length ? { ...route[0] } : { lat: 0, lng: 0 };
  const id = typeof o.id === "string" && o.id.trim() ? o.id : `imported_${now}_${i}`;
  return {
    id,
    name: str(o.name, "Imported Track"),
    distanceKm: num(o.distanceKm),
    startPoint: start,
    routePoints: route,
    recordTimeSeconds: has(o, "recordTimeSeconds") ? int(o.recordTimeSeconds) : null,
    referenceSamples: readTrackList(o.referenceSamples),
    splitIndices: readIntList(o.splitIndices),
  };
}

export function readFreeroam(o, i) {
  return {
    id: str(o.id, `freeroam_${i}`),
    finishedAtEpochMs: int(o.finishedAtEpochMs),
    elapsedSeconds: int(o.elapsedSeconds),
    distanceKm: num(o.distanceKm),
    averageSpeedKmh: num(o.averageSpeedKmh),
    maxSpeedKmh: num(o.maxSpeedKmh),
    routePoints: readLatLngList(o.route),
    samples: readTrackList(o.samples),
    isStarred: bool(o.isStarred),
    ...hrFields(o),
  };
}

export function readCourseRun(o, i) {
  return {
    id: str(o.id, `course_run_${i}`),
    courseId: str(o.courseId, ""),
    courseName: str(o.courseName, "Course"),
    finishedAtEpochMs: int(o.finishedAtEpochMs),
    elapsedSeconds: int(o.elapsedSeconds),
    distanceKm: num(o.distanceKm),
    averageSpeedKmh: num(o.averageSpeedKmh),
    maxSpeedKmh: num(o.maxSpeedKmh),
    wasNewRecord: bool(o.wasNewRecord),
    deltaSeconds: has(o, "deltaSeconds") ? int(o.deltaSeconds) : null,
    routePoints: readLatLngList(o.route),
    samples: readTrackList(o.samples),
    isStarred: bool(o.isStarred),
    sectorTimesSeconds: readIntList(o.sectorTimesSeconds),
    sectorDeltaSeconds: readNullableIntList(o.sectorDeltaSeconds),
    deltaReferenceSamples: readTrackList(o.deltaReferenceSamples),
    ...hrFields(o),
  };
}

/**
 * Parse a backup file's text. Returns { courses, freeroamSessions, courseRuns }
 * where a list is null if the file didn't contain that section.
 * Throws an Error with a Hungarian message the screen can show.
 */
export function parseBackup(text, now = Date.now()) {
  let root;
  try { root = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw new Error("Ez a fájl nem olvasható mentés (nem JSON)."); }
  if (Array.isArray(root)) root = { courses: root };
  if (!root || typeof root !== "object") throw new Error("Ez a fájl nem DesiBuff mentés.");
  const out = {
    courses: Array.isArray(root.courses) ? root.courses.filter(Boolean).map((c, i) => readCourse(c, i, now)) : null,
    freeroamSessions: Array.isArray(root.freeroamSessions) ? root.freeroamSessions.filter(Boolean).map(readFreeroam) : null,
    courseRuns: Array.isArray(root.courseRuns) ? root.courseRuns.filter(Boolean).map(readCourseRun) : null,
  };
  if (!out.courses && !out.freeroamSessions && !out.courseRuns) throw new Error("A fájlban nincs pálya, futam vagy szabad menet.");
  return out;
}

// ---------- writing ----------

const ll = (list) => list.map((p) => ({ lat: p.lat, lng: p.lng }));
const track = (list, { withExtras = true } = {}) => list.map((p) => {
  const o = { lat: p.lat, lng: p.lng, elapsedMs: p.elapsedMs };
  if (withExtras && p.altitudeMeters != null) o.altitudeMeters = p.altitudeMeters;
  if (withExtras && p.heartRate != null) o.heartRate = p.heartRate;
  return o;
});
const hrOut = (o) => ({
  ...(o.avgHeartRate ? { avgHeartRate: o.avgHeartRate } : {}),
  ...(o.maxHeartRate ? { maxHeartRate: o.maxHeartRate } : {}),
});

export function courseToJson(c) {
  return {
    id: c.id, name: c.name, distanceKm: c.distanceKm,
    ...(c.recordTimeSeconds != null ? { recordTimeSeconds: c.recordTimeSeconds } : {}),
    start: { lat: c.startPoint.lat, lng: c.startPoint.lng },
    route: ll(c.routePoints),
    referenceSamples: track(c.referenceSamples, { withExtras: false }),
    splitIndices: [...c.splitIndices],
  };
}

export function freeroamToJson(s) {
  return {
    id: s.id, finishedAtEpochMs: s.finishedAtEpochMs, elapsedSeconds: s.elapsedSeconds, distanceKm: s.distanceKm,
    averageSpeedKmh: s.averageSpeedKmh, maxSpeedKmh: s.maxSpeedKmh, route: ll(s.routePoints),
    samples: track(s.samples), isStarred: !!s.isStarred, ...hrOut(s),
  };
}

export function courseRunToJson(r) {
  return {
    id: r.id, courseId: r.courseId, courseName: r.courseName, finishedAtEpochMs: r.finishedAtEpochMs,
    elapsedSeconds: r.elapsedSeconds, distanceKm: r.distanceKm, averageSpeedKmh: r.averageSpeedKmh,
    maxSpeedKmh: r.maxSpeedKmh, wasNewRecord: !!r.wasNewRecord,
    ...(r.deltaSeconds != null ? { deltaSeconds: r.deltaSeconds } : {}),
    route: ll(r.routePoints), samples: track(r.samples), isStarred: !!r.isStarred,
    sectorTimesSeconds: [...r.sectorTimesSeconds], sectorDeltaSeconds: [...r.sectorDeltaSeconds],
    deltaReferenceSamples: track(r.deltaReferenceSamples), ...hrOut(r),
  };
}

export function exportBackup({ courses, freeroamSessions, courseRuns }) {
  return JSON.stringify({
    version: 2,
    courses: courses.map(courseToJson),
    freeroamSessions: freeroamSessions.map(freeroamToJson),
    courseRuns: courseRuns.map(courseRunToJson),
  }, null, 2);
}
