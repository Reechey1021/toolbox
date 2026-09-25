// screens/arcadePlay.js
// Playing an arcade game. Three ways in, chosen by the game:
//   keypad       a visit's total (High Score, Race)
//   target pad   a few big keys for the next dart, which change as you go
//                (Around the Clock, Bull game, Shanghai); undo steps back a dart
//   bull board   when a tie is settled by throwing for the bull
// Online, it follows the lobby like X01 does: you play on your turn, you wait
// (with the chat) on everyone else's.

import { h, replaceChildren } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { choose, confirm, toast, openSheet, isSheetOpen } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { getActive, activeState, pushEvent, undo, discardActive, startMatch, isOnline, onActiveChange } from "../services/session.js";
import { canScoreNow, canUndoNow, onlineState, onOnlineChange, stepAway, closeLobby, restartMatch, changeGame } from "../services/online.js";
import * as caller from "../services/caller.js";
import { tap as haptic } from "../services/device.js";
import { parseDart, dartLabel } from "../engine/board.js";
import { MODE_LIST } from "../engine/arcade/modes.js";
import { createArcade, gamesToWin, previewDarts } from "../engine/arcade/core.js";
import { legPips } from "./game/board.js";
import { createChat } from "./parts/chat.js";
import { openMatchInfo } from "./parts/rules.js";
import { PLAYER_COLOURS, svg, markerEl, toBoard, makeBoard } from "./parts/bullBoard.js";

const QUICK = [26, 41, 45, 60, 81, 85, 100, 140, 180];

