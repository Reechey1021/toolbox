// screens/summary.js
// End of match, or a match opened from history. Same screen, same numbers,
// because both are replayed from the stored visits.

import { h, fmt } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { topBar, confirm, toast } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { replay, createMatch, describeFormat, describeRules, describeHandicap, hasHandicaps, sideName, isTeamMatch, nextFirstPlayer } from "../engine/match.js";
import { matchStats, legSummaries } from "../engine/stats.js";
import { statsTabs } from "../ui/statsTable.js";
import { getActive, discardActive, undo, startMatch, isOnline, onlineCode } from "../services/session.js";
import { isArcade } from "../engine/arcade/core.js";
import { arcadeSummaryScreen } from "./arcadeSummary.js";
import { onlineState, rematch as onlineRematch, leaveLobby, canUndoNow } from "../services/online.js";
import { matches } from "../services/storage.js";
import { getOwner } from "../services/profile.js";

export async function summaryScreen(params = {}) {
  const fromHistory = Boolean(params.id);
  let record;
  if (fromHistory) {
    record = await matches.get(params.id);
    if (!record) {
      toast("That match couldn't be found", { tone: "bad" });
      navigate("/history", { replace: true });
      return { el: h("div") };
    }
  } else {
    const active = getActive();
    if (!active) {
      navigate("/", { replace: true });
      return { el: h("div") };
    }
    record = { id: active.cfg.id, cfg: active.cfg, events: active.events, finishedAt: Date.now() };
  }

  const cfg = record.cfg;
  if (isArcade(cfg)) return arcadeSummaryScreen({ record, fromHistory });
  const state = replay(cfg, record.events);
  const stats = matchStats(state);
  const legs = legSummaries(state);
  const solo = state.sides.length === 1;
  const teams = isTeamMatch(cfg);
  const ownerId = getOwner()?.id;

  // ---------------------------------------------------------------- hero
  const winner = state.winner;
  const hero = h(
    "section",
    { class: "result" },
    h("p", { class: "result__kicker" }, fromHistory ? `${fmt.date(record.finishedAt)}, ${fmt.time(record.finishedAt)}` : solo ? "Practice complete" : "Game shot and the match"),
    h(
      "h2",
      { class: "result__title" },
      solo
        ? `${legs.length} ${legs.length === 1 ? "leg" : "legs"} done`
        : winner === null
          ? "Unfinished"
          : `${sideName(cfg, winner)} ${state.sides[winner].players.length > 1 ? "win" : "wins"}`
    ),
    solo
      ? h("p", { class: "result__line num" }, `${fmt.avg(stats[0].avg)} average`)
      : state.sides.length === 2
        ? h("p", { class: "result__line num" }, state.legsWon.join("–"))
        : winner !== null
          ? h("p", { class: "result__line num" }, `${state.legsWon[winner]} ${state.legsWon[winner] === 1 ? "leg" : "legs"}`)
          : null,
    h("p", { class: "result__meta" }, `${cfg.startScore} ${describeRules(cfg)}, ${describeFormat(cfg).toLowerCase()}${hasHandicaps(cfg) ? ", with handicaps" : ""}`)
  );

  // ---------------------------------------------------------------- table
  const table = statsTabs(state, { ownerId });

  const handicapNotes = hasHandicaps(cfg)
    ? h(
        "ul",
        { class: "hcp-notes" },
        state.sides
          .map((sd, i) => ({ sd, i }))
          .filter(({ sd }) => sd.handicap)
          .map(({ sd, i }) => h("li", null, h("strong", null, sideName(cfg, i)), ` ${describeHandicap(sd.handicap, cfg)}`))
      )
    : null;

  // ---------------------------------------------------------------- legs
  const legList = h(
    "ol",
    { class: "legs" },
    legs.map((l) =>
      h(
        "li",
        { class: "legs__row" },
        h("span", { class: "legs__n num" }, `Leg ${l.index + 1}`),
        h("span", { class: "legs__who" }, solo ? "" : teams ? `${sideName(cfg, l.winner)}, ${cfg.players[l.finisher].name} out` : sideName(cfg, l.winner)),
        h("span", { class: "legs__fact num" }, `${l.checkout} out`),
        h("span", { class: "legs__fact num" }, `${l.winnerDarts} darts`)
      )
    )
  );

  // ---------------------------------------------------------------- actions
  function rematch() {
    const next = createMatch({
      players: cfg.players,
      startScore: cfg.startScore,
      checkIn: cfg.checkIn,
      checkOut: cfg.checkOut,
      format: cfg.format,
      firstPlayer: nextFirstPlayer(cfg),
      teams: cfg.teams?.map((t) => t.players) ?? null,
      teamHandicaps: cfg.teams?.map((t) => t.handicap ?? null) ?? null,
      trackDoubles: cfg.trackDoubles,
    });
    if (!fromHistory) discardActive();
    startMatch(next);
    navigate("/game");
  }

  const onlineMatch = !fromHistory && isOnline();
  const lobbyCode = onlineMatch ? onlineCode() : null;
  const actions = onlineMatch
    ? h(
        "div",
        { class: "summary__actions" },
        onlineState().isHost
          ? h("button", { class: "btn btn--primary", type: "button", onclick: () => onlineRematch() }, h("span", { class: "btn__label" }, "Rematch"), h("span", { class: "btn__sub" }, "Everyone goes back to the lobby"))
          : h("a", { class: "btn btn--primary", href: `#/lobby/${lobbyCode}` }, h("span", { class: "btn__label" }, "Back to the lobby"), h("span", { class: "btn__sub" }, "Wait there for the host's rematch")),
        h(
          "button",
          {
            class: "btn btn--quiet",
            type: "button",
            onclick: async () => {
              await leaveLobby();
              navigate("/", { replace: true });
            },
          },
          "Leave"
        ),
        canUndoNow()
          ? h(
              "button",
              {
                class: "btn btn--ghost",
                type: "button",
                onclick: async () => {
                  await undo();
                  navigate("/game", { replace: true });
                },
              },
              "Undo the winning visit"
            )
          : null
      )
    : fromHistory
    ? h(
        "div",
        { class: "summary__actions" },
        h("button", { class: "btn btn--primary", type: "button", onclick: rematch }, icon("repeat"), h("span", { class: "btn__label" }, "Play again")),
        h(
          "button",
          {
            class: "btn btn--danger",
            type: "button",
            onclick: async () => {
              const ok = await confirm({ title: "Delete this match?", lead: "It'll be removed from your history and stats.", confirmLabel: "Delete match", tone: "danger" });
              if (!ok) return;
              await matches.remove(record.id);
              toast("Match deleted");
              navigate("/history", { replace: true });
            },
          },
          "Delete match"
        )
      )
    : h(
        "div",
        { class: "summary__actions" },
        h("button", { class: "btn btn--primary", type: "button", onclick: rematch }, h("span", { class: "btn__label" }, "Rematch"), solo ? null : h("span", { class: "btn__sub" }, `${cfg.players[nextFirstPlayer(cfg)].name} throws first`)),
        h(
          "button",
          {
            class: "btn btn--quiet",
            type: "button",
            onclick: () => {
              discardActive();
              navigate("/", { replace: true });
            },
          },
          "Done"
        ),
        h(
          "button",
          {
            class: "btn btn--ghost",
            type: "button",
            onclick: async () => {
              await undo();
              navigate("/game", { replace: true });
            },
          },
          "Undo the winning visit"
        )
      );

  const el = h(
    "main",
    { class: "page page--wide summary" },
    topBar({ title: fromHistory ? "Match" : "Match summary", back: fromHistory ? "#/history" : null }),
    h(
      "div",
      { class: "summary__grid" },
      h("div", { class: "summary__main" }, hero, actions),
      h(
        "div",
        { class: "summary__side" },
        h("section", { class: "section section--first" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Stats")), table, handicapNotes),
        legs.length ? h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Legs")), legList) : null
      )
    )
  );

  return { el, title: "Match summary" };
}
