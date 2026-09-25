// node f1/tests/run.mjs
import { trimRace, sessionState, nextRace, nextSession, countdown, lapTime, flagFor, raceStart, qualiDeltas, secondsOf } from "../js/data.js";
let passed = 0, failed = 0;
const eq = (a, b, m) => (JSON.stringify(a) === JSON.stringify(b) ? passed++ : (failed++, console.log("  FAIL", m, "\n       expected", JSON.stringify(b), "got", JSON.stringify(a))));
const ok = (c, m) => (c ? passed++ : (failed++, console.log("  FAIL", m)));

const raw = { round: "18", raceName: "Singapore Grand Prix", date: "2026-10-04", time: "12:00:00Z", Circuit: { circuitName: "Marina Bay", Location: { locality: "Marina Bay", country: "Singapore" } }, FirstPractice: { date: "2026-10-02", time: "09:30:00Z" }, SecondPractice: { date: "2026-10-02", time: "13:00:00Z" }, ThirdPractice: { date: "2026-10-03", time: "09:30:00Z" }, Qualifying: { date: "2026-10-03", time: "13:00:00Z" } };
const r = trimRace(raw);
eq([r.round, r.name, r.country, r.sprint], [18, "Singapore Grand Prix", "Singapore", false], "a race, trimmed");
eq(r.sessions.map((s) => s.id), ["fp1", "fp2", "fp3", "quali", "race"], "sessions in order");
const sprintRace = trimRace({ ...raw, round: "19", SprintQualifying: { date: "2026-10-02", time: "13:00:00Z" }, Sprint: { date: "2026-10-03", time: "09:00:00Z" }, SecondPractice: undefined, ThirdPractice: undefined });
eq(sprintRace.sessions.map((s) => s.id), ["fp1", "sq", "sprint", "quali", "race"], "a sprint weekend");
const fp1 = r.sessions[0];
eq([sessionState(fp1, new Date("2026-10-02T09:00:00Z")), sessionState(fp1, new Date("2026-10-02T10:00:00Z")), sessionState(fp1, new Date("2026-10-02T11:00:00Z"))], ["upcoming", "live", "done"], "before, during, after");
const races = [trimRace({ ...raw, round: "17", date: "2026-09-20" , FirstPractice: { date: "2026-09-18", time: "09:30:00Z" }, SecondPractice: undefined, ThirdPractice: undefined, Qualifying: { date: "2026-09-19", time: "13:00:00Z" } }), r];
eq(nextRace(races, new Date("2026-09-25T00:00:00Z")).round, 18, "the next race");
eq(nextRace(races, new Date("2026-09-20T13:00:00Z")).round, 17, "during a race, it's still the next one");
eq(nextSession(r, new Date("2026-10-02T12:00:00Z")).id, "fp2", "the next session");
eq([countdown(2 * 86400000 + 4 * 3600000 + 12 * 60000), countdown(3 * 3600000 + 5 * 60000), countdown(12 * 60000 + 30000), countdown(-5)], ["2d 4h 12m", "3h 05m", "12m 30s", "now"], "countdowns");
eq([lapTime(92.345), lapTime(59.9), lapTime(0)], ["1:32.345", "59.900", ""], "lap times");
ok(flagFor("Hungary") === "\u{1F1ED}\u{1F1FA}" && flagFor("Atlantis") === "\u{1F3C1}", "flags");
eq(raceStart(r).toISOString(), "2026-10-04T12:00:00.000Z", "race start");
eq([secondsOf("1:16.901"), secondsOf("59.5"), secondsOf("")], [76.901, 59.5, null], "lap times to seconds");
eq(qualiDeltas([{ q1: "1:17.9", q2: "1:17.5", q3: "1:16.901" }, { q1: "1:18.0", q2: "1:17.536", q3: "1:17.600" }, { q1: "1:18.2" }]).map((r) => r.delta), ["\u2014", "+0.635s", "+1.299s"], "qualifying deltas to pole (each driver's best)");
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
