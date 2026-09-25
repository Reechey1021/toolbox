// screens/bull.js
// Throw for the bull. Each player taps where their dart landed; closest to the
// middle throws first. Two in the bull, or too close to call, means the tied
// players throw again.

import { h, replaceChildren } from "../ui/dom.js";
import { topBar } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { resolveBull, cleanThrow, distanceMm, ringOf } from "../engine/bull.js";
import { getActive, setBullResult } from "../services/session.js";
import { bullThrowers, isTeamMatch, sideName } from "../engine/match.js";
import { isBot, nemesisBullThrow } from "../engine/nemesis/index.js";
import { tap as haptic } from "../services/device.js";
import { PLAYER_COLOURS, svg, markerEl, toBoard, makeBoard } from "./parts/bullBoard.js";
import { isOnline } from "../services/session.js";
import { onlineBullScreen } from "./bullOnline.js";

export function bullScreen() {
  if (isOnline()) return onlineBullScreen(); // each player throws on their own phone
  const active = getActive();
  const cfg = active.cfg;
  // One thrower per side: every player in a normal game, the first of each team in pairs.
  const throwerIndex = bullThrowers(cfg);
  const players = throwerIndex.map((p) => cfg.players[p]);
  const teams = isTeamMatch(cfg);

  // Who's throwing in this round (everyone first, then only the tied players).
  let round = players.map((_, i) => i);
  let throws = {}; // player index -> { x, y }
  let turn = 0; // index into round
  let pending = null;
  let result = null;
  let attempt = 0; // rethrows give Nemesis a fresh dart
  let botTimer = null;

  const prompt = h("p", { class: "bull__prompt", "aria-live": "polite" });
  const legend = h("ol", { class: "bull__legend" });
  const actions = h("div", { class: "bull__actions" });

  const markers = svg("g", { class: "markers" });
  const board = makeBoard(markers);

  function current() {
    return round[turn];
  }

  const toBoardPos = (e) => toBoard(board, e);

  const botUp = () => !result && isBot(players[current()]);

  board.addEventListener("click", (e) => {
    if (result || botUp()) return;
    pending = toBoardPos(e);
    haptic();
    render();
  });

  board.addEventListener("keydown", (e) => {
    if (result) return;
    const step = e.shiftKey ? 5 : 1;
    const moves = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    if (moves[e.key]) {
      e.preventDefault();
      pending = pending || { x: 0, y: -20 };
      pending = { x: pending.x + moves[e.key][0], y: pending.y + moves[e.key][1] };
      render();
    } else if (e.key === "Enter" && pending) {
      e.preventDefault();
      confirmDart();
    }
  });

  function confirmDart() {
    if (!pending) return;
    throws[current()] = cleanThrow(pending);
    pending = null;
    turn++;
    if (turn >= round.length) {
      const r = resolveBull(round.map((p) => throws[p]));
      result = { ...r, winner: r.winner === null ? null : round[r.winner], tied: r.tied.map((k) => round[k]) };
    }
    render();
  }

  // Nemesis throws its own dart: a moment's pause, then it lands.
  // Guarded so the redraw after its dart lands can't restart the throw.
  let botThrowing = false;
  function maybeBotThrow() {
    if (!botUp() || botThrowing) return;
    botThrowing = true;
    botTimer = setTimeout(() => {
      if (!botUp()) return (botThrowing = false);
      pending = nemesisBullThrow(cfg, throwerIndex[current()], attempt);
      render();
      botTimer = setTimeout(() => {
        botThrowing = false;
        confirmDart();
      }, 700);
    }, 900);
  }

  function rethrow() {
    attempt++;
    clearTimeout(botTimer);
    botThrowing = false;
    const tiedPlayers = result?.tied?.length ? result.tied : round;
    round = tiedPlayers;
    for (const p of round) delete throws[p];
    turn = 0;
    pending = null;
    result = null;
    render();
    board.focus({ preventScroll: true });
  }

  function start() {
    setBullResult({
      throws: round.map((k) => ({ p: throwerIndex[k], ...throws[k] })),
      winner: throwerIndex[result.winner],
    });
    navigate("/game", { replace: true });
  }

  // Labels alternate sides by player so two darts close together stay readable.
  function describe(p) {
    const t = throws[p];
    if (!t) return round.includes(p) ? (p === current() && !result ? "Throwing" : "Waiting") : "Out";
    const ring = ringOf(t);
    const mm = `${distanceMm(t).toFixed(1)} mm`;
    return ring === "bull" ? `In the bull, ${mm}` : ring === "outer bull" ? `Outer bull, ${mm}` : mm;
  }

  function render() {
    queueMicrotask(maybeBotThrow);
    // Markers: every confirmed dart, plus the one being placed.
    const nodes = [];
    for (const [p, t] of Object.entries(throws)) nodes.push(markerEl(t, PLAYER_COLOURS[p], players[p].name, false, Number(p)));
    if (pending) nodes.push(markerEl(pending, PLAYER_COLOURS[current()], players[current()].name, true, current()));
    markers.replaceChildren(...nodes);

    replaceChildren(
      legend,
      players.map((p, i) =>
        h(
          "li",
          { class: ["bull__row", result?.winner === i && "is-winner", !result && i === current() && "is-up"] },
          h("span", { class: "bull__swatch", style: { background: PLAYER_COLOURS[i] }, "aria-hidden": "true" }),
          h("span", { class: "bull__name" }, p.name, teams ? h("span", { class: "bull__team" }, ` for ${sideName(cfg, i)}`) : null),
          h("span", { class: "bull__dist num" }, describe(i))
        )
      )
    );

    if (result && result.winner !== null) {
      prompt.textContent = teams ? `${sideName(cfg, result.winner)} throw first` : `${players[result.winner].name} throws first`;
      replaceChildren(
        actions,
        h("button", { class: "btn btn--primary btn--block", type: "button", onclick: start, "data-autofocus": "" }, "Start match"),
        h("button", { class: "btn btn--ghost btn--block", type: "button", onclick: rethrow }, "Throw again")
      );
    } else if (result) {
      const names = result.tied.map((p) => players[p].name);
      prompt.textContent = result.tied.every((p) => ringOf(throws[p]) === "bull") ? "Both in the bull. Throw again." : "Too close to call. Throw again.";
      replaceChildren(
        actions,
        h(
          "button",
          { class: "btn btn--primary btn--block", type: "button", onclick: rethrow },
          h("span", { class: "btn__label" }, "Throw again"),
          names.length < players.length ? h("span", { class: "btn__sub" }, `${names.join(" and ")} only`) : null
        )
      );
    } else {
      const who = players[current()].name;
      if (botUp()) {
        prompt.textContent = pending ? `${who}'s dart is in` : `${who} is throwing`;
        replaceChildren(actions);
      } else {
        prompt.textContent = pending ? `${who}, move it or confirm` : `${who}, tap where your dart landed`;
        replaceChildren(
          actions,
          h("button", { class: "btn btn--primary btn--block", type: "button", disabled: !pending, onclick: confirmDart }, `Confirm ${who}'s dart`)
        );
      }
    }
  }

  render();

  const el = h(
    "main",
    { class: "page bull" },
    topBar({ title: "Throw for the bull", sub: "Closest to the middle throws first", back: "#/" }),
    prompt,
    h("div", { class: "bull__stage" }, h("div", { class: "bull__boardwrap" }, board), h("div", { class: "bull__side" }, legend, actions))
  );

  return { el, title: "Throw for the bull", destroy: () => clearTimeout(botTimer) };
}
