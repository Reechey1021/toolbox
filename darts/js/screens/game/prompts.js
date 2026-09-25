// screens/game/prompts.js
// The questions the keypad sometimes needs answered, and the leg-won moment.
// Each prompt only appears when the answer can't be worked out automatically.

import { h } from "../../ui/dom.js";
import { openSheet, choose } from "../../ui/components.js";
import { doubleDartRange } from "../../engine/rules.js";
import { statsTable } from "../../ui/statsTable.js";
import { sideName } from "../../engine/match.js";

function range(lo, hi) {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

// Resolves { dartsUsed, doubleDarts } or null if cancelled.
export function askCheckout({ start, outcome, checkOut, trackDoubles }) {
  const minDarts = outcome.minDarts;
  const doublesFor = (dartsUsed) => {
    if (!trackDoubles) return null;
    return doubleDartRange({ start, scored: start, checkOut, dartsUsed, finished: true });
  };

  // Nothing to ask? Resolve straight away.
  const fixedDarts = minDarts === 3 ? 3 : null;
  if (fixedDarts) {
    const r = doublesFor(3);
    if (!r || r.min === r.max) return Promise.resolve({ dartsUsed: 3, doubleDarts: r ? r.min : null });
  }

  return new Promise((resolve) => {
    let chosenDarts = fixedDarts;
    let sheet;

    const dartsRow = h(
      "div",
      { class: "question" },
      h("span", { class: "question__label" }, "Darts used"),
      h(
        "div",
        { class: "choices choices--grid", style: { "--cols": "3" } },
        [1, 2, 3].map((n) =>
          h(
            "button",
            {
              type: "button",
              class: "btn btn--quiet btn--tile",
              disabled: n < minDarts,
              "aria-pressed": "false",
              "data-autofocus": n === minDarts ? "" : null,
              onclick: (e) => pickDarts(n, e.currentTarget),
            },
            n
          )
        )
      )
    );

    const doublesRow = h("div", { class: "question", hidden: true });

    function pickDarts(n, btn) {
      chosenDarts = n;
      dartsRow.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      const r = doublesFor(n);
      if (!r || r.min === r.max) {
        sheet.close({ dartsUsed: n, doubleDarts: r ? r.min : null });
        return;
      }
      showDoubles(r);
    }

    function showDoubles(r) {
      doublesRow.hidden = false;
      doublesRow.replaceChildren(
        h("span", { class: "question__label" }, "Darts at a double"),
        h(
          "div",
          { class: "choices choices--grid", style: { "--cols": String(r.max - r.min + 1) } },
          range(r.min, r.max).map((n) =>
            h(
              "button",
              { type: "button", class: "btn btn--quiet btn--tile", onclick: () => sheet.close({ dartsUsed: chosenDarts, doubleDarts: n }) },
              n
            )
          )
        )
      );
      doublesRow.querySelector("button")?.focus({ preventScroll: true });
    }

    sheet = openSheet({
      title: `${start} checkout`,
      body: [fixedDarts ? null : dartsRow, doublesRow],
    });
    if (fixedDarts) showDoubles(doublesFor(3));
    sheet.closed.then((v) => resolve(v ?? null));
  });
}

// Resolves a number, or undefined if cancelled.
export function askDoubleDarts({ min, max, start }) {
  return choose({
    title: "Darts at a double?",
    lead: `You started this visit on ${start}.`,
    layout: "grid",
    options: range(min, max).map((n) => ({ label: String(n), value: n, autofocus: n === min })),
  });
}

// Double in: which dart hit the double? Resolves 1, 2 or 3, or undefined if cancelled.
export function askCheckInDart({ options, name }) {
  const words = { 1: "First", 2: "Second", 3: "Third" };
  return choose({
    title: "Which dart hit the double?",
    lead: `${name} is in. This counts towards check-in success.`,
    layout: "grid",
    options: options.map((k) => ({ label: words[k], value: k, autofocus: k === options[0] })),
  });
}

// Resolves "next" or "undo".
export function showLegWon({ state, legIndex, ownerId = null, undoLabel = "Undo checkout" }) {
  const cfg = state.cfg;
  const leg = state.legs[legIndex];
  const w = leg.winner;
  const next = state.legs[state.legs.length - 1];
  const solo = state.sides.length === 1;
  const winnerName = sideName(cfg, w);
  const plural = state.sides[w].players.length > 1;

  const tally = solo
    ? null
    : h(
        "div",
        { class: "legwon__tally" },
        state.sides.map((_, i) =>
          h("span", { class: ["legwon__side", i === w && "is-winner"] }, h("span", { class: "legwon__legs num" }, state.legsWon[i]), h("span", { class: "legwon__who" }, sideName(cfg, i)))
        )
      );

  const sheet = openSheet({
    title: solo ? `Leg ${legIndex + 1} done` : `${winnerName} ${plural ? "take" : "takes"} leg ${legIndex + 1}`,
    className: "legwon",
    body: [tally, statsTable(state, legIndex, { ownerId, compact: true })],
    actions: [
      h(
        "button",
        { class: "btn btn--primary btn--block", type: "button", "data-autofocus": "", onclick: () => sheet.close("next") },
        h("span", { class: "btn__label" }, `Start leg ${next.index + 1}`),
        solo ? null : h("span", { class: "btn__sub" }, `${cfg.players[next.starterPlayer].name} throws first`)
      ),
      h("button", { class: "btn btn--ghost btn--block", type: "button", onclick: () => sheet.close("undo") }, undoLabel),
    ],
  });
  return sheet.closed.then((v) => v ?? "next");
}
