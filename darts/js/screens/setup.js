// screens/setup.js
// Set up a local match. Remembers the last setup so a rematch night is one tap.
// Handicaps are deliberately never remembered: every new match starts level.

import { h, clear, append } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { topBar, segmented, stepper, switchRow, confirm, toast, openSheet } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { getOwner, ownerAsPlayer, guestPlayer, recentPlayers, rememberPlayers, cleanName } from "../services/profile.js";
import { getSettings, setSetting } from "../services/settings.js";
import { getActive, activeState, startMatch } from "../services/session.js";
import { createMatch, cleanHandicap, cleanStartScore, describeHandicap, needsBull, MAX_PLAYERS, MULTIPLIERS, MIN_START, MAX_START } from "../engine/match.js";
import { matches } from "../services/storage.js";
import { recentAverage } from "../engine/stats.js";
import { makeNemesisPlayer, NEMESIS_NAME } from "../engine/nemesis/index.js";
import { cleanProfile, defaultProfile, describeProfile, formTarget } from "../engine/nemesis/profile.js";
import { openNemesisSheet } from "./parts/nemesisSheet.js";
import { matchOptions } from "./parts/matchOptions.js";

const TEAMS_MIN = 3;

function defaults() {
  const last = getSettings().lastSetup;
  const base = {
    players: [{ owner: true, name: getOwner().name, handicap: null, team: 0 }, { owner: false, name: "", handicap: null, team: 1 }],
    mode: "solo", // "solo" | "teams" (teams need three or more players)
    teamHandicaps: [null, null],
    startScore: 501,
    customScore: 1001,
    formatType: "firstTo",
    legs: 3,
    checkIn: "straight",
    checkOut: "double",
    first: 0,
    trackDoubles: getSettings().trackDoubles,
  };
  if (!last) return base;
  return {
    ...base,
    ...last,
    players: (last.players || base.players).map((p, i) =>
      p.bot
        ? { owner: false, bot: true, name: NEMESIS_NAME, profile: cleanProfile(p.profile ?? defaultProfile()), handicap: null, team: p.team ?? i % 2 }
        : p.owner
          ? { owner: true, name: getOwner().name, handicap: null, team: p.team ?? i % 2 }
          : { owner: false, name: p.name || "", handicap: null, team: p.team ?? i % 2 }
    ),
    mode: last.mode === "teams" ? "teams" : "solo",
    teamHandicaps: [null, null], // never remembered
    trackDoubles: last.trackDoubles ?? base.trackDoubles,
  };
}

