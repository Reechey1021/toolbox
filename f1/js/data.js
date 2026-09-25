// js/data.js
// Turning the season's data into what the hub shows. Pure: no DOM, no network.

// Roughly how long each session runs, to tell when one is live.
const LENGTH_MIN = { fp1: 60, fp2: 60, fp3: 60, sq: 45, sprint: 60, quali: 60, race: 120 };
export const SESSION_NAMES = { fp1: "Practice 1", fp2: "Practice 2", fp3: "Practice 3", sq: "Sprint Qualifying", sprint: "Sprint", quali: "Qualifying", race: "Race" };
export const SESSION_SHORT = { fp1: "FP1", fp2: "FP2", fp3: "FP3", sq: "Sprint Quali", sprint: "Sprint", quali: "Quali", race: "Race" };

const when = (o) => (o?.date ? new Date(`${o.date}T${o.time || "12:00:00Z"}`) : null);

// A race from the schedule, trimmed to what we show.
export function trimRace(r) {
  const s = [
    ["fp1", r.FirstPractice],
    ["sq", r.SprintQualifying || r.SprintShootout],
    ["fp2", r.SecondPractice],
    ["fp3", r.ThirdPractice],
    ["sprint", r.Sprint],
    ["quali", r.Qualifying],
    ["race", { date: r.date, time: r.time }],
  ]
    .filter(([, o]) => o?.date)
    .map(([id, o]) => ({ id, start: when(o).toISOString() }))
    .sort((a, b) => a.start.localeCompare(b.start));
  return {
    round: Number(r.round),
    name: r.raceName,
    circuit: r.Circuit?.circuitName ?? "",
    locality: r.Circuit?.Location?.locality ?? "",
    country: r.Circuit?.Location?.country ?? "",
    sessions: s,
    sprint: s.some((x) => x.id === "sprint"),
  };
}

export const startOf = (session) => new Date(session.start);
export const endOf = (session) => new Date(startOf(session).getTime() + (LENGTH_MIN[session.id] ?? 60) * 60000);
export const raceStart = (race) => startOf(race.sessions.find((s) => s.id === "race") ?? race.sessions[race.sessions.length - 1]);
export const weekendStart = (race) => startOf(race.sessions[0]);

// "upcoming" | "live" | "done"
export function sessionState(session, now = new Date()) {
  if (now < startOf(session)) return "upcoming";
  return now < endOf(session) ? "live" : "done";
}

// The next race: the first whose race hasn't finished yet.
export function nextRace(races, now = new Date()) {
  return races.find((r) => now < endOf(r.sessions.find((s) => s.id === "race") ?? r.sessions[r.sessions.length - 1])) ?? null;
}

// The session to count down to (or the one that's live).
export function nextSession(race, now = new Date()) {
  return race?.sessions.find((s) => sessionState(s, now) !== "done") ?? null;
}

// "2d 4h 12m", "3h 05m", "12m 30s"
export function countdown(ms) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hr = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${hr}h ${String(m).padStart(2, "0")}m`;
  if (hr) return `${hr}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

// "1:16.901" -> 76.901 (seconds); "" -> null
export function secondsOf(t) {
  if (!t) return null;
  const [a, b] = String(t).includes(":") ? String(t).split(":") : ["0", String(t)];
  const s = Number(a) * 60 + Number(b);
  return isFinite(s) && s > 0 ? s : null;
}

// Qualifying deltas: each driver's best lap against pole. Pole gets "—".
export function qualiDeltas(rows) {
  const best = rows.map((r) => Math.min(...[r.q1, r.q2, r.q3].map(secondsOf).filter((x) => x !== null)));
  const pole = best[0];
  return rows.map((r, i) => ({ ...r, delta: i === 0 ? "\u2014" : isFinite(best[i]) && isFinite(pole) ? `+${(best[i] - pole).toFixed(3)}s` : "" }));
}

// 92.345 seconds -> "1:32.345"
export function lapTime(seconds) {
  if (!(seconds > 0)) return "";
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(3).padStart(6, "0");
  return m ? `${m}:${s}` : s;
}

const FLAGS = {
  Australia: "AU", Bahrain: "BH", "Saudi Arabia": "SA", Japan: "JP", China: "CN", USA: "US", "United States": "US", Italy: "IT", Monaco: "MC", Spain: "ES", Canada: "CA", Austria: "AT", UK: "GB", "United Kingdom": "GB", Belgium: "BE", Hungary: "HU", Netherlands: "NL", Azerbaijan: "AZ", Singapore: "SG", Mexico: "MX", Brazil: "BR", Qatar: "QA", UAE: "AE", "United Arab Emirates": "AE", Portugal: "PT", France: "FR", Germany: "DE", Turkey: "TR", Russia: "RU", Vietnam: "VN", "South Africa": "ZA", Argentina: "AR", Thailand: "TH", Korea: "KR", India: "IN", Malaysia: "MY",
};
// The country's flag emoji (or a chequered flag).
export function flagFor(country) {
  const code = FLAGS[country];
  if (!code) return "\u{1F3C1}";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// Team colours (by Jolpica's constructor id), for the bar beside each result.
export const TEAM_COLOURS = {
  mclaren: "#ff8000", ferrari: "#e8002d", red_bull: "#3671c6", mercedes: "#27f4d2", aston_martin: "#229971", alpine: "#ff87bc", williams: "#64c4ff", rb: "#6692ff", sauber: "#52e252", audi: "#bb0a30", kick_sauber: "#52e252", haas: "#b6babd", cadillac: "#c9a25a",
};
