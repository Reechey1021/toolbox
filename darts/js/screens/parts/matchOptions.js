// screens/parts/matchOptions.js
// The Game, Legs and Rules sections, shared by the local setup and the Nemesis
// screen so they can never drift apart.
//
// s: the screen's settings object. Reads and writes
//    startScore, customScore, formatType, legs, checkIn, checkOut
// sideCount(): how many sides are playing (decides "first to" vs "best of")
// onChange(): called after any change, for screens that need to redraw

import { h, clear } from "../../ui/dom.js";
import { segmented, stepper } from "../../ui/components.js";
import { cleanStartScore, START_SCORES, MIN_START, MAX_START } from "../../engine/match.js";

function section(title, ...children) {
  return h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, title)), ...children);
}

export function matchOptions(s, { sideCount, onChange = () => {} }) {
  const isCustom = () => !START_SCORES.includes(s.startScore);
  const customWrap = h("div", { class: "setup__custom" });
  const formatWrap = h("div", { class: "setup__format" });

  function renderCustom() {
    clear(customWrap);
    if (!isCustom()) return;
    const input = h("input", {
      class: "field num",
      type: "number",
      inputmode: "numeric",
      min: MIN_START,
      max: MAX_START,
      value: s.startScore,
      "aria-label": "Custom starting score",
      oninput: (e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v) && v >= MIN_START) {
          s.startScore = cleanStartScore(v);
          s.customScore = s.startScore;
          onChange();
        }
      },
      onblur: (e) => (e.target.value = String(s.startScore)),
    });
    customWrap.append(h("label", { class: "setup__custom-label" }, "Starting score", input));
  }

  function renderFormat() {
    clear(formatWrap);
    const n = sideCount();
    if (n !== 2) s.formatType = "firstTo";
    if (s.formatType === "bestOf" && s.legs % 2 === 0) s.legs += 1;

    const legsStepper = stepper({
      value: s.legs,
      min: 1,
      max: s.formatType === "bestOf" ? 21 : 11,
      step: s.formatType === "bestOf" ? 2 : 1,
      label: "legs",
      onChange: (v) => (s.legs = v),
    });

    if (n === 2) {
      formatWrap.append(
        segmented({
          label: "Match format",
          value: s.formatType,
          options: [
            { value: "firstTo", label: "First to" },
            { value: "bestOf", label: "Best of" },
          ],
          onChange: (v) => {
            s.formatType = v;
            renderFormat();
          },
        })
      );
    } else {
      formatWrap.append(h("span", { class: "setup__format-label" }, n === 1 ? "Legs to play" : "First to"));
    }
    formatWrap.append(legsStepper);
  }

  const game = section(
    "Game",
    segmented({
      label: "Starting score",
      value: isCustom() ? "custom" : s.startScore,
      options: [...START_SCORES.map((v) => ({ value: v, label: String(v) })), { value: "custom", label: "Custom" }],
      onChange: (v) => {
        s.startScore = v === "custom" ? cleanStartScore(s.customScore || 1001) : v;
        renderCustom();
        onChange();
        if (v === "custom") customWrap.querySelector("input")?.select();
      },
    }),
    customWrap
  );

  const legs = section("Legs", formatWrap);

  const rules = section(
    "Rules",
    h(
      "div",
      { class: "setup__rules" },
      segmented({
        label: "Start",
        value: s.checkIn,
        options: [
          { value: "straight", label: "Straight in" },
          { value: "double", label: "Double in" },
        ],
        onChange: (v) => {
          s.checkIn = v;
          onChange();
        },
      }),
      segmented({
        label: "Finish",
        value: s.checkOut,
        options: [
          { value: "double", label: "Double out" },
          { value: "straight", label: "Straight out" },
        ],
        onChange: (v) => {
          s.checkOut = v;
          onChange();
        },
      })
    )
  );

  function refresh() {
    renderCustom();
    renderFormat();
  }
  refresh();

  return { game, legs, rules, refresh };
}
