// js/api.js
// The season from Jolpica (the free successor to the Ergast F1 API): the schedule,
// winners, and qualifying, sprint and race results. Practice and sprint
// qualifying from OpenF1 (free for finished sessions). Only the fields the hub
// shows are kept, in this browser, so storage stays tiny.

import { trimRace, lapTime, endOf, raceStart, weekendStart, qualiDeltas } from "./data.js";

const JOLPICA = "https://api.jolpi.ca/ergast/f1";
const OPENF1 = "https://api.openf1.org/v1";
const P = "reechF1:";
const HOUR = 3600000;
const DAY = 24 * HOUR;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(P + key) || "null");
  } catch {
    return null;
  }
}
function write(key, data) {
  try {
    localStorage.setItem(P + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* full or private: fine, it just refetches */
  }
}
// Tidy up: anything older than 40 days goes.
try {
  for (const k of Object.keys(localStorage)) if (k.startsWith(P) && Date.now() - (JSON.parse(localStorage.getItem(k))?.at ?? 0) > 40 * DAY) localStorage.removeItem(k);
} catch {
  /* fine */
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The data service said ${res.status}. Try again in a minute.`);
  return res.json();
}

// Cached for `ttl`; if the network fails, the last copy is better than nothing.
async function cached(key, ttl, load, { force = false } = {}) {
  const c = read(key);
  if (!force && c && Date.now() - c.at < ttl) return c.data;
  try {
    const data = await load();
    write(key, data);
    return data;
  } catch (err) {
    if (c) return c.data;
    throw err;
  }
}

export async function schedule(season = "current", opts) {
  return cached(`schedule:${season}`, 6 * HOUR, async () => (await getJSON(`${JOLPICA}/${season}.json?limit=100`)).MRData.RaceTable.Races.map(trimRace), opts);
}

// Every race winner this season, in one small request.
export async function winners(season = "current", opts) {
  return cached(`winners:${season}`, HOUR, async () => {
    const races = (await getJSON(`${JOLPICA}/${season}/results/1.json?limit=100`)).MRData.RaceTable.Races;
    return Object.fromEntries(races.map((r) => [r.round, { driver: `${r.Results[0].Driver.givenName} ${r.Results[0].Driver.familyName}`, team: r.Results[0].Constructor.name, teamId: r.Results[0].Constructor.constructorId }]));
  }, opts);
}

const driver = (d) => ({ code: d.code || d.familyName.slice(0, 3).toUpperCase(), name: `${d.givenName} ${d.familyName}` });

async function jolpicaResults(season, round, id) {
  if (id === "quali") {
    const r = (await getJSON(`${JOLPICA}/${season}/${round}/qualifying.json?limit=30`)).MRData.RaceTable.Races[0];
    return qualiDeltas((r?.QualifyingResults ?? []).map((x) => ({ pos: Number(x.position), ...driver(x.Driver), team: x.Constructor.name, teamId: x.Constructor.constructorId, detail: x.Q3 || x.Q2 || x.Q1 || "", extra: x.Q3 ? "Q3" : x.Q2 ? "Q2" : "Q1", q1: x.Q1, q2: x.Q2, q3: x.Q3 }))).map(({ q1, q2, q3, ...row }) => row);
  }
  const path = id === "sprint" ? "sprint" : "results";
  const r = (await getJSON(`${JOLPICA}/${season}/${round}/${path}.json?limit=30`)).MRData.RaceTable.Races[0];
  const list = (id === "sprint" ? r?.SprintResults : r?.Results) ?? [];
  return list.map((x) => ({ pos: Number(x.position), ...driver(x.Driver), team: x.Constructor.name, teamId: x.Constructor.constructorId, detail: x.Time?.time ?? x.status, extra: `${x.points} pts`, grid: Number(x.grid) }));
}

const OPENF1_NAMES = { fp1: ["Practice 1"], fp2: ["Practice 2"], fp3: ["Practice 3"], sq: ["Sprint Qualifying", "Sprint Shootout"] };
async function openf1Results(race, id) {
  const from = new Date(weekendStart(race).getTime() - DAY).toISOString().slice(0, 10);
  const to = new Date(raceStart(race).getTime() + DAY).toISOString().slice(0, 10);
  const sessions = await getJSON(`${OPENF1}/sessions?date_start>=${from}&date_start<=${to}`);
  const s = sessions.find((x) => OPENF1_NAMES[id].includes(x.session_name));
  if (!s) return [];
  const [res, drivers] = await Promise.all([getJSON(`${OPENF1}/session_result?session_key=${s.session_key}`), getJSON(`${OPENF1}/drivers?session_key=${s.session_key}`)]);
  const byNum = Object.fromEntries(drivers.map((d) => [d.driver_number, d]));
  return res
    .filter((x) => x.position)
    .sort((a, b) => a.position - b.position)
    .map((x) => {
      const d = byNum[x.driver_number] ?? {};
      const best = Array.isArray(x.duration) ? x.duration.filter(Boolean).pop() : x.duration;
      const gap = Array.isArray(x.gap_to_leader) ? x.gap_to_leader.filter((g) => g !== null).pop() : x.gap_to_leader;
      return { pos: x.position, code: d.name_acronym || String(x.driver_number), name: d.full_name ? d.full_name.replace(/\b([A-Z])([A-Z]+)\b/g, (m, a, b) => a + b.toLowerCase()) : `#${x.driver_number}`, team: d.team_name || "", colour: d.team_colour ? `#${d.team_colour}` : null, detail: lapTime(best), extra: x.position === 1 ? `${x.number_of_laps ?? ""} laps` : gap ? `+${Number(gap).toFixed(3)}` : "" };
    });
}

// The championship: drivers and constructors, one request each, kept an hour.
export async function standings(season = "current", opts) {
  return cached(`standings:${season}`, HOUR, async () => {
    const [d, c] = await Promise.all([getJSON(`${JOLPICA}/${season}/driverStandings.json?limit=40`), getJSON(`${JOLPICA}/${season}/constructorStandings.json?limit=20`)]);
    const dl = d.MRData.StandingsTable.StandingsLists[0];
    const cl = c.MRData.StandingsTable.StandingsLists[0];
    return {
      round: Number(dl?.round ?? 0),
      drivers: (dl?.DriverStandings ?? []).map((x) => ({ pos: Number(x.position || x.positionText) || null, ...driver(x.Driver), team: x.Constructors?.[0]?.name ?? "", teamId: x.Constructors?.[0]?.constructorId ?? "", points: Number(x.points), wins: Number(x.wins) })),
      teams: (cl?.ConstructorStandings ?? []).map((x) => ({ pos: Number(x.position || x.positionText) || null, team: x.Constructor.name, teamId: x.Constructor.constructorId, points: Number(x.points), wins: Number(x.wins) })),
    };
  }, opts);
}

// A session's results. Final ones (more than 6 hours after it ended) are kept a month.
export async function results(season, race, session, opts) {
  const final = Date.now() - endOf(session).getTime() > 6 * HOUR;
  const load = () => (["quali", "sprint", "race"].includes(session.id) ? jolpicaResults(season, race.round, session.id) : openf1Results(race, session.id));
  return cached(`results:${season}:${race.round}:${session.id}`, final ? 30 * DAY : 10 * 60000, load, opts);
}
