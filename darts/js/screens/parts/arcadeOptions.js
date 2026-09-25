// screens/parts/arcadeOptions.js
// Choosing an arcade game and its settings. Shared by the local arcade setup
// and online lobbies, so they can never drift apart.
//
// a: { mode, options: { [mode]: {...} }, formatType, legs, tie }
// playerCount(): for "best of" (two players only)

import { h, clear } from "../../ui/dom.js";
import { segmented, stepper, switchRow } from "../../ui/components.js";
import { MODES, MODE_LIST, TIE_RULES } from "../../engine/arcade/modes.js";
import { openHowToPlay } from "./rules.js";

export function defaultArcade(last = {}) {
  const options = {};
  for (const m of MODE_LIST) options[m.id] = { ...m.defaults, ...(last.options?.[m.id] ?? {}) };
  return { mode: MODES[last.mode] ? last.mode : "clock", options, formatType: last.formatType ?? "firstTo", legs: last.legs ?? 1, tie: last.tie ?? "sudden" };
}

function section(title, ...children) {
  return h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, title)), ...children);
}

export function arcadeOptions(a, { playerCount = () => 2, onChange = () => {} } = {}) {
  const tiles = h("div", { class: "arcade-modes", role: "radiogroup", "aria-label": "Game" });
  const how = h("button", { class: "btn btn--quiet arcade-how", type: "button", onclick: () => openHowToPlay(a.mode) });
  const optsBox = h("div", { class: "arcade-opts" });
  const formatBox = h("div", { class: "setup__format" });
  const tieHint = h("p", { class: "setup__hint faint" });
  const changed = () => onChange(a);

  function renderTiles() {
    how.replaceChildren(h("span", { class: "btn__label" }, `How to play ${MODES[a.mode].name}`));
    tiles.replaceChildren(
      ...MODE_LIST.map((m) =>
        h(
          "button",
          {
            type: "button",
            role: "radio",
            class: "preset arcade-mode",
            "aria-checked": String(a.mode === m.id),
            onclick: () => {
              a.mode = m.id;
              renderTiles();
              renderOpts();
              changed();
            },
          },
          h("span", { class: "preset__name" }, m.name),
          h("span", { class: "preset__blurb" }, m.blurb)
        )
      )
    );
  }

  const seg = (label, key, options) =>
    segmented({
      label,
      value: a.options[a.mode][key],
      options,
      className: "seg--wrap",
      onChange: (v) => {
        a.options[a.mode][key] = v;
        renderOpts();
        changed();
      },
    });
  const step = (key, min, max, stepBy, label) =>
    stepper({
      value: a.options[a.mode][key],
      min,
      max,
      step: stepBy,
      label,
      onChange: (v) => {
        a.options[a.mode][key] = v;
        changed();
      },
    });
  const labelled = (text, control) => h("div", { class: "arcade-opt" }, h("span", { class: "muted" }, text), control);

  function renderOpts() {
    clear(optsBox);
    const o = a.options[a.mode];
    const parts = {
      highscore: () => [labelled("Visits each", step("visits", 1, 30, 1, "visits"))],
      race: () => [seg("Target", "target", [300, 500, 600, 1000].map((v) => ({ value: v, label: String(v) })))],
      clock: () => [
        seg("Direction", "order", [
          { value: "up", label: "1 to 20" },
          { value: "down", label: "20 to 1" },
        ]),
        seg("Finish", "bull", [
          { value: "any", label: "25 or bull" },
          { value: "bull", label: "Bull only" },
          { value: "none", label: "No bull" },
        ]),
        seg("Hits count", "hits", [
          { value: "any", label: "Any" },
          { value: "doubles", label: "Doubles only" },
          { value: "trebles", label: "Trebles only" },
        ]),
        o.hits === "any"
          ? switchRow({
              label: "Doubles and trebles jump",
              hint: "D1 moves you on two, T1 three. A jump never skips the bull.",
              checked: Boolean(o.jumps),
              onChange: (v) => ((o.jumps = v), changed()),
            })
          : null,
      ],
      bullgame: () => [
        seg("Play to", "goal", [
          { value: "visits", label: "Set visits" },
          { value: "points", label: "A points target" },
        ]),
        o.goal === "visits" ? labelled("Visits each", step("visits", 1, 30, 1, "visits")) : labelled("First to", step("target", 5, 100, 5, "points")),
      ],
      shanghai: () => [seg("Rounds", "rounds", [7, 10, 20].map((v) => ({ value: v, label: `${v} rounds` })))],
    };
    optsBox.append(...parts[a.mode]().filter(Boolean));
  }

  function renderFormat() {
    clear(formatBox);
    if (playerCount() !== 2) a.formatType = "firstTo";
    if (a.formatType === "bestOf" && a.legs % 2 === 0) a.legs += 1;
    if (playerCount() === 2) {
      formatBox.append(
        segmented({
          label: "Match format",
          value: a.formatType,
          options: [
            { value: "firstTo", label: "First to" },
            { value: "bestOf", label: "Best of" },
          ],
          onChange: (v) => {
            a.formatType = v;
            renderFormat();
            changed();
          },
        })
      );
    } else formatBox.append(h("span", { class: "setup__format-label" }, "First to"));
    formatBox.append(
      stepper({
        value: a.legs,
        min: 1,
        max: a.formatType === "bestOf" ? 21 : 11,
        step: a.formatType === "bestOf" ? 2 : 1,
        label: "games",
        onChange: (v) => {
          a.legs = v;
          changed();
        },
      })
    );
  }

  const tieSeg = segmented({
    label: "If it's a tie",
    value: a.tie,
    options: TIE_RULES.map((t) => ({ value: t.id, label: t.name })),
    className: "seg--wrap",
    onChange: (v) => {
      a.tie = v;
      tieHint.textContent = TIE_RULES.find((t) => t.id === v).blurb;
      changed();
    },
  });
  tieHint.textContent = TIE_RULES.find((t) => t.id === a.tie)?.blurb ?? "";

  renderTiles();
  renderOpts();
  renderFormat();

  return {
    game: section("Game", tiles, how),
    options: section("Options", optsBox),
    games: section("Games", formatBox),
    ties: section("If it's a tie", tieSeg, tieHint),
    refresh() {
      renderOpts();
      renderFormat();
    },
  };
}

// "Around the Clock: 1 to 20, then 25 or bull. First to 2 games."
export function describeArcade(a) {
  const m = MODES[a.mode];
  const games = a.legs === 1 ? "One game" : `${a.formatType === "bestOf" ? "Best of" : "First to"} ${a.legs} games`;
  return { title: m.name, sub: `${m.describe({ ...m.defaults, ...a.options[a.mode] })}. ${games}. Ties: ${TIE_RULES.find((t) => t.id === a.tie)?.name.toLowerCase()}.` };
}
