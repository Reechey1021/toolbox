// js/main.js
// F1: the season at a glance. The next race up top (with a live countdown and
// every session in your time), the calendar below, and each race's results.

import { h, replaceChildren } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { defineRoutes, navigate } from "./ui/router.js";
import { SESSION_NAMES, SESSION_SHORT, sessionState, nextRace, nextSession, countdown, flagFor, startOf, TEAM_COLOURS, weekendStart, raceStart } from "./data.js";
import * as api from "./api.js";

const SEASON = "current";
let view = (() => {
  try {
    return localStorage.getItem("reechF1:view") === "champ" ? "champ" : "calendar";
  } catch {
    return "calendar";
  }
})();

// The championship: drivers, then constructors.
async function loadChamp(box) {
  replaceChildren(box, h("p", { class: "f1loading" }, "Loading the standings\u2026"));
  try {
    const st = await api.standings(SEASON);
    box.dataset.loaded = "1";
    const table = (rows, label) =>
      h(
        "ol",
        { class: "f1rows" },
        rows.map((r) =>
          h(
            "li",
            { class: "f1row" },
            h("span", { class: "f1row__bar", style: { background: TEAM_COLOURS[r.teamId] || "var(--line-strong)" } }),
            h("span", { class: "f1row__pos num" }, r.pos ?? "\u2013"),
            label === "drivers"
              ? h("span", { class: "f1row__driver" }, h("span", { class: "f1row__code" }, r.code), h("span", { class: "f1row__name" }, r.name), h("span", { class: "f1row__team" }, r.team))
              : h("span", { class: "f1row__driver" }, h("span", { class: "f1row__name f1row__name--team" }, r.team)),
            h("span", { class: "f1row__time" }, h("span", { class: "num f1row__pts" }, `${r.points} pts`), r.wins ? h("span", { class: "f1row__extra" }, `${r.wins} ${r.wins === 1 ? "win" : "wins"}`) : null)
          )
        )
      );
    replaceChildren(
      box,
      st.round ? h("p", { class: "f1sub muted" }, `After round ${st.round}`) : null,
      h("h2", { class: "f1section" }, "Drivers"),
      st.drivers.length ? table(st.drivers, "drivers") : h("p", { class: "muted f1empty" }, "No standings yet."),
      h("h2", { class: "f1section f1section--gap" }, "Constructors"),
      st.teams.length ? table(st.teams, "teams") : h("p", { class: "muted f1empty" }, "No standings yet.")
    );
  } catch (err) {
    replaceChildren(box, problem(err, () => loadChamp(box)));
  }
}
let ticker = null;
const stopTicker = () => (clearInterval(ticker), (ticker = null));

// "Fri 2 Oct, 10:30" in your time; "2–4 Oct" for a weekend.
const dayTime = (d) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const timeOnly = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayOnly = (d) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
function weekend(race) {
  const a = weekendStart(race);
  const b = raceStart(race);
  const m = (d) => d.toLocaleDateString("en-GB", { month: "short" });
  return a.getMonth() === b.getMonth() ? `${a.getDate()}\u2013${b.getDate()} ${m(b)}` : `${a.getDate()} ${m(a)} \u2013 ${b.getDate()} ${m(b)}`;
}
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ");

function page(title, back, ...body) {
  return h(
    "main",
    { class: "f1page" },
    h("header", { class: "f1head" }, h("a", { class: "icon-btn", href: back, "aria-label": back === "../" ? "Reech's Toolbox" : "Calendar" }, icon("back")), h("h1", { class: "f1head__title" }, title)),
    ...body
  );
}
const problem = (err, retry) => h("div", { class: "f1error" }, h("p", null, err?.message || "Couldn't load the season."), h("button", { class: "btn btn--quiet", type: "button", onclick: retry }, "Try again"));

