// screens/arcadeSetup.js
// Setting up an arcade game on this device: players, game, options, games,
// the tie rule, and who throws first.

import { h, replaceChildren } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { topBar, segmented, confirm } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { getOwner, ownerAsPlayer, cleanName } from "../services/profile.js";
import { getSettings, setSetting } from "../services/settings.js";
import { getActive, activeState, startMatch } from "../services/session.js";
import { needsBull } from "../engine/match.js";
import { createArcade } from "../engine/arcade/core.js";
import { arcadeOptions, defaultArcade } from "./parts/arcadeOptions.js";

export function arcadeSetupScreen(params = {}) {
  const last = getSettings().lastArcade ?? {};
  const a = defaultArcade(last.game);
  if (params.mode) a.mode = params.mode; // "Change game" arrives with one picked
  const players = [{ owner: true, name: getOwner().name }, ...(last.guests ?? [""]).map((name) => ({ owner: false, name }))].slice(0, 4);
  let first = last.first ?? 0;

  const list = h("ol", { class: "players" });
  const firstWrap = h("div");
  const opts = arcadeOptions(a, { playerCount: () => players.length });

  function renderPlayers() {
    replaceChildren(
      list,
      players.map((p, i) =>
        h(
          "li",
          { class: "player" },
          h("span", { class: "player__order num", "aria-hidden": "true" }, i + 1),
          h(
            "div",
            { class: "player__body" },
            p.owner
              ? h("span", { class: "player__name" }, p.name, h("span", { class: "tag" }, "You"))
              : h("input", {
                  class: "field player__input",
                  type: "text",
                  value: p.name,
                  maxlength: 16,
                  autocapitalize: "words",
                  placeholder: `Player ${i + 1}`,
                  "aria-label": `Player ${i + 1} name`,
                  oninput: (e) => ((p.name = e.target.value), renderFirst()),
                })
          ),
          players.length > 1
            ? h(
                "button",
                {
                  class: "icon-btn",
                  type: "button",
                  "aria-label": `Remove ${p.owner ? p.name : cleanName(p.name) || `player ${i + 1}`}`,
                  onclick: () => {
                    players.splice(i, 1);
                    if (typeof first === "number" && first >= players.length) first = 0;
                    refresh();
                  },
                },
                icon("close", { size: 20 })
              )
            : null
        )
      ),
      players.length < 4
        ? h(
            "li",
            { class: "players__add" },
            h(
              "button",
              {
                class: "btn btn--quiet players__new",
                type: "button",
                onclick: () => {
                  players.push({ owner: false, name: "" });
                  refresh();
                  [...list.querySelectorAll(".player__input")].pop()?.focus();
                },
              },
              icon("plus", { size: 18 }),
              h("span", { class: "btn__label" }, "Add player")
            )
          )
        : null
    );
  }

  const nameOf = (p, i) => (p.owner ? p.name : cleanName(p.name) || `Player ${i + 1}`);
  function renderFirst() {
    if (players.length < 2) return replaceChildren(firstWrap);
    const options = [...players.map((p, i) => ({ value: i, label: nameOf(p, i) })), { value: "random", label: "Random" }, { value: "bull", label: "Throw for bull" }];
    if (!options.some((o) => o.value === first)) first = 0;
    replaceChildren(
      firstWrap,
      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Throws first")),
        segmented({ label: "Throws first", value: first, options, className: "seg--wrap", onChange: (v) => (first = v) }),
        h("p", { class: "setup__hint faint" }, "Each new game, the next player leads off.")
      )
    );
  }

  function refresh() {
    renderPlayers();
    renderFirst();
    opts.refresh();
  }
  refresh();

  async function start() {
    const existing = getActive();
    if (existing && existing.events.length && !activeState().finished) {
      const ok = await confirm({ title: "Replace the match in progress?", lead: "The unfinished match won't be saved.", confirmLabel: "Start new game", tone: "danger" });
      if (!ok) return;
    }
    const roster = players.map((p, i) => (p.owner ? ownerAsPlayer() : { id: `guest:${cleanName(p.name).toLowerCase() || i}`, name: nameOf(p, i) }));
    setSetting("lastArcade", { game: a, guests: players.filter((p) => !p.owner).map((p) => cleanName(p.name)), first });
    const cfg = createArcade({ kind: a.mode, players: roster, options: a.options[a.mode], format: { type: a.formatType, legs: a.legs }, tie: a.tie, firstPlayer: first });
    startMatch(cfg);
    navigate(needsBull(cfg) ? "/bull" : "/game");
  }

  const el = h(
    "div",
    { class: "setup arcade-setup" },
    h(
      "main",
      { class: "page" },
      topBar({ title: "Arcade", back: "#/" }),
      h("section", { class: "section section--first" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Players")), list),
      opts.game,
      opts.options,
      opts.games,
      opts.ties,
      firstWrap
    ),
    h("div", { class: "setup__go" }, h("div", { class: "setup__go-inner" }, h("button", { class: "btn btn--primary btn--block", type: "button", onclick: start }, "Start game")))
  );
  return { el, title: "Arcade" };
}
