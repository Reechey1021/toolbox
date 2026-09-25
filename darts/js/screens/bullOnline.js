// screens/bullOnline.js
// Throwing for the bull online. Everyone taps where their own dart landed on
// their own phone; the others' darts appear as they're thrown. The host's phone
// settles it once every dart is in (ties throw again), and everyone goes
// straight into the match.

import { h, replaceChildren } from "../ui/dom.js";
import { topBar, toast } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { distanceMm, ringOf } from "../engine/bull.js";
const bothInBull = (last) => last?.tied?.length > 1 && last.tied.every((i) => ringOf(last.throws?.[i] ?? { x: 99, y: 99 }) === "bull");
import { needsBull } from "../engine/match.js";
import { getActive } from "../services/session.js";
import { onlineState, onOnlineChange, throwBull, settleBull, bullEntrants } from "../services/online.js";
import { tap as haptic } from "../services/device.js";
import { PLAYER_COLOURS, svg, markerEl, toBoard, makeBoard } from "./parts/bullBoard.js";

export function onlineBullScreen() {
  const cfg0 = getActive().cfg;
  const names = cfg0.players.map((p) => p.name);
  const meIndex = () => getActive()?.cfg.players.findIndex((p) => p.id === `g:${onlineState().uid}`) ?? -1;

  let pending = null;
  let sending = false;
  let leaving = null;

  const prompt = h("p", { class: "bull__prompt", "aria-live": "polite" });
  const legend = h("ol", { class: "bull__legend" });
  const actions = h("div", { class: "bull__actions" });
  const markers = svg("g", { class: "markers" });
  const board = makeBoard(markers);

  const lobbyBull = () => onlineState().lobby?.bull ?? {};
  const throws = () => lobbyBull().throws ?? {};
  const entrants = () => bullEntrants(onlineState().lobby);
  const myTurn = () => entrants().includes(meIndex()) && !throws()[meIndex()];

  board.addEventListener("click", (e) => {
    if (!myTurn() || sending) return;
    pending = toBoard(board, e);
    haptic();
    render();
  });

  async function confirmDart() {
    if (!pending || sending) return;
    sending = true;
    render();
    try {
      await throwBull(meIndex(), pending);
      pending = null;
    } catch (err) {
      toast(err.message || "Couldn't send your dart. Try again.", { tone: "bad" });
    } finally {
      sending = false;
      render();
    }
  }

  function describe(i) {
    const t = throws()[i];
    if (!entrants().includes(i)) return "Out";
    if (!t) return i === meIndex() ? "Your throw" : "Throwing";
    const ring = ringOf(t);
    const mm = `${distanceMm(t).toFixed(1)} mm`;
    return ring === "bull" ? `In the bull, ${mm}` : ring === "outer bull" ? `Outer bull, ${mm}` : mm;
  }

  function render() {
    const a = getActive();
    if (!a) return;
    const done = !needsBull(a.cfg);
    const shown = done ? a.cfg.bull?.throws?.reduce((o, t) => ((o[t.p] = t), o), {}) ?? {} : throws();

    const nodes = Object.entries(shown).map(([i, t]) => markerEl(t, PLAYER_COLOURS[i], names[i], false, Number(i)));
    if (pending) nodes.push(markerEl(pending, PLAYER_COLOURS[meIndex()], names[meIndex()], true, meIndex()));
    markers.replaceChildren(...nodes);

    const everyone = cfg0.players.map((_, i) => i);
    replaceChildren(
      legend,
      everyone.map((i) =>
        h(
          "li",
          { class: ["bull__row", done && a.cfg.firstPlayer === i && "is-winner", !done && entrants().includes(i) && !throws()[i] && "is-up"] },
          h("span", { class: "bull__swatch", style: { background: PLAYER_COLOURS[i] }, "aria-hidden": "true" }),
          h("span", { class: "bull__name" }, names[i], i === meIndex() ? h("span", { class: "bull__team" }, " (you)") : null),
          h("span", { class: "bull__dist num" }, done ? (shown[i] ? `${distanceMm(shown[i]).toFixed(1)} mm` : "") : describe(i))
        )
      )
    );

    if (done) {
      prompt.textContent = `${names[a.cfg.firstPlayer]} throws first`;
      replaceChildren(actions, h("p", { class: "faint" }, "Game on…"));
      if (!leaving) leaving = setTimeout(() => navigate("/game", { replace: true }), 1400);
      return;
    }

    const last = lobbyBull().last;
    const waitingOn = entrants().filter((i) => !throws()[i] && i !== meIndex()).map((i) => names[i]);
    if (myTurn()) {
      const again = last && last.tied?.includes(meIndex());
      prompt.textContent = pending ? "Move it or confirm" : again ? (bothInBull(last) ? "Both in the bull. Throw again." : "Too close to call. Throw again.") : "Tap where your dart landed";
      replaceChildren(actions, h("button", { class: "btn btn--primary btn--block", type: "button", disabled: !pending || sending, onclick: confirmDart }, sending ? "Sending…" : "Confirm my dart"));
    } else if (waitingOn.length) {
      prompt.textContent = `Waiting for ${waitingOn.join(" and ")}`;
      replaceChildren(actions, h("p", { class: "faint" }, entrants().includes(meIndex()) ? "Your dart's in." : "You're out of this one. Watching the rethrow."));
    } else {
      prompt.textContent = "Deciding…";
      replaceChildren(actions);
    }
  }

  // The host's phone settles it whenever the last dart lands.
  const off = onOnlineChange(() => {
    render();
    if (onlineState().isHost) settleBull();
  });
  render();
  if (onlineState().isHost) settleBull();

  const el = h(
    "main",
    { class: "page bull" },
    topBar({ title: "Throw for the bull", sub: "Closest to the middle throws first", back: "#/online" }),
    prompt,
    h("div", { class: "bull__stage" }, h("div", { class: "bull__boardwrap" }, board), h("div", { class: "bull__side" }, legend, actions))
  );

  return {
    el,
    title: "Throw for the bull",
    destroy() {
      off();
      clearTimeout(leaving);
    },
  };
}