// ---------------------------------------------------------------- home
async function home() {
  stopTicker();
  const el = page("F1", "../", h("p", { class: "f1loading" }, "Loading the season\u2026"));
  (async () => {
    let races;
    let wins = {};
    try {
      races = await api.schedule(SEASON);
    } catch (err) {
      return replaceChildren(el, ...page("F1", "../", problem(err, () => navigate("/", { replace: true }))).childNodes);
    }
    try {
      wins = await api.winners(SEASON);
    } catch {
      /* winners are a nice-to-have */
    }
    const now = new Date();
    const next = nextRace(races, now);
    const year = races[0] ? startOf(races[0].sessions[0]).getFullYear() : "";
    const champ = h("div", { class: "f1champ" });
    const calendar = h("div");
    const views = { calendar, champ };
    const switcher = h(
      "div",
      { class: "f1switch", role: "tablist" },
      [["calendar", "Calendar"], ["champ", "Championship"]].map(([id, label]) =>
        h("button", { class: "f1switch__opt", type: "button", role: "tab", "data-view": id, "aria-selected": String(view === id), onclick: () => showView(id) }, label)
      )
    );
    function showView(id) {
      view = id;
      try {
        localStorage.setItem("reechF1:view", id);
      } catch {
        /* fine */
      }
      for (const b of switcher.children) b.setAttribute("aria-selected", String(b.dataset.view === id));
      calendar.hidden = id !== "calendar";
      champ.hidden = id !== "champ";
      if (id === "champ" && !champ.dataset.loaded) loadChamp(champ);
    }
    replaceChildren(
      el,
      h("header", { class: "f1head" }, h("a", { class: "icon-btn", href: "../", "aria-label": "Reech's Toolbox" }, icon("back")), h("h1", { class: "f1head__title" }, `F1 ${year}`)),
      switcher,
      calendar,
      champ
    );
    replaceChildren(
      calendar,
      next ? hero(next) : h("section", { class: "f1hero f1hero--done" }, h("p", { class: "f1hero__eyebrow" }, "Season over"), h("h2", { class: "f1hero__name" }, "See you next year")),
      h("h2", { class: "f1section" }, "Calendar"),
      h(
        "ol",
        { class: "f1cal" },
        races.map((r) => {
          const isNext = next && r.round === next.round;
          const done = !isNext && raceStart(r) < now;
          const w = wins[String(r.round)];
          return h(
            "li",
            null,
            h(
              "a",
              { class: ["f1race", isNext && "is-next", done && "is-done"], href: `#/round/${r.round}` },
              h("span", { class: "f1race__round num" }, r.round),
              h("span", { class: "f1race__flag", "aria-hidden": "true" }, flagFor(r.country)),
              h("span", { class: "f1race__text" }, h("span", { class: "f1race__name" }, r.name.replace(" Grand Prix", " GP")), h("span", { class: "f1race__sub" }, done && w ? `\u{1F3C6} ${w.driver}` : `${weekend(r)}${r.sprint ? " \u00b7 Sprint" : ""}`)),
              isNext ? h("span", { class: "f1pill f1pill--next" }, "Next") : null
            )
          );
        })
      ),
      h("p", { class: "f1foot muted" }, `Times in your time zone (${zone()}). Data: Jolpica F1 and OpenF1.`)
    );
    showView(view);
    if (next) startTicker(el);
  })();
  return { el, title: "F1", destroy: stopTicker };
}

// The next race: its countdown and every session.
function hero(race) {
  const now = new Date();
  const ns = nextSession(race, now);
  return h(
    "a",
    { class: "f1hero", href: `#/round/${race.round}`, "aria-label": `${race.name}: sessions and results` },
    h("p", { class: "f1hero__eyebrow" }, `Round ${race.round} \u00b7 ${weekend(race)}`),
    h("span", { class: "f1hero__title" }, h("span", { class: "f1hero__flag", "aria-hidden": "true" }, flagFor(race.country)), h("span", { class: "f1hero__name" }, race.name)),
    h("p", { class: "f1hero__circuit" }, `${race.circuit}, ${race.locality}`),
    ns ? h("div", { class: "f1count", "data-start": ns.start, "data-id": ns.id }, h("span", { class: "f1count__label" }), h("span", { class: "f1count__value num" })) : null,
    h("ul", { class: "f1sessions" }, race.sessions.map((s) => sessionRow(s)))
  );
}

function sessionRow(s, onPick = null) {
  const st = sessionState(s);
  return h(
    "li",
    { class: ["f1session", `is-${st}`] },
    h("span", { class: "f1session__name" }, SESSION_NAMES[s.id]),
    h("span", { class: "f1session__when" }, dayTime(startOf(s))),
    st === "live" ? h("span", { class: "f1pill f1pill--live" }, "Live") : st === "done" ? h("span", { class: "f1session__done" }, "\u2713") : null
  );
}

