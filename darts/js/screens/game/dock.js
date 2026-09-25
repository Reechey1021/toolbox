// screens/game/dock.js
// The input tray under the scoreboard. Two modes:
//   keypad    type the visit total, or tap a quick score
//   darts     tap each dart (multiplier, then number)
// The dock only renders and reports taps; the game screen decides what they mean.

import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";

export const QUICK_SCORES = [0, 26, 41, 45, 60, 81, 85, 100, 140, 180];

export function createDock(on) {
  const el = h("section", { class: "dock", "aria-label": "Score entry" });
  let refs = {};

  function entryRow(centre, modeLabel, modeIcon) {
    refs.undo = h("button", { class: "icon-btn entry__side", type: "button", "aria-label": "Undo last visit", onclick: on.undo }, icon("undo"));
    refs.mode = h(
      "button",
      { class: "icon-btn entry__side", type: "button", "aria-label": modeLabel, title: modeLabel, onclick: on.toggleMode },
      icon(modeIcon)
    );
    return h("div", { class: "entry" }, refs.undo, centre, refs.mode);
  }

  function buildKeypad() {
    refs.value = h("span", { class: "entry__value num" });
    refs.hint = h("span", { class: "entry__hint" });
    // The display doubles as the quick checkout button when you're on a finish.
    refs.display = h(
      "button",
      { class: "entry__display", type: "button", disabled: true, "aria-live": "polite", onclick: () => on.quickCheckout() },
      refs.value,
      refs.hint
    );
    const display = refs.display;

    const quick = h(
      "div",
      { class: "quick", role: "group", "aria-label": "Quick scores" },
      QUICK_SCORES.map((v) =>
        h("button", { class: ["quick__btn", v === 0 && "quick__btn--zero"], type: "button", onclick: () => on.quick(v) }, v === 0 ? "No score" : String(v))
      )
    );

    refs.enter = h("button", { class: "key key--enter", type: "button", "aria-label": "Submit score", onclick: on.enter }, icon("check", { size: 28 }));
    const keys = h(
      "div",
      { class: "keys", role: "group", "aria-label": "Keypad" },
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => h("button", { class: "key num", type: "button", onclick: () => on.digit(String(d)) }, d)),
      h("button", { class: "key key--fn", type: "button", "aria-label": "Delete", onclick: on.backspace }, icon("backspace", { size: 26 })),
      h("button", { class: "key num", type: "button", onclick: () => on.digit("0") }, "0"),
      refs.enter
    );

    el.replaceChildren(entryRow(display, "Switch to dart pad", "target"), quick, keys);
  }

  function buildDartPad() {
    refs.slots = [0, 1, 2].map(() => h("span", { class: "slot" }));
    refs.total = h("span", { class: "entry__total num" });
    refs.hint = h("span", { class: "entry__hint" });
    const display = h(
      "div",
      { class: "entry__display entry__display--darts", "aria-live": "polite" },
      h("span", { class: "slots" }, refs.slots, refs.total),
      refs.hint
    );

    refs.double = h("button", { class: "mult", type: "button", "aria-pressed": "false", onclick: () => on.mult(2) }, "Double");
    refs.treble = h("button", { class: "mult", type: "button", "aria-pressed": "false", onclick: () => on.mult(3) }, "Treble");
    const mults = h(
      "div",
      { class: "mults", role: "group", "aria-label": "Multiplier and specials" },
      refs.double,
      refs.treble,
      h("button", { class: "mult mult--special", type: "button", onclick: () => on.bull(false) }, "25"),
      h("button", { class: "mult mult--special", type: "button", onclick: () => on.bull(true) }, "Bull"),
      h("button", { class: "mult mult--special", type: "button", onclick: on.miss }, "Miss"),
      h("button", { class: "mult mult--fn", type: "button", "aria-label": "Remove last dart", onclick: on.backspace }, icon("backspace", { size: 22 }))
    );

    refs.numbers = Array.from({ length: 20 }, (_, i) =>
      h("button", { class: "key key--pad num", type: "button", onclick: () => on.number(i + 1) }, String(i + 1))
    );
    const pad = h("div", { class: "pad", role: "group", "aria-label": "Numbers" }, refs.numbers);

    el.replaceChildren(entryRow(display, "Switch to keypad", "keypad"), mults, pad);
  }

  function build(mode) {
    refs = {};
    el.dataset.mode = mode;
    if (mode === "darts") buildDartPad();
    else buildKeypad();
    // Keypad, then dart pad, then voice: the button offers the next one.
    const next = { keypad: ["Use the dart pad", "target"], darts: ["Use voice", "mic"], voice: ["Use the keypad", "keypad"] }[mode];
    if (next && refs.mode) {
      refs.mode.setAttribute("aria-label", next[0]);
      refs.mode.title = next[0];
      refs.mode.replaceChildren(icon(next[1]));
    }
  }

  // v: { mode, value, placeholder, hint, tone, canEnter, canUndo, slots, total, mult, complete, locked }
  function update(v) {
    el.classList.toggle("is-locked", Boolean(v.locked));
    if (refs.undo) refs.undo.disabled = !v.canUndo;
    refs.hint.textContent = v.hint || "";
    refs.hint.dataset.tone = v.tone || "";

    if (v.mode === "keypad") {
      const quick = !v.value && v.quickCheckout != null && !v.locked;
      refs.display.disabled = !quick;
      refs.display.classList.toggle("is-checkout", quick);
      refs.display.setAttribute("aria-label", quick ? `Check out ${v.quickCheckout}` : "Score entered");
      if (quick) {
        refs.value.textContent = String(v.quickCheckout);
        refs.value.classList.remove("is-placeholder");
        refs.hint.textContent = "Tap to check out";
        refs.hint.dataset.tone = "ok";
      } else {
        refs.value.textContent = v.value || v.placeholder || "";
        refs.value.classList.toggle("is-placeholder", !v.value);
      }
      refs.enter.disabled = !v.canEnter;
      return;
    }

    refs.slots.forEach((s, i) => {
      const label = v.slots[i];
      s.textContent = label ?? "";
      s.classList.toggle("is-filled", label != null);
      s.classList.toggle("is-next", label == null && i === v.slots.length && !v.complete);
    });
    refs.total.textContent = v.total;
    el.classList.toggle("is-complete", Boolean(v.complete));
    refs.double.setAttribute("aria-pressed", String(v.mult === 2));
    refs.treble.setAttribute("aria-pressed", String(v.mult === 3));
    const prefix = v.mult === 3 ? "T" : v.mult === 2 ? "D" : "";
    refs.numbers.forEach((b, i) => (b.textContent = `${prefix}${i + 1}`));
    el.dataset.mult = String(v.mult);
  }

  return { el, build, update };
}