export async function setupScreen() {
  const s = defaults();
  const recent = recentAverage(await matches.list(), getOwner().id);
  const hasBot = () => s.players.some((p) => p.bot);
  const displayName = (p, i) => (p.bot ? NEMESIS_NAME : p.owner ? p.name : cleanName(p.name) || `Player ${i + 1}`);
  // "Match my form" follows your latest average.
  for (const p of s.players) if (p.bot && p.profile.matchForm && formTarget(recent) !== null) p.profile = cleanProfile({ ...p.profile, target: formTarget(recent) });

  const playersList = h("div", { class: "players-wrap" });
  const modeWrap = h("div", { class: "setup__mode" });
  const teamsOn = () => s.mode === "teams" && s.players.length >= TEAMS_MIN;
  const teamOf = (t) => s.players.map((p, i) => ({ p, i })).filter(({ p }) => p.team === t);
  const addRow = h("div", { class: "players__add" });
  const firstWrap = h("div");
  const startBtn = h("button", { class: "btn btn--primary btn--block", type: "button", onclick: start }, "Start match");

  const matchRules = () => ({ startScore: s.startScore, checkIn: s.checkIn, checkOut: s.checkOut });

  // ---------------------------------------------------------------- players

  // Keep teams valid: everyone on team 0 or 1, and neither team empty.
  function balanceTeams() {
    s.players.forEach((p, i) => {
      if (p.team !== 0 && p.team !== 1) p.team = i < Math.ceil(s.players.length / 2) ? 0 : 1;
    });
    for (const t of [0, 1]) {
      if (s.players.length >= 2 && teamOf(t).length === 0) {
        const donor = teamOf(1 - t);
        donor[donor.length - 1].p.team = t;
      }
    }
  }

  function playerRow(p, i, { order, team = null }) {
    if (p.bot) return botRow(p, i, { order, team });
    const label = p.owner ? p.name : cleanName(p.name) || `player ${i + 1}`;
    const remove =
      s.players.length > 1
        ? h(
            "button",
            {
              class: "icon-btn",
              type: "button",
              "aria-label": `Remove ${label}`,
              onclick: () => {
                s.players.splice(i, 1);
                if (typeof s.first === "number") s.first = s.first === i ? 0 : s.first > i ? s.first - 1 : s.first;
                if (s.first >= s.players.length) s.first = 0;
                refresh();
              },
            },
            icon("close", { size: 20 })
          )
        : null;

    // Solo games: a handicap per player. Team games: the handicap lives on the team box.
    const hcp = team === null ? cleanHandicap(p.handicap, matchRules()) : null;
    const hcpBtn =
      team === null
        ? h(
            "button",
            {
              class: ["icon-btn", "player__hcp", hcp && "is-on"],
              type: "button",
              "aria-label": `Handicap for ${label}${hcp ? " (on)" : ""}`,
              title: "Handicap",
              onclick: () =>
                openHandicapSheet({
                  name: p.owner ? p.name : cleanName(p.name) || `Player ${i + 1}`,
                  current: p.handicap,
                  save: (next) => (p.handicap = next),
                }),
            },
            icon("sliders", { size: 20 })
          )
        : null;

    // Move to the other team, unless that would leave this team empty.
    const swap =
      team !== null
        ? h(
            "button",
            {
              class: "icon-btn",
              type: "button",
              "aria-label": `Move ${label} to Team ${2 - team}`,
              title: `Move to Team ${2 - team}`,
              disabled: teamOf(team).length <= 1,
              onclick: () => {
                p.team = 1 - team;
                refresh();
              },
            },
            icon("swap", { size: 20 })
          )
        : null;

    const name = p.owner
      ? h("span", { class: "player__name" }, p.name, h("span", { class: "tag" }, "You"))
      : h("input", {
          class: "field player__input",
          type: "text",
          value: p.name,
          maxlength: 16,
          autocapitalize: "words",
          autocomplete: "off",
          placeholder: `Player ${i + 1}`,
          "aria-label": `Player ${i + 1} name`,
          oninput: (e) => {
            p.name = e.target.value;
            renderFirst();
            if (teamsOn()) refreshTeamNames();
          },
        });

    const body = h(
      "div",
      { class: "player__body" },
      name,
      hcp
        ? h(
            "button",
            {
              class: "player__hcpnote",
              type: "button",
              onclick: () => openHandicapSheet({ name: label, current: p.handicap, save: (next) => (p.handicap = next) }),
            },
            `Handicap: ${describeHandicap(hcp, matchRules())}`
          )
        : null
    );

    return h("li", { class: "player" }, h("span", { class: "player__order num", "aria-hidden": "true" }, order), body, swap, hcpBtn, remove);
  }

  function editBot(p) {
    openNemesisSheet({
      profile: p.profile,
      recentAverage: recent,
      onSave: (next) => {
        p.profile = next;
        refresh();
      },
    });
  }

  // Nemesis's row: its personality instead of a name box and a handicap.
  function botRow(p, i, { order, team }) {
    const remove =
      s.players.length > 1
        ? h(
            "button",
            {
              class: "icon-btn",
              type: "button",
              "aria-label": `Remove ${NEMESIS_NAME}`,
              onclick: () => {
                s.players.splice(i, 1);
                if (typeof s.first === "number") s.first = s.first === i ? 0 : s.first > i ? s.first - 1 : s.first;
                if (s.first >= s.players.length) s.first = 0;
                refresh();
              },
            },
            icon("close", { size: 20 })
          )
        : null;
    const swap =
      team !== null
        ? h(
            "button",
            {
              class: "icon-btn",
              type: "button",
              "aria-label": `Move ${NEMESIS_NAME} to Team ${2 - team}`,
              title: `Move to Team ${2 - team}`,
              disabled: teamOf(team).length <= 1,
              onclick: () => {
                p.team = 1 - team;
                refresh();
              },
            },
            icon("swap", { size: 20 })
          )
        : null;
    return h(
      "li",
      { class: "player player--bot" },
      h("span", { class: "player__order num", "aria-hidden": "true" }, order),
      h(
        "div",
        { class: "player__body" },
        h("span", { class: "player__name" }, NEMESIS_NAME, h("span", { class: "tag tag--bot" }, "Bot")),
        h("button", { class: "player__botnote", type: "button", onclick: () => editBot(p) }, describeProfile(p.profile))
      ),
      swap,
      h("button", { class: "icon-btn player__persona", type: "button", "aria-label": "Nemesis' personality", title: "Personality", onclick: () => editBot(p) }, icon("bot", { size: 20 })),
      remove
    );
  }

  // Team boxes are named after their players, like pairs on TV.
  const teamName = (t) => teamOf(t).map(({ p, i }) => displayName(p, i)).join(" & ");
  function refreshTeamNames() {
    playersList.querySelectorAll("[data-team-name]").forEach((el) => (el.textContent = teamName(Number(el.dataset.teamName))));
    const orderNote = playersList.querySelector(".teams__order");
    if (orderNote) orderNote.textContent = orderText();
  }

  // Throwing order: teams alternate, partners alternate.
  function teamCycle() {
    const lists = [teamOf(0).map(({ i }) => i), teamOf(1).map(({ i }) => i)];
    // One full turn each for the bigger team: A1 B1 A2 B2, or A1 B1 A2 B1 for 2 v 1.
    const turns = 2 * Math.max(lists[0].length, lists[1].length);
    return Array.from({ length: turns }, (_, pos) => lists[pos % 2][Math.floor(pos / 2) % lists[pos % 2].length]);
  }
  function orderText() {
    const names = teamCycle().map((i) => displayName(s.players[i], i));
    return `Throwing order: ${names.join(", ")}. It moves round one place each leg.`;
  }

  function renderMode() {
    clear(modeWrap);
    if (s.players.length < TEAMS_MIN) return;
    modeWrap.append(
      segmented({
        label: "How to play",
        value: s.mode,
        options: [
          { value: "solo", label: "Singles" },
          { value: "teams", label: "Teams" },
        ],
        className: "seg--wrap",
        onChange: (v) => {
          s.mode = v;
          if (v === "teams") s.players.forEach((p, i) => (p.team = i < Math.ceil(s.players.length / 2) ? 0 : 1));
          refresh();
        },
      })
    );
  }

  function renderPlayers() {
    clear(playersList);
    if (!teamsOn()) {
      const list = h("ol", { class: "players" });
      s.players.forEach((p, i) => list.append(playerRow(p, i, { order: i + 1 })));
      playersList.append(list);
      renderAdd();
      return;
    }

    balanceTeams();
    // Order numbers: each player's first turn in the throwing order.
    const firstTurn = new Map();
    teamCycle().forEach((i, k) => firstTurn.has(i) || firstTurn.set(i, k + 1));

    for (const t of [0, 1]) {
      const members = teamOf(t);
      const hcp = cleanHandicap(s.teamHandicaps[t], matchRules());
      const box = h(
        "section",
        { class: ["team", hcp && "has-hcp"], "aria-label": `Team ${t + 1}` },
        h(
          "div",
          { class: "team__head" },
          h("span", { class: "team__label" }, `Team ${t + 1}`),
          h("span", { class: "team__name", dataset: { teamName: String(t) } }, teamName(t)),
          h(
            "button",
            {
              class: ["icon-btn", "player__hcp", hcp && "is-on"],
              type: "button",
              "aria-label": `Handicap for Team ${t + 1}${hcp ? " (on)" : ""}`,
              title: "Team handicap",
              onclick: () => openHandicapSheet({ name: teamName(t), current: s.teamHandicaps[t], save: (next) => (s.teamHandicaps[t] = next) }),
            },
            icon("sliders", { size: 20 })
          )
        ),
        hcp ? h("p", { class: "team__hcp" }, `Handicap: ${describeHandicap(hcp, matchRules())}`) : null,
        h("ol", { class: "players players--team" }, members.map(({ p, i }) => playerRow(p, i, { order: firstTurn.get(i) ?? "", team: t })))
      );
      playersList.append(box);
    }
    playersList.append(h("p", { class: "setup__hint faint teams__order" }, orderText()));
    renderAdd();
  }

  function renderAdd() {
    clear(addRow);
    if (s.players.length >= MAX_PLAYERS) {
      addRow.append(h("p", { class: "faint players__full" }, `That's the maximum of ${MAX_PLAYERS} players.`));
      return;
    }
    const taken = new Set(s.players.map((p) => cleanName(p.name).toLowerCase()));
    const chips = [];
    if (!s.players.some((p) => p.owner)) {
      chips.push(
        h("button", { class: "chip", type: "button", onclick: () => addPlayer({ owner: true, name: getOwner().name, handicap: null }) }, icon("plus", { size: 16 }), `${getOwner().name} (you)`)
      );
    }
    for (const name of recentPlayers()) {
      if (taken.has(name.toLowerCase())) continue;
      chips.push(h("button", { class: "chip", type: "button", onclick: () => addPlayer({ owner: false, name, handicap: null }) }, icon("plus", { size: 16 }), name));
      if (chips.length >= 6) break;
    }
    append(
      addRow,
      h(
        "button",
        {
          class: "btn btn--quiet players__new",
          type: "button",
          onclick: () => {
            addPlayer({ owner: false, name: "", handicap: null });
            [...playersList.querySelectorAll(".player__input")].reverse().find((el) => !el.value)?.focus();
          },
        },
        h("span", { class: "btn__label" }, "Add player")
      ),
      hasBot()
        ? null
        : h(
            "button",
            {
              class: "btn btn--quiet players__new players__nemesis",
              type: "button",
              onclick: () => addPlayer({ owner: false, bot: true, name: NEMESIS_NAME, profile: cleanProfile(getSettings().lastNemesis?.profile ?? defaultProfile()), handicap: null }),
            },
            icon("bot", { size: 18 }),
            h("span", { class: "btn__label" }, "Add Nemesis")
          ),
      chips.length ? h("div", { class: "chips" }, chips) : null
    );
  }

  function addPlayer(p) {
    if (s.players.length >= MAX_PLAYERS) return;
    const smaller = teamOf(0).length <= teamOf(1).length ? 0 : 1;
    s.players.push({ ...p, team: smaller });
    refresh();
  }

  // ---------------------------------------------------------------- handicap sheet

  // The same sheet for a player (solo games) or a team (team games).
  function openHandicapSheet({ name, current, save }) {
    const base = matchRules();
    const d = { startScore: base.startScore, multiplier: 1, checkIn: base.checkIn, checkOut: base.checkOut, finish: "exact", ...(current || {}) };

    const startInput = h("input", {
      class: "field num",
      type: "number",
      inputmode: "numeric",
      min: MIN_START,
      max: MAX_START,
      value: d.startScore,
      "aria-label": "Starting score",
    });
    const startChips = h(
      "div",
      { class: "chips" },
      [121, 301, 501, 701].map((v) =>
        h("button", { class: "chip", type: "button", onclick: () => (startInput.value = String(v)) }, String(v))
      )
    );

    let multIndex = Math.max(0, MULTIPLIERS.indexOf(d.multiplier));
    const finishNote = h("p", { class: "setup__hint faint" });
    const finishSeg = segmented({
      label: "Finishing",
      value: d.finish,
      options: [
        { value: "exact", label: "Exact" },
        { value: "over", label: "Can go over" },
      ],
      onChange: (v) => (d.finish = v),
    });
    const syncFinish = () => {
      const forced = MULTIPLIERS[multIndex] !== 1;
      finishSeg.querySelector('[role="radio"]').disabled = forced;
      if (forced) finishSeg.setValue("over");
      else finishSeg.setValue(d.finish);
      finishNote.textContent = forced
        ? "With a multiplier, finishing is reaching zero or going over, so no score can get stuck."
        : "Exact is normal darts. Going over means any score that reaches zero wins the leg.";
    };
    const multStepper = stepper({
      value: multIndex,
      min: 0,
      max: MULTIPLIERS.length - 1,
      step: 1,
      label: "multiplier",
      format: (k) => `\u00d7${MULTIPLIERS[k]}`,
      onChange: (k) => {
        multIndex = k;
        syncFinish();
      },
    });

    const field = (label, control, hint = null) =>
      h("div", { class: "question" }, h("span", { class: "question__label" }, label), control, hint);

    const body = [
      field("Starting score", h("div", { class: "hcp__start" }, startInput, startChips)),
      field("Score multiplier", h("div", { class: "hcp__mult" }, multStepper, h("span", { class: "faint" }, "Each visit counts this many times over."))),
      field(
        "Start",
        segmented({
          label: "Start",
          value: d.checkIn,
          options: [
            { value: "straight", label: "Straight in" },
            { value: "double", label: "Double in" },
          ],
          onChange: (v) => (d.checkIn = v),
        })
      ),
      field(
        "Finish",
        segmented({
          label: "Finish",
          value: d.checkOut,
          options: [
            { value: "double", label: "Double out" },
            { value: "straight", label: "Straight out" },
          ],
          onChange: (v) => (d.checkOut = v),
        })
      ),
      field("Finishing", finishSeg, finishNote),
      h("p", { class: "hcp__note faint" }, "Averages still count what everyone actually throws. Checkout records aren't kept while a handicap is on."),
    ];

    const sheet = openSheet({
      title: `Handicap for ${name}`,
      lead: name.includes(" & ") ? "These rules apply to this team only." : "These rules apply to this player only.",
      className: "sheet--hcp",
      body,
      actions: [
        h(
          "button",
          {
            class: "btn btn--primary btn--block",
            type: "button",
            onclick: () => {
              const startScore = cleanStartScore(startInput.value, base.startScore);
              const next = cleanHandicap({ ...d, startScore, multiplier: MULTIPLIERS[multIndex] }, base);
              save(next);
              sheet.close();
              refresh();
              toast(next ? `Handicap set for ${name}` : `${name} plays level`);
            },
          },
          "Save handicap"
        ),
        current
          ? h(
              "button",
              {
                class: "btn btn--ghost btn--block",
                type: "button",
                onclick: () => {
                  save(null);
                  sheet.close();
                  refresh();
                },
              },
              "Remove handicap"
            )
          : null,
      ],
    });
    syncFinish();
  }

  // ---------------------------------------------------------------- game

  // ---------------------------------------------------------------- first to throw

  function renderFirst() {
    clear(firstWrap);
    if (s.players.length === 1) {
      s.first = 0;
      firstWrap.append(h("p", { class: "faint" }, "Just you. Practise legs and watch your average."));
      return;
    }
    const options = s.players.map((p, i) => ({ value: i, label: displayName(p, i) }));
    options.push({ value: "random", label: "Random" });
    options.push({ value: "bull", label: "Throw for bull" });
    if (!options.some((o) => o.value === s.first)) s.first = 0;
    firstWrap.append(
      segmented({
        label: "Throws first",
        value: s.first,
        options,
        className: "seg--wrap",
        onChange: (v) => {
          s.first = v;
          renderFirstHint();
        },
      }),
      h("p", { class: "setup__hint faint", id: "first-hint" })
    );
    renderFirstHint();
  }

  function renderFirstHint() {
    const hint = firstWrap.querySelector("#first-hint");
    if (!hint) return;
    hint.textContent =
      s.first === "bull"
        ? teamsOn()
          ? "The first player on each team throws one dart at the bull. Closest team starts."
          : "Everyone throws one dart at the bull and taps where it landed. Closest starts."
        : "Legs alternate after the first.";
  }

  function refresh() {
    renderMode();
    renderPlayers();
    matchOpts.refresh();
    renderFirst();
  }

  // ---------------------------------------------------------------- start

  async function start() {
    const players = [];
    const seen = new Set();
    for (let i = 0; i < s.players.length; i++) {
      const p = s.players[i];
      const handicap = cleanHandicap(p.handicap, matchRules());
      if (p.bot) {
        players.push(makeNemesisPlayer(p.profile));
        continue;
      }
      if (p.owner) {
        players.push({ ...ownerAsPlayer(), handicap });
        seen.add(getOwner().name.toLowerCase());
        continue;
      }
      const name = cleanName(p.name) || `Player ${i + 1}`;
      if (seen.has(name.toLowerCase())) {
        toast(`Two players are called ${name}. Give one a different name.`, { tone: "bad" });
        return;
      }
      seen.add(name.toLowerCase());
      players.push({ ...guestPlayer(name), handicap });
    }

    const existing = getActive();
    if (existing && existing.events.length && !activeState().finished) {
      const ok = await confirm({
        title: "Replace the match in progress?",
        lead: "The unfinished match won't be saved.",
        confirmLabel: "Start new match",
        tone: "danger",
      });
      if (!ok) return;
    }

    const teams = teamsOn() ? [teamOf(0).map(({ i }) => i), teamOf(1).map(({ i }) => i)] : null;
    const cfg = createMatch({
      players,
      teams,
      teamHandicaps: teams ? s.teamHandicaps.map((h0) => cleanHandicap(h0, matchRules())) : null,
      startScore: s.startScore,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      format: { type: s.formatType, legs: s.legs },
      firstPlayer: s.first,
      trackDoubles: s.trackDoubles,
    });

    rememberPlayers(players.filter((p) => !p.owner && !p.bot).map((p) => p.name));
    setSetting("lastSetup", {
      players: s.players.map((p) => (p.bot ? { bot: true, profile: p.profile, team: p.team } : { owner: p.owner, name: p.owner ? "" : cleanName(p.name), team: p.team })),
      mode: s.mode,
      startScore: s.startScore,
      customScore: s.customScore,
      formatType: s.formatType,
      legs: s.legs,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      first: s.first,
      trackDoubles: s.trackDoubles,
    });
    startMatch(cfg);
    navigate(needsBull(cfg) ? "/bull" : "/game");
  }

  // Game, Legs and Rules: shared with the Nemesis screen. Handicap notes depend
  // on the match rules, so the players redraw when they change.
  const matchOpts = matchOptions(s, { sideCount: () => (teamsOn() ? 2 : s.players.length), onChange: () => renderPlayers() });
  refresh();


  const el = h(
    "div",
    { class: "setup" },
    h(
      "main",
      { class: "page" },
      topBar({ title: "New match", back: "#/" }),

      h(
        "section",
        { class: "section section--first" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Players"), h("span", { class: "section__note" }, "In throwing order")),
        modeWrap,
        playersList,
        addRow
      ),

      matchOpts.game,
      matchOpts.legs,
      matchOpts.rules,

      h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Throws first")), firstWrap),

      h(
        "section",
        { class: "section rows" },
        switchRow({
          label: "Track checkout doubles",
          hint: "On the keypad, asks how many darts you threw at a double when it matters. The dart pad counts them for you.",
          checked: s.trackDoubles,
          onChange: (v) => (s.trackDoubles = v),
        })
      )
    ),
    h("div", { class: "setup__go" }, h("div", { class: "setup__go-inner" }, startBtn))
  );

  return { el, title: "New match" };
}
