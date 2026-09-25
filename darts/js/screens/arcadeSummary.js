// screens/arcadeSummary.js
// After an arcade game: who won (or a draw), how each game went, and the numbers.

import { h, fmt } from "../ui/dom.js";
import { topBar, choose, confirm, toast } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { getOwner } from "../services/profile.js";
import { matches } from "../services/storage.js";
import { discardActive, startMatch, isOnline, onlineCode } from "../services/session.js";
import { onlineState, rematch as onlineRematch, changeGame, leaveLobby } from "../services/online.js";
import { replayArcade, createArcade } from "../engine/arcade/core.js";
import { MODE_LIST, TIE_RULES } from "../engine/arcade/modes.js";

const HOW = { sudden: "in sudden death", bull: "on the bull", starter: "starter wins the tie", draw: "a draw" };

export function arcadeSummaryScreen({ record, fromHistory }) {
  const cfg = record.cfg;
  const state = replayArcade(cfg, record.events);
  const mode = state.mode;
  const names = cfg.players.map((p) => p.name);
  const owner = getOwner();
  const me = cfg.players.findIndex((p) => p.id === owner?.id);
  const winner = state.winner;
  const online = !fromHistory && isOnline();

  const headline = winner === null ? "It's a draw" : `${names[winner]} wins`;
  const score = cfg.players.length > 1 ? state.gamesWon.join("–") : null;

  const games = state.games.filter((g) => g.phase === "over");
  const gameRows =
    games.length > 1 || games[0]?.decidedBy !== "play"
      ? h(
          "div",
          { class: "rows" },
          games.map((g) =>
            h("div", { class: "row" }, h("span", { class: "row__text" }, h("span", { class: "row__label" }, `Game ${g.index + 1}: ${g.result === "draw" ? "Draw" : names[g.result]}`), g.decidedBy !== "play" ? h("span", { class: "row__hint" }, HOW[g.decidedBy]) : null))
          )
        )
      : null;

  // The numbers from the last game, side by side.
  const last = games[games.length - 1] ?? state.game;
  const stats = cfg.players.map((_, p) => mode.stats(last.ps[p]));
  const table = h(
    "div",
    { class: "cmp-wrap" },
    h(
      "table",
      { class: "cmp" },
      h("thead", null, h("tr", null, h("th", null, h("span", { class: "visually-hidden" }, "Stat")), names.map((n, p) => h("th", { scope: "col", class: [p === winner && "is-winner"] }, n)))),
      h("tbody", null, stats[0].map(([label], r) => h("tr", null, h("th", { scope: "row" }, label), stats.map((s) => h("td", { class: "num" }, String(s[r][1]))))))
    )
  );

  async function pickGame() {
    return choose({ title: "Change game", options: MODE_LIST.map((m) => ({ label: m.name, value: m.id, sub: m.blurb })) });
  }

  const actions = fromHistory
    ? h(
        "div",
        { class: "summary__actions" },
        h(
          "button",
          {
            class: "btn btn--ghost",
            type: "button",
            onclick: async () => {
              if (!(await confirm({ title: "Delete this game?", confirmLabel: "Delete", tone: "danger" }))) return;
              await matches.remove(record.id);
              toast("Game deleted");
              navigate("/history", { replace: true });
            },
          },
          "Delete game"
        )
      )
    : online
      ? h(
          "div",
          { class: "summary__actions" },
          onlineState().isHost
            ? [
                h("button", { class: "btn btn--primary", type: "button", onclick: () => onlineRematch() }, h("span", { class: "btn__label" }, "Rematch"), h("span", { class: "btn__sub" }, "Everyone goes back to the lobby")),
                h("button", { class: "btn btn--quiet", type: "button", onclick: async () => { const m = await pickGame(); if (m) changeGame(m); } }, "Change game"),
              ]
            : h("a", { class: "btn btn--primary", href: `#/lobby/${onlineCode()}` }, h("span", { class: "btn__label" }, "Back to the lobby"), h("span", { class: "btn__sub" }, "Wait there for the host")),
          h("button", { class: "btn btn--ghost", type: "button", onclick: async () => (await leaveLobby(), navigate("/", { replace: true })) }, "Leave")
        )
      : h(
          "div",
          { class: "summary__actions" },
          h(
            "button",
            {
              class: "btn btn--primary",
              type: "button",
              onclick: () => {
                const next = createArcade({ kind: cfg.kind, players: cfg.players, options: cfg.options, format: cfg.format, tie: cfg.tie, firstPlayer: ((cfg.firstPlayer ?? 0) + 1) % cfg.players.length });
                startMatch(next);
                navigate("/game", { replace: true });
              },
            },
            h("span", { class: "btn__label" }, "Rematch"),
            cfg.players.length > 1 ? h("span", { class: "btn__sub" }, `${names[((cfg.firstPlayer ?? 0) + 1) % names.length]} throws first`) : null
          ),
          h(
            "button",
            {
              class: "btn btn--quiet",
              type: "button",
              onclick: async () => {
                const m = await pickGame();
                if (!m) return;
                discardActive();
                navigate(`/arcade/${m}`, { replace: true });
              },
            },
            "Change game"
          ),
          h("button", { class: "btn btn--ghost", type: "button", onclick: () => (discardActive(), navigate("/", { replace: true })) }, "Done")
        );

  const tie = TIE_RULES.find((t) => t.id === cfg.tie)?.name.toLowerCase();
  const el = h(
    "main",
    { class: "page summary" },
    topBar({ title: fromHistory ? mode.name : "Game over", sub: fromHistory ? fmt.date(record.finishedAt) : null, back: fromHistory ? "#/history" : null }),
    h(
      "section",
      { class: "result" },
      h("p", { class: "result__eyebrow" }, winner !== null && winner === me ? "Get in" : mode.name),
      h("h2", { class: "result__title" }, headline),
      score ? h("p", { class: "result__line num" }, score) : null,
      h("p", { class: "result__meta" }, `${mode.describe(cfg.options)}. Ties: ${tie}.`)
    ),
    actions,
    gameRows ? h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Games")), gameRows) : null,
    h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, games.length > 1 ? "Last game" : "Numbers")), table)
  );
  return { el, title: fromHistory ? mode.name : "Game over" };
}
