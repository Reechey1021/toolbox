// screens/parts/rules.js
// How to play each game, in plain words for someone who's never played it,
// and the match info sheet behind the ⓘ button in a match.

import { h } from "../../ui/dom.js";
import { openSheet } from "../../ui/components.js";
import { MODES, TIE_RULES } from "../../engine/arcade/modes.js";
import { describeFormat, describeRules } from "../../engine/match.js";

export const RULES = {
  x01: {
    name: "X01 (501, 301…)",
    text: [
      "Everyone starts on the same score and takes turns throwing three darts. Whatever you score in a visit comes off your total.",
      "To win a leg you need to hit exactly zero. With double out, the dart that gets you there has to be a double (the bull counts as a double).",
      "Score too much, finish on something that isn't a double, or leave yourself on 1, and it's a bust: your score goes back to what it was before that visit.",
      "With double in, nothing counts until you hit a double. Win the set number of legs to win the match.",
    ],
  },
  highscore: {
    text: [
      "Everyone gets the same number of visits, three darts each. Every point counts: aim for the treble 20 and pile them up.",
      "When the last visit's done, the highest total wins.",
    ],
  },
  race: {
    text: [
      "Score as much as you can each visit. First to reach the target wins.",
      "It's always fair: everyone gets the same number of visits. If more than one of you gets there in the same round, it's a tie, settled by the tie rule.",
    ],
  },
  clock: {
    text: [
      "Hit the numbers in order, one at a time: 1, then 2, then 3 and so on up to 20 (or 20 down to 1). Only the number you're on counts; hit it and you move to the next.",
      "After the last number, finish on the bull if the game uses it. First round the whole board wins, and everyone finishes the round.",
      "Doubles only or trebles only means only those count as a hit. With jumps on, a double moves you on two numbers and a treble three.",
    ],
  },
  bullgame: {
    text: [
      "Only the bull counts. The outer bull (25) scores 1 point and the bullseye scores 3. Everything else is a miss.",
      "Either play a set number of visits and the highest score wins, or race to a points target.",
    ],
  },
  shanghai: {
    text: [
      "Each round has its own number: round 1 is the 1s, round 2 the 2s, and so on. Only darts on that number score: a single is worth the number, a double twice that, a treble three times.",
      "Hit a single, a double and a treble of the number in one visit and that's a Shanghai: you win outright. Otherwise the highest total after the last round wins.",
    ],
  },
};

function ruleParas(id) {
  return RULES[id].text.map((t) => h("p", { class: "rules__p" }, t));
}

// "How to play" for one game.
export function openHowToPlay(id) {
  const name = MODES[id]?.name ?? RULES[id].name;
  const ties = MODES[id]
    ? h(
        "div",
        { class: "rules__ties" },
        h("h3", { class: "rules__h" }, "If it's a tie"),
        h("ul", { class: "rules__list" }, TIE_RULES.map((t) => h("li", null, h("strong", null, `${t.name}: `), t.blurb)))
      )
    : null;
  return openSheet({ title: `How to play ${name}`, className: "sheet--rules", body: [...ruleParas(id), ties] }).closed;
}

// The ⓘ sheet in a match: the settings, then how to play.
export function openMatchInfo(cfg, { anyoneScores = null } = {}) {
  const arcade = Boolean(MODES[cfg.kind]);
  const row = (label, value) => h("div", { class: "row" }, h("span", { class: "row__text" }, h("span", { class: "row__label" }, value), h("span", { class: "row__hint" }, label)));
  const m = MODES[cfg.kind];
  const games = cfg.format.legs === 1 ? "One game" : `${cfg.format.type === "bestOf" ? "Best of" : "First to"} ${cfg.format.legs} ${arcade ? "games" : "legs"}`;
  const rows = arcade
    ? [row("Game", m.name), row("Options", m.describe(cfg.options)), row("Format", games), row("If it's a tie", TIE_RULES.find((t) => t.id === cfg.tie)?.name ?? "")]
    : [row("Game", `${cfg.startScore}, ${describeRules(cfg)}`), row("Format", describeFormat(cfg)), ...(cfg.trackDoubles === false ? [] : [row("Checkout doubles", "Tracked")])];
  rows.push(row("Players", cfg.players.map((p) => p.name).join(", ")));
  if (anyoneScores !== null) rows.push(row("Scoring", anyoneScores ? "Anyone can enter scores" : "Everyone scores their own"));

  const id = arcade ? cfg.kind : "x01";
  return openSheet({
    title: "Match info",
    className: "sheet--rules",
    body: [
      h("div", { class: "rows" }, rows),
      h("h3", { class: "rules__h" }, `How to play ${m?.name ?? "X01"}`),
      ...ruleParas(id),
      arcade ? h("p", { class: "rules__p faint" }, TIE_RULES.find((t) => t.id === cfg.tie)?.blurb ?? "") : null,
    ],
  }).closed;
}
