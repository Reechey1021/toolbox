// js/main.js
// Impostor: everyone gets the same word, except the impostor(s), who get
// "Impostor". Pass the phone round; each player taps to reveal their own.
// The word and "Impostor" look exactly the same (same colour, same size),
// because the screen lights up your face.

import { h, replaceChildren } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { stepper, toast } from "./ui/components.js";
import { WORDS } from "./words.js";
import { dealRoles, pickWord, maxImpostors } from "./game.js";

const app = document.getElementById("app");
const KEY = "reechImpostor:";
const load = (k, d) => {
  try {
    const v = localStorage.getItem(KEY + k);
    return v === null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(KEY + k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};

let players = load("players", 4);
let impostors = 1; // always 1 to start with; more is just for fun
let giveHint = load("hint", false); // "Impostor gets hint"
let round = null; // { word, roles, turn }
let timer = null;
let armedAt = 0; // taps right after a screen change are ignored (no accidental skips)

// ---------------------------------------------------------------- the menu
function menu(note = null) {
  clearTimeout(timer);
  round = null;
  impostors = Math.min(impostors, maxImpostors(players));
  const impStep = h("div");
  const paintImp = () =>
    replaceChildren(impStep, stepper({ value: impostors, min: 1, max: maxImpostors(players), label: "impostors", format: String, onChange: (v) => (impostors = v) }));
  paintImp();
  replaceChildren(
    app,
    h(
      "main",
      { class: "imenu" },
      h("header", { class: "ihead" }, h("a", { class: "icon-btn", href: "../", "aria-label": "Reech's Toolbox" }, icon("back")), h("h1", { class: "ihead__title" }, "Impostor")),
      note ? h("p", { class: "inote" }, note) : null,
      h(
        "section",
        { class: "icard" },
        h("div", { class: "irow" }, h("span", { class: "ilabel" }, "Number of players"), stepper({ value: players, min: 3, max: 20, label: "players", format: String, onChange: (v) => ((players = v), save("players", v), (impostors = Math.min(impostors, maxImpostors(v))), paintImp()) })),
        h("div", { class: "irow" }, h("span", { class: "ilabel" }, "Impostors"), impStep),
        h(
          "label",
          { class: "icheck" },
          h("input", { type: "checkbox", checked: giveHint, onchange: (e) => ((giveHint = e.target.checked), save("hint", giveHint)) }),
          h("span", { class: "icheck__box", "aria-hidden": "true" }),
          h("span", { class: "icheck__text" }, h("span", { class: "ilabel" }, "Impostor gets hint"), h("span", { class: "icheck__sub" }, "A vague clue under “Impostor”, so they're not caught straight away"))
        )
      ),
      h("button", { class: "btn btn--primary btn--block ibig", type: "button", onclick: start }, "Continue"),
      h(
        "details",
        { class: "ihow" },
        h("summary", null, "How to play"),
        h("p", null, "Everyone sees the same word, except the impostor, who just sees \u201cImpostor\u201d. Take turns saying one word or phrase that describes it, without giving it away. The impostor has to bluff. Then vote on who you think the impostor is.")
      ),
      h("p", { class: "icount muted" }, `${WORDS.length.toLocaleString("en-GB")} words`)
    )
  );
}

// ---------------------------------------------------------------- a round
function start() {
  const recent = load("recent", []);
  const w = pickWord(WORDS, recent);
  save("recent", [w.word, ...recent].slice(0, 200));
  round = { word: w.word, hint: w.hint, roles: dealRoles(players, impostors), turn: 0, giveHint };
  countdown(); // the first player goes straight to the countdown
}

// A full-screen, tap-anywhere screen. Same background for every step.
function screen(...children) {
  const el = h("main", { class: "iscreen", role: "button", tabindex: 0 }, ...children);
  replaceChildren(app, el);
  el.focus();
  armedAt = Date.now() + 450;
  return el;
}
const onTap = (el, fn) => {
  const go = () => Date.now() >= armedAt && fn();
  el.addEventListener("click", go);
  el.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
};
const who = () => h("p", { class: "iwho" }, `Player ${round.turn + 1} of ${players}`);

function countdown(n = 3) {
  if (n === 0) return reveal();
  screen(who(), h("p", { class: "ibig-number num" }, n));
  armedAt = Infinity; // no tapping through the countdown
  timer = setTimeout(() => countdown(n - 1), 1000);
}

function reveal() {
  const impostor = round.roles[round.turn];
  // Word and "Impostor" in exactly the same style. With hints on, everyone gets a
  // line underneath, the same size and colour, so the screens still look alike.
  const extra = round.giveHint ? h("p", { class: "iclue" }, impostor ? `Hint: ${round.hint}` : "Don't say the word") : null;
  const el = screen(who(), h("p", { class: "iword" }, impostor ? "Impostor" : round.word), extra, h("p", { class: "ihint" }, round.turn + 1 < players ? "Tap and pass to the next person" : "Tap when you're done"));
  onTap(el, next);
}

function next() {
  round.turn++;
  if (round.turn >= players) return menu("Everyone's seen their word. Start describing!");
  const el = screen(who(), h("p", { class: "iprompt" }, "Tap to reveal your word"), h("p", { class: "ihint" }, "Make sure nobody else can see"));
  onTap(el, () => countdown());
}

menu();