export function arcadePlayScreen() {
  let state = activeState();
  if (!state) {
    navigate("/", { replace: true });
    return { el: h("div") };
  }
  const cfg = state.cfg;
  const mode = state.mode;
  const online = isOnline();
  const need = gamesToWin(cfg);
  const nameOf = (p) => cfg.players[p].name;

  let buffer = ""; // keypad digits
  let pending = []; // target pad darts this visit (codes)
  let bullPos = null; // tie-break dart being placed
  let busy = false;

  const waiting = () => online && !state.finished && !canScoreNow();

  // ---------------------------------------------------------------- layout
  const title = h("span", { class: "topbar__title" });
  const sub = h("span", { class: "topbar__sub" });
  const chat = online ? createChat() : null;
  const chatBadge = h("span", { class: "chatbtn__badge", hidden: true });
  const bar = h(
    "header",
    { class: "topbar game__bar" },
    h("span", { class: "icon-btn game__nobtn", "aria-hidden": "true" }),
    h("div", { class: "topbar__titles" }, title, sub),
    h(
      "div",
      { class: "topbar__actions" },
      online ? h("button", { class: "icon-btn chatbtn", type: "button", "aria-label": "Chat", onclick: openChat }, icon("chat"), chatBadge) : null,
      h("button", { class: "icon-btn", type: "button", "aria-label": "Match info", onclick: () => openMatchInfo(cfg, { anyoneScores: online ? Boolean(onlineState().lobby?.settings?.anyoneScores) : null }) }, icon("info")),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Match options", onclick: openMenu }, icon("more"))
    )
  );
  const board = h("section", { class: "board", "aria-label": "Scoreboard" });
  const banner = h("p", { class: "arcade__banner", hidden: true, "aria-live": "polite" });
  const dock = h("section", { class: "dock arcade-dock", "aria-label": "Enter your darts" });
  const inputArea = h("div", { class: "arcade-input" });
  dock.append(inputArea);
  if (chat) dock.append(h("div", { class: "gamechat" }, chat.el));
  const el = h("div", { class: "game arcade" }, bar, h("div", { class: "game__main" }, board, banner), dock);

  function openChat() {
    const c = createChat();
    chat?.markRead();
    paintBadge();
    openSheet({ title: "Chat", className: "sheet--chat", body: c.el }).closed.then(() => (c.destroy(), chat?.markRead(), paintBadge()));
  }
  function paintBadge() {
    const n = chat ? Math.max(0, chat.unread()) : 0;
    chatBadge.hidden = n === 0;
    chatBadge.textContent = String(n);
  }

  // ---------------------------------------------------------------- the scoreboard
  function card(p) {
    const g = state.game;
    const active = !state.finished && state.turn?.player === p;
    let ps = g.ps[p];
    if (active && pending.length) ps = previewDarts(state, pending)?.ps ?? ps;
    let c = mode.card(ps, cfg.options);
    // Shanghai: the points update live, but it's still this round's number.
    if (mode.keysFromStart && ps !== g.ps[p]) c = { ...mode.card(g.ps[p], cfg.options), big: c.big };
    const out = !g.active.includes(p) && g.phase !== "play";
    return h(
      "article",
      { class: ["pc", active && "is-active", out && "is-out"], "aria-current": active ? "true" : null },
      h(
        "div",
        { class: "pc__top" },
        h("span", { class: "pc__name" }, active ? h("span", { class: "pc__up", "aria-hidden": "true" }) : null, h("span", { class: "pc__nametext" }, nameOf(p))),
        need > 1 || cfg.players.length > 1 ? legPips(state.gamesWon[p], need) : null
      ),
      h("div", { class: "pc__score num" }, c.big),
      h("div", { class: "pc__route" }, h("span", { class: "pc__note" }, out ? "Out of the tie-break" : c.sub))
    );
  }

  // ---------------------------------------------------------------- input: keypad
  function keypad() {
    const shown = h("div", { class: "entry__display" }, h("span", { class: "entry__value num" }, buffer || "Score"), h("span", { class: "entry__hint" }, `${nameOf(state.turn.player)} to throw`));
    const key = (label, onclick, cls = "") => h("button", { class: ["key", cls], type: "button", onclick }, label);
    return h(
      "div",
      { class: "keypad" },
      h("div", { class: "entry" }, h("button", { class: "icon-btn entry__side", type: "button", "aria-label": "Undo last visit", onclick: doUndo }, icon("undo")), shown),
      h(
        "div",
        { class: "quick" },
        [0, ...QUICK].map((q) => h("button", { class: "quick__btn", type: "button", onclick: () => submitTotal(q) }, q === 0 ? "No score" : String(q)))
      ),
      h(
        "div",
        { class: "keys" },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => key(String(d), () => typeDigit(d), "num")),
        key(icon("backspace"), () => ((buffer = buffer.slice(0, -1)), render()), "key--fn"),
        key("0", () => typeDigit(0), "num"),
        key(icon("check"), () => buffer !== "" && submitTotal(Number(buffer)), "key--enter")
      )
    );
  }
  function typeDigit(d) {
    const next = buffer + d;
    if (Number(next) > 180) return haptic("error");
    buffer = String(Number(next));
    render();
  }

  // ---------------------------------------------------------------- input: target pad
  function targetPad() {
    const pv = pending.length && !mode.keysFromStart ? previewDarts(state, pending) : null;
    const ps = pv?.ps ?? state.game.ps[state.turn.player];
    const keys = mode.keys(ps, cfg.options);
    const slots = [0, 1, 2].map((i) => h("span", { class: ["slot", pending[i] && "is-filled", i === pending.length && "is-next"] }, pending[i] ? dartLabel(parseDart(pending[i])) : ""));
    return h(
      "div",
      { class: "targetpad" },
      h(
        "div",
        { class: "entry" },
        h("button", { class: "icon-btn entry__side", type: "button", "aria-label": pending.length ? "Undo last dart" : "Undo last visit", onclick: doUndo }, icon("undo")),
        h("div", { class: "entry__display" }, h("span", { class: "slots" }, slots), h("span", { class: "entry__hint" }, `${nameOf(state.turn.player)}, dart ${pending.length + 1}`))
      ),
      h(
        "div",
        { class: ["targetpad__keys", `targetpad__keys--${keys.length}`] },
        keys.map((k, i) => h("button", { class: ["key", "targetkey", `targetkey--${k.tone}`], type: "button", "data-key": i + 1, onclick: () => addDart(k.code) }, k.label))
      )
    );
  }
  function addDart(code) {
    if (busy || waiting() || pending.length >= 3) return;
    pending.push(code);
    haptic();
    const pv = previewDarts(state, pending);
    render();
    if (pv?.over) setTimeout(() => pending.length && submitDarts(), 350);
  }

  // ---------------------------------------------------------------- input: tie-break bull
  function bullPad() {
    const g = state.game;
    const p = state.turn.player;
    const markers = svg("g", { class: "markers" });
    const nodes = Object.entries(g.bullThrows).map(([i, t]) => markerEl(t, PLAYER_COLOURS[i], nameOf(Number(i)), false, Number(i)));
    if (bullPos) nodes.push(markerEl(bullPos, PLAYER_COLOURS[p], nameOf(p), true, p));
    markers.replaceChildren(...nodes);
    const b = makeBoard(markers);
    b.addEventListener("click", (e) => {
      if (waiting()) return;
      bullPos = toBoard(b, e);
      haptic();
      render();
    });
    return h(
      "div",
      { class: "arcade-bull" },
      h("p", { class: "arcade-bull__who" }, `${nameOf(p)}, tap where your dart landed`),
      h("div", { class: "bull__boardwrap" }, b),
      h("button", { class: "btn btn--primary btn--block", type: "button", disabled: !bullPos || busy, onclick: () => commit({ p, bt: bullPos, t: Date.now() }) }, `Confirm ${nameOf(p)}'s dart`)
    );
  }

  // ---------------------------------------------------------------- entering
  async function commit(event) {
    if (busy) return;
    busy = true;
    const before = state;
    try {
      state = await pushEvent(event);
    } catch (err) {
      toast(err.message || "Couldn't save that", { tone: "bad" });
      state = activeState();
    } finally {
      busy = false;
    }
    buffer = "";
    pending = [];
    bullPos = null;
    afterChange(before);
  }
  function submitTotal(s) {
    if (busy || waiting() || state.finished) return;
    caller.unlock();
    caller.say([s === 0 ? caller.clips.noScore : caller.clips.number(s)]);
    commit({ p: state.turn.player, s, t: Date.now() });
  }
  function submitDarts() {
    if (!pending.length || waiting()) return;
    commit({ p: state.turn.player, d: [...pending], t: Date.now() });
  }

  async function doUndo() {
    if (pending.length) {
      pending.pop();
      return render();
    }
    if (buffer) {
      buffer = "";
      return render();
    }
    if (bullPos) {
      bullPos = null;
      return render();
    }
    if (online && !canUndoNow()) return toast("Only the player who threw it can undo that", { tone: "bad" });
    if (!getActive().events.length) return;
    busy = true;
    const before = state;
    try {
      state = await undo();
    } catch (err) {
      toast(err.message || "Couldn't undo that", { tone: "bad" });
    } finally {
      busy = false;
    }
    afterChange(before, { undone: true });
  }

  // After any change (yours or, online, someone else's): news, then the next screen.
  function afterChange(before, { undone = false } = {}) {
    render();
    if (undone) return;
    const gamesBefore = before.games.length;
    const prevGame = state.games[gamesBefore - 1];
    if (prevGame && prevGame.phase === "over" && before.games[gamesBefore - 1].phase !== "over") {
      const r = prevGame.result;
      const how = { sudden: " in sudden death", bull: " on the bull", starter: " (starter wins the tie)" }[prevGame.decidedBy] ?? "";
      if (!state.finished) toast(r === "draw" ? `Game ${prevGame.index + 1} is a draw` : `${nameOf(r)} wins game ${prevGame.index + 1}${how}`, { tone: "ok", ms: 3200 });
    }
    if (state.finished) setTimeout(() => navigate("/summary", { replace: true }), 700);
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!state) return;
    const g = state.game;
    title.textContent = mode.name;
    sub.textContent = `Game ${g.index + 1}${need > 1 ? ` of first to ${need}` : ""}, round ${g.round + 1}`;
    replaceChildren(board, cfg.players.map((_, p) => card(p)));
    board.dataset.players = String(cfg.players.length);

    banner.hidden = g.phase === "play";
    if (g.phase === "sudden") banner.textContent = `Sudden death: ${g.active.map(nameOf).join(" and ")} throw one more visit. Best visit wins.`;
    if (g.phase === "bull") banner.textContent = `A tie: ${g.active.map(nameOf).join(" and ")} throw for the bull.`;

    if (state.finished) return replaceChildren(inputArea, h("p", { class: "faint arcade__done" }, "Game over"));
    if (waiting()) {
      return replaceChildren(
        inputArea,
        h(
          "div",
          { class: "botpanel is-waiting arcade-wait" },
          h("span", { class: "botpanel__who" }, icon("globe", { size: 22 }), h("span", null, `Waiting for ${nameOf(state.turn.player)}`)),
          h("span", { class: "botpanel__skip" }, "Their darts appear here as soon as they enter them."),
          canUndoNow() ? h("button", { class: "btn btn--quiet botpanel__undo", type: "button", onclick: doUndo }, icon("undo", { size: 18 }), h("span", { class: "btn__label" }, "Undo my last visit")) : null
        )
      );
    }
    replaceChildren(inputArea, state.turn.kind === "bull" ? bullPad() : mode.input === "total" ? keypad() : targetPad());
  }

  // ---------------------------------------------------------------- menu
  async function openMenu() {
    const host = online && onlineState().isHost;
    const choice = await choose({
      title: "Game options",
      options: online
        ? [
            ...(host
              ? [
                  { label: "Restart game", value: "restart", sub: "Same players and options, from the first dart" },
                  { label: "Change game", value: "change", sub: "Pick another game, everyone stays" },
                ]
              : []),
            { label: "Leave for now", value: "away", sub: "Your seat is kept. Come back any time." },
            ...(host ? [{ label: "End for everyone", value: "endall", tone: "danger" }] : []),
          ]
        : [
            { label: "Restart game", value: "restart", sub: "Same players and options, from the first dart" },
            { label: "Change game", value: "change", sub: "Same players, another game" },
            { label: "End game", value: "end", tone: "danger" },
          ],
    });
    if (choice === "restart") {
      const ok = await confirm({ title: "Restart the game?", lead: "Every dart so far is cleared.", confirmLabel: "Restart", tone: "danger" });
      if (!ok) return;
      if (online) return restartMatch();
      startMatch(createArcade({ kind: cfg.kind, players: cfg.players, options: cfg.options, format: cfg.format, tie: cfg.tie, firstPlayer: cfg.firstPlayer ?? 0 }));
      state = activeState();
      return render();
    }
    if (choice === "change") {
      const pick = await choose({ title: "Change game", options: MODE_LIST.map((m) => ({ label: m.name, value: m.id, sub: m.blurb })) });
      if (!pick) return;
      if (online) return changeGame(pick);
      discardActive();
      return navigate(`/arcade/${pick}`, { replace: true });
    }
    if (choice === "away") {
      stepAway();
      return navigate("/online", { replace: true });
    }
    if (choice === "endall") {
      if (await confirm({ title: "End for everyone?", confirmLabel: "End", tone: "danger" })) await closeLobby();
      return;
    }
    if (choice === "end") {
      if (!(await confirm({ title: "End this game?", lead: "It won't be saved.", confirmLabel: "End game", tone: "danger" }))) return;
      discardActive();
      navigate("/", { replace: true });
    }
  }

  // ---------------------------------------------------------------- keyboard (desktop)
  function onKey(e) {
    if (e.defaultPrevented || isSheetOpen() || busy || waiting() || state.finished) return;
    if (e.key === "Backspace") return e.preventDefault(), mode.input === "total" && buffer ? ((buffer = buffer.slice(0, -1)), render()) : doUndo();
    if (state.turn.kind === "bull") return;
    if (mode.input === "total") {
      if (/^\d$/.test(e.key)) return typeDigit(Number(e.key));
      if (e.key === "Enter" && buffer !== "") return submitTotal(Number(buffer));
    } else {
      const btn = inputArea.querySelector(`.targetkey[data-key="${e.key}"]`);
      if (btn) btn.click();
      if (e.key.toLowerCase() === "m") inputArea.querySelector(".targetkey--miss")?.click();
    }
  }

  let offRemote = null;
  let offOnline = null;
  render();
  return {
    el,
    title: mode.name,
    afterMount() {
      document.addEventListener("keydown", onKey);
      if (online) {
        offRemote = onActiveChange(({ before }) => {
          if (busy) return;
          state = activeState();
          afterChange(before, { undone: state.applied < before.applied });
        });
        offOnline = onOnlineChange(() => (paintBadge(), render()));
      }
    },
    destroy() {
      document.removeEventListener("keydown", onKey);
      offRemote?.();
      offOnline?.();
      chat?.destroy();
    },
  };
}