function startTicker(root) {
  const tick = () => {
    const c = root.querySelector(".f1count");
    if (!c) return;
    const ms = new Date(c.dataset.start) - new Date();
    const name = SESSION_NAMES[c.dataset.id];
    c.querySelector(".f1count__label").textContent = ms > 0 ? `${name} starts in` : `${name} is on`;
    c.querySelector(".f1count__value").textContent = ms > 0 ? countdown(ms) : "Live now";
    c.classList.toggle("is-live", ms <= 0);
  };
  tick();
  ticker = setInterval(tick, 1000);
}

// ---------------------------------------------------------------- a race
async function round({ round: n }) {
  stopTicker();
  const el = page("Loading\u2026", "#/", h("p", { class: "f1loading" }, "Loading\u2026"));
  (async () => {
    let races;
    try {
      races = await api.schedule(SEASON);
    } catch (err) {
      return replaceChildren(el, ...page("F1", "#/", problem(err, () => navigate(`/round/${n}`, { replace: true }))).childNodes);
    }
    const race = races.find((r) => r.round === Number(n));
    if (!race) return replaceChildren(el, ...page("F1", "#/", h("p", null, "That round isn't on the calendar.")).childNodes);
    const played = race.sessions.filter((s) => sessionState(s) !== "upcoming");
    const table = h("div", { class: "f1results" });
    let tab = played.length ? played[played.length - 1].id : null;
    const tabs = h("div", { class: "f1tabs", role: "tablist" });

    async function show(id) {
      tab = id;
      replaceChildren(tabs, played.map((s) => h("button", { class: "f1tab", type: "button", role: "tab", "aria-selected": String(s.id === tab), onclick: () => show(s.id) }, SESSION_SHORT[s.id])));
      replaceChildren(table, h("p", { class: "f1loading" }, "Loading results\u2026"));
      const s = race.sessions.find((x) => x.id === id);
      try {
        const rows = await api.results(SEASON, race, s);
        if (tab !== id) return;
        if (!rows.length) return replaceChildren(table, h("p", { class: "muted f1empty" }, sessionState(s) === "live" ? "Results appear once the session's done." : "No results for this session yet."));
        replaceChildren(
          table,
          h(
            "ol",
            { class: "f1rows" },
            rows.map((r) =>
              h(
                "li",
                { class: "f1row" },
                h("span", { class: "f1row__bar", style: { background: r.colour || TEAM_COLOURS[r.teamId] || "var(--line-strong)" } }),
                h("span", { class: "f1row__pos num" }, r.pos),
                h("span", { class: "f1row__driver" }, h("span", { class: "f1row__code" }, r.code), h("span", { class: "f1row__name" }, r.name), h("span", { class: "f1row__team" }, r.team)),
                r.delta !== undefined ? h("span", { class: "f1row__delta num" }, r.delta) : null,
                h("span", { class: "f1row__time" }, h("span", { class: "num" }, r.detail), r.extra ? h("span", { class: "f1row__extra" }, r.extra) : null)
              )
            )
          )
        );
      } catch (err) {
        if (tab === id) replaceChildren(table, problem(err, () => show(id)));
      }
    }

    replaceChildren(
      el,
      h("header", { class: "f1head" }, h("a", { class: "icon-btn", href: "#/", "aria-label": "Calendar" }, icon("back")), h("h1", { class: "f1head__title" }, h("span", { "aria-hidden": "true" }, `${flagFor(race.country)} `), race.name)),
      h("p", { class: "f1sub muted" }, `Round ${race.round} \u00b7 ${race.circuit}, ${race.locality} \u00b7 ${weekend(race)}`),
      h("ul", { class: "f1sessions f1sessions--page" }, race.sessions.map((s) => sessionRow(s))),
      h("h2", { class: "f1section" }, "Results"),
      played.length ? [tabs, table] : h("p", { class: "muted f1empty" }, `Results appear here once the sessions start: ${SESSION_NAMES[race.sessions[0].id]} is ${dayOnly(startOf(race.sessions[0]))} at ${timeOnly(startOf(race.sessions[0]))}.`)
    );
    if (tab) show(tab);
  })();
  return { el, title: "F1", destroy: stopTicker };
}

const app = document.getElementById("app");
defineRoutes(
  [
    ["/", home],
    ["/round/:round", round],
  ],
  { mount: app }
);
