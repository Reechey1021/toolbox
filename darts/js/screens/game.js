// screens/game.js
// Runs a match: turns taps into visit events, asks only the questions it must,
// calls the scores, and keeps the board and log in step with the engine.

import { h, replaceChildren } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { choose, confirm, toast, openSheet, isSheetOpen } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { makeDart, MISS, dartLabel } from "../engine/board.js";
import { scoreVisit, doubleDartQuestion, onAFinish } from "../engine/visit.js";
import { currentLeg, legsToWin, lastVisit, totalEvent, dartsEvent, describeFormat, describeRules, hasHandicaps, isTeamMatch } from "../engine/match.js";
import { getOwner } from "../services/profile.js";
import { matchStats } from "../engine/stats.js";
import { getActive, activeState, pushEvent, undoLastHuman, hasHumanEvent, restartLeg, discardActive, isOnline, onActiveChange } from "../services/session.js";
import { canScoreNow, canUndoNow, onlineState, onOnlineChange, stepAway, closeLobby, isAway, restartMatch } from "../services/online.js";
import { createChat } from "./parts/chat.js";
import { voicePanel } from "./parts/voicePanel.js";
import { openMatchInfo } from "./parts/rules.js";
import { attachVoice, initVoiceUI, startVoiceAuto, stopVoice, nudgeVoiceAfterGameActivity, voiceTurnChanged } from "../services/voice.js";

const MODES_CYCLE = ["keypad", "darts", "voice"];
const MODE_LABEL = { keypad: "Use the keypad", darts: "Use the dart pad", voice: "Use voice" };
import { isBot, isBotTurn, nemesisVisit, nemesisLegTarget, profileOf } from "../engine/nemesis/index.js";
import { nemesisThought } from "../engine/nemesis/thoughts.js";
import { getSettings, setSetting } from "../services/settings.js";
import * as caller from "../services/caller.js";
import { keepAwake, tap } from "../services/device.js";
import { playerCard, legLog } from "./game/board.js";
import { createDock } from "./game/dock.js";
import { askCheckout, askDoubleDarts, askCheckInDart, showLegWon } from "./game/prompts.js";

const AUTO_SUBMIT_MS = 550;
// Nemesis's throwing rhythm (ms). The first visit of a leg waits for the caller.
const BOT_THINK = 900;
const BOT_THINK_LEG_START = 2600;
const BOT_DART = 650;
const BOT_AFTER = 450;

export function gameScreen() {
  let state = activeState();
  if (!state) {
    navigate("/", { replace: true });
    return { el: h("div") };
  }
  if (state.finished) {
    navigate("/summary", { replace: true });
    return { el: h("div") };
  }

  const cfg = state.cfg;
  const rulesFor = (side) => state.rules[side]; // match rules plus any handicap, per side
  const nameOf = (player) => cfg.players[player].name;
  const callNameOf = (player) => cfg.players[player].call || cfg.players[player].name; // the caller's recording
  const need = legsToWin(cfg);
  const ownerId = getOwner()?.id ?? null;
  const isBotPlayer = (p) => isBot(cfg.players[p]);
  const onlineMatch = isOnline(); // an online lobby's match: turns and undo follow its rules
  let selfCommitting = false;
  const waitingOnOthers = () => onlineMatch && !state.finished && !canScoreNow();

  let mode = MODES_CYCLE.includes(getSettings().inputMode) ? getSettings().inputMode : "keypad";
  let buffer = ""; // keypad digits
  let pending = []; // darts entered this visit
  let mult = 1;
  let busy = false; // a prompt or save is in flight
  let autoTimer = null;
  let error = null;

  // Nemesis's turn
  let botToken = 0; // bumps to cancel a turn in progress (undo, leaving the screen)
  let botActive = false;
  let botPending = []; // its darts landed so far this visit
  let botSkip = false;
  let botWake = null;
  let visitsSinceThought = 99;

  // ---------------------------------------------------------------- layout

  const legTitle = h("h1");
  const legSub = h("p");
  const board = h("section", { class: ["board", isTeamMatch(cfg) && "board--teams"], "aria-label": "Scoreboard", dataset: { players: String(state.sides.length) } });
  const logPanel = h("section", { class: "logpanel", "aria-label": "This leg" });

  const dock = createDock({
    digit: (d) => (tap(), pressDigit(d)),
    backspace: () => (tap(), backspace()),
    enter: () => (tap(), enter()),
    quick: (v) => (tap(), submitTotal(v)),
    quickCheckout: () => (tap(), quickCheckout()),
    undo: () => (tap(), doUndo()),
    toggleMode: () => switchMode(),
    mult: (m) => (tap(), (mult = mult === m ? 1 : m), refresh()),
    number: (n) => (tap(), addDart(makeDart(n, mult))),
    bull: (full) => (tap(), addDart(makeDart(25, full ? 2 : 1))),
    miss: () => (tap(), addDart(MISS)),
  });

  // Online: the chat panel (under the keypad on wide screens) and the phone's chat button badge.
  const chat = onlineMatch ? createChat() : null;
  const chatBadge = h("span", { class: "chatbtn__badge", hidden: true });

  const bar = h(
    "header",
    { class: "topbar game__bar" },
    h("span", { class: "icon-btn game__nobtn", "aria-hidden": "true" }), // no way out but "Leave match"
    h("div", { class: "topbar__title" }, legTitle, legSub),
    h(
      "div",
      { class: "topbar__actions" },
      onlineMatch ? h("button", { class: "icon-btn chatbtn", type: "button", "aria-label": "Chat", onclick: () => openChat() }, icon("chat"), chatBadge) : null,
      h("button", { class: "icon-btn game__logbtn", type: "button", "aria-label": "Leg history", onclick: openLog }, icon("list")),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Match info", onclick: () => openMatchInfo(cfg, { anyoneScores: onlineMatch ? Boolean(onlineState().lobby?.settings?.anyoneScores) : null }) }, icon("info")),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Match options", onclick: openMenu }, icon("more"))
    )
  );

  // While Nemesis throws, its darts land here, over the keypad. Tap to skip the wait.
  const botSlots = [0, 1, 2].map(() => h("span", { class: "slot" }));
  let botWho = null;
  let botHint = null;
  const botTotal = h("span", { class: "entry__total num" });
  // Online: undo your own visit while you wait for the next player.
  const botUndo = h(
    "button",
    {
      class: "btn btn--quiet botpanel__undo",
      type: "button",
      hidden: true,
      onclick: (e) => {
        e.stopPropagation();
        doUndo();
      },
    },
    icon("undo", { size: 18 }),
    h("span", { class: "btn__label" }, "Undo my last visit")
  );
  const botPanel = h(
    "div",
    { class: "botpanel", role: "button", tabindex: "-1", hidden: true, "aria-live": "polite", onclick: () => skipBot() },
    h("span", { class: "botpanel__who" }, icon(onlineMatch ? "globe" : "bot", { size: 22 }), (botWho = h("span", null, "Nemesis is throwing"))),
    h("span", { class: "slots" }, botSlots, botTotal),
    (botHint = h("span", { class: "botpanel__skip" }, "Tap to skip")),
    botUndo
  );
  // The tray rebuilds its contents when the input mode changes, so the panel is re-added each time.
  function buildDock(m) {
    dock.build(m);
    // Voice: the keypad's display shows what was heard; the microphone takes the keys' place.
    if (m === "voice") {
      dock.el.querySelector(".entry")?.after(voicePanel());
      attachVoice({
        inputMode: () => mode,
        canScore: () => !busy && !botActive && !state.finished && !waitingOnOthers() && !isSheetOpen(),
        submit: (score) => submitTotal(score),
        showError: (msg) => toast(msg, { tone: "bad" }),
      });
      initVoiceUI();
      if (mounted) startVoiceAuto();
    }
    dock.el.append(botPanel);
    if (chat) dock.el.append(h("div", { class: "gamechat" }, chat.el));
  }
  function openChat() {
    const sheetChat = createChat();
    chat?.markRead();
    paintBadge();
    openSheet({ title: "Chat", className: "sheet--chat", body: sheetChat.el }).closed.then(() => {
      sheetChat.destroy();
      chat?.markRead();
      paintBadge();
    });
    setTimeout(() => sheetChat.focus(), 250);
  }
  function paintBadge() {
    const n = chat ? Math.max(0, chat.unread()) : 0;
    chatBadge.hidden = n === 0;
    chatBadge.textContent = String(n);
  }

  const thought = h("div", { class: "thought", role: "status", "aria-live": "polite", hidden: true });
  let thoughtTimer = null;
  function showThought(text) {
    clearTimeout(thoughtTimer);
    thought.replaceChildren(h("span", { class: "thought__who" }, icon("bot", { size: 16 }), "Nemesis"), h("span", { class: "thought__text" }, text));
    thought.hidden = false;
    requestAnimationFrame(() => thought.classList.add("is-in"));
    thoughtTimer = setTimeout(() => {
      thought.classList.remove("is-in");
      setTimeout(() => (thought.hidden = true), 250);
    }, 3200);
  }

  const el = h("div", { class: "game" }, bar, h("div", { class: "game__main" }, board, logPanel, thought), dock.el);

  // ---------------------------------------------------------------- rendering

  function preview(darts = pending) {
    const leg = currentLeg(state);
    const side = leg.current;
    return scoreVisit({
      remaining: leg.remaining[side],
      checkedIn: leg.checkedIn[side],
      rules: rulesFor(side),
      input: { kind: "darts", darts, partial: true },
    });
  }

  // Quick checkout: one tap submits the remaining score, on normal finishing rules.
  function quickCheckoutValue() {
    if (state.finished) return null;
    const leg = currentLeg(state);
    const side = leg.current;
    const r = rulesFor(side);
    if (r.finish !== "exact" || !leg.checkedIn[side]) return null;
    const rem = leg.remaining[side];
    return rem <= 180 && onAFinish(rem, true, r) ? rem : null;
  }

  function quickCheckout() {
    const v = quickCheckoutValue();
    if (v !== null && !buffer) submitTotal(v);
  }

  function refresh() {
    const leg = currentLeg(state);
    const stats = matchStats(state);
    legTitle.textContent = state.sides.length === 1 ? `Leg ${leg.index + 1} of ${need}` : `Leg ${leg.index + 1}`;
    legSub.textContent = `${cfg.startScore} ${describeRules(cfg)}, ${describeFormat(cfg).toLowerCase()}${hasHandicaps(cfg) ? ", handicaps" : ""}`;

    const view = { state, stats, need };
    let pv = null;
    const live = botPending.length ? botPending : mode === "darts" ? pending : [];
    if (live.length) {
      const p2 = preview(live);
      if (live === pending) pv = p2;
      if (p2.ok && !p2.bust) {
        view.activeRemaining = p2.remaining;
        view.activeCheckedIn = p2.checkedIn;
        view.dartsLeft = Math.max(0, 3 - live.length);
      }
    }
    replaceChildren(board, state.sides.map((_, i) => playerCard(view, i)));
    replaceChildren(logPanel, legLog(state));
    // Keep the newest round in view on the desktop log.
    logPanel.scrollTop = logPanel.scrollHeight;
    dock.update(entryView(pv));
    renderBotPanel();
    maybeStartBot();
    if (mode === "voice") voiceTurnChanged();
  }

  function entryView(pv) {
    const leg = currentLeg(state);
    const side = leg.current;
    const thrower = leg.thrower;
    const canUndo = hasHumanEvent(isBotPlayer) || buffer.length > 0 || pending.length > 0;
    const base = { mode: mode === "voice" ? "keypad" : mode, canUndo, locked: busy };

    if (mode !== "darts") {
      if (error) return { ...base, value: buffer, hint: error, tone: "bad", canEnter: false };
      if (!buffer) return { ...base, value: "", placeholder: "Score", hint: `${nameOf(thrower)} to throw`, tone: "", canEnter: false, quickCheckout: quickCheckoutValue() };
      const o = scoreVisit({ remaining: leg.remaining[side], checkedIn: leg.checkedIn[side], rules: rulesFor(side), input: { kind: "total", score: Number(buffer) } });
      if (!o.ok) return { ...base, value: buffer, hint: o.error, tone: "bad", canEnter: false };
      if (o.checkout) return { ...base, value: buffer, hint: "Checkout", tone: "ok", canEnter: true };
      if (o.bust) return { ...base, value: buffer, hint: "Bust", tone: "bad", canEnter: true };
      return { ...base, value: buffer, hint: `Leaves ${o.remaining}`, tone: "", canEnter: true };
    }

    const slots = pending.map(dartLabel);
    const complete = pv ? pv.bust || pv.checkout || pending.length === 3 : false;
    let hint = `${nameOf(thrower)} to throw`;
    let tone = "";
    let total = "";
    if (pv && pv.ok) {
      total = pv.bust ? "" : String(pv.raw ?? pv.counted);
      if (pv.bust) [hint, tone] = ["Bust", "bad"];
      else if (pv.checkout) [hint, tone] = ["Checkout", "ok"];
      else if (!pv.checkedIn) hint = "Needs a double to start";
      else hint = `Leaves ${pv.remaining}`;
    }
    return { ...base, slots, total, hint, tone, mult, complete };
  }

  function flashError(message) {
    error = message;
    refresh();
    el.querySelector(".entry__display")?.animate?.(
      [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
      { duration: 240 }
    );
  }

  // ---------------------------------------------------------------- keypad

  function pressDigit(d) {
    if (busy) return;
    error = null;
    if (buffer === "0") buffer = "";
    if (buffer.length >= 3) return;
    buffer += d;
    refresh();
  }

  function backspace() {
    if (busy) return;
    error = null;
    if (mode === "darts") {
      clearTimeout(autoTimer);
      pending.pop();
    } else {
      buffer = buffer.slice(0, -1);
    }
    refresh();
  }

  function enter() {
    if (mode === "darts") return submitDarts();
    if (!buffer) return;
    submitTotal(Number(buffer));
  }

  async function submitTotal(score) {
    if (busy || state.finished || waitingOnOthers()) return;
    const leg = currentLeg(state);
    const side = leg.current;
    const p = leg.thrower;
    const start = leg.remaining[side];
    const checkedIn = leg.checkedIn[side];
    const rules = rulesFor(side);
    const outcome = scoreVisit({ remaining: start, checkedIn, rules, input: { kind: "total", score } });
    if (!outcome.ok) return flashError(outcome.error);
    // Doubles questions only make sense on normal rules.
    const trackDoubles = cfg.trackDoubles && !rules.handicapped;

    busy = true;
    refresh();
    try {
      let dartsUsed = null;
      let doubleDarts = null;
      let checkInDart = null;
      // Double in: which dart hit the double, when the score leaves it open.
      if (outcome.checkInOptions && cfg.trackDoubles) {
        const v = await askCheckInDart({ options: outcome.checkInOptions, name: nameOf(p) });
        if (v === undefined) return;
        checkInDart = v;
      }
      if (outcome.checkout) {
        const res = await askCheckout({
          start,
          outcome,
          checkOut: rules.checkOut,
          trackDoubles: trackDoubles && rules.finish === "exact" && checkedIn,
        });
        if (!res) return;
        dartsUsed = res.dartsUsed;
        doubleDarts = res.doubleDarts;
      } else if (trackDoubles) {
        const q = doubleDartQuestion({ start, checkedIn, rules, outcome });
        if (q) {
          if (q.min === q.max) doubleDarts = q.min;
          else {
            const v = await askDoubleDarts({ ...q, start });
            if (v === undefined) return;
            doubleDarts = v;
          }
        }
      }
      await commit(totalEvent(p, score, { dartsUsed: outcome.checkout ? dartsUsed : null, doubleDarts, checkInDart }));
    } finally {
      busy = false;
      refresh();
    }
  }

  // ---------------------------------------------------------------- dart pad

  function addDart(d) {
    if (busy || state.finished || pending.length >= 3 || waitingOnOthers()) return;
    clearTimeout(autoTimer);
    const leg = currentLeg(state);
    const side = leg.current;
    const pv = scoreVisit({
      remaining: leg.remaining[side],
      checkedIn: leg.checkedIn[side],
      rules: rulesFor(side),
      input: { kind: "darts", darts: pending, partial: true },
    });
    if (pv.ok && (pv.bust || pv.checkout)) return; // visit already over, waiting to submit
    pending.push(d);
    mult = 1;
    refresh();
    const now = preview();
    if (now.bust || now.checkout || pending.length === 3) {
      autoTimer = setTimeout(submitDarts, AUTO_SUBMIT_MS);
    }
  }

  async function submitDarts() {
    clearTimeout(autoTimer);
    if (busy || state.finished) return;
    const leg = currentLeg(state);
    busy = true;
    try {
      await commit(dartsEvent(leg.thrower, pending));
    } finally {
      busy = false;
      refresh();
    }
  }

  // Keypad, dart pad, voice: the toggle cycles through them; the menu can jump to one.
  function switchMode(to = null) {
    clearTimeout(autoTimer);
    if (pending.length || buffer) {
      pending = [];
      buffer = "";
    }
    if (mode === "voice") stopVoice();
    mode = to ?? MODES_CYCLE[(MODES_CYCLE.indexOf(mode) + 1) % MODES_CYCLE.length];
    setSetting("inputMode", mode);
    error = null;
    mult = 1;
    buildDock(mode);
    refresh();
  }

  // ---------------------------------------------------------------- committing

  async function commit(event) {
    const before = state;
    selfCommitting = true;
    try {
      state = await pushEvent(event);
    } catch (err) {
      // Online: not your turn, or someone else scored first. Show the lobby's version.
      toast(err.message || "Couldn't save that visit", { tone: "bad" });
      state = activeState();
      buffer = "";
      pending = [];
      refresh();
      return;
    } finally {
      selfCommitting = false;
    }
    buffer = "";
    pending = [];
    mult = 1;
    error = null;
    await afterVisit(before);
  }

  // After any visit, yours or (online) someone else's: call it, then leg won or match over.
  async function afterVisit(before) {
    if (mode === "voice") nudgeVoiceAfterGameActivity();
    const beforeSide = currentLeg(before).current;
    const visit = lastVisit(state);
    const legWon = state.finished || state.legs.length > before.legs.length;
    const next = legWon ? null : nextUp();

    const byBot = isBotPlayer(visit.player);
    caller.announceVisit({
      outcome: visit,
      legWon,
      matchWon: state.finished,
      winnerName: legWon ? callNameOf(visit.player) : null,
      next,
      byNemesis: byBot,
    });
    if (byBot) sayThought(before, beforeSide, visit);
    else visitsSinceThought++;
    refresh();

    if (state.finished) {
      setTimeout(() => navigate("/summary"), 700);
      return;
    }
    if (legWon) {
      busy = false;
      const choice = await showLegWon({
        state,
        legIndex: before.legs.length - 1,
        ownerId,
        undoLabel: byBot ? "Undo my last visit" : "Undo checkout",
      });
      if (choice === "undo") await doUndo({ quiet: true });
      else {
        const starter = currentLeg(state).starterPlayer;
        caller.announceLegStart(callNameOf(starter), { nemesis: isBotPlayer(starter) });
        refresh();
      }
    }
  }

  function nextUp() {
    const leg = currentLeg(state);
    const side = leg.current;
    const remaining = leg.remaining[side];
    const r = rulesFor(side);
    return {
      name: callNameOf(leg.thrower),
      nemesis: isBotPlayer(leg.thrower),
      remaining,
      // "You require 32" only makes sense on normal finishing rules.
      onFinish: !r.handicapped && leg.checkedIn[side] && onAFinish(remaining, true, r),
    };
  }

  async function doUndo({ quiet = false } = {}) {
    if (botActive) cancelBot();
    if (onlineMatch && !(pending.length || buffer || error) && !canUndoNow()) {
      toast("Only the player who threw it can undo that visit", { tone: "bad" });
      return;
    }
    if (busy) return;
    clearTimeout(autoTimer);
    if (pending.length || buffer || error) {
      pending = [];
      buffer = "";
      error = null;
      refresh();
      return;
    }
    // The last visit a human threw (Nemesis's replies after it go too).
    let v = null;
    for (let l = state.legs.length - 1; l >= 0 && !v; l--) {
      const visits = state.legs[l].visits;
      for (let k = visits.length - 1; k >= 0; k--) if (!isBotPlayer(visits[k].player)) (v = visits[k]), (k = -1);
    }
    if (!v) return;
    caller.stop();
    selfCommitting = true; // your own undo: no "a visit was undone" message
    try {
      state = await undoLastHuman(isBotPlayer);
    } catch (err) {
      toast(err.message || "Couldn't undo that", { tone: "bad" });
      state = activeState();
    } finally {
      selfCommitting = false;
    }
    if (!quiet) toast(`Undid ${nameOf(v.player)}'s ${v.bust ? "bust" : (v.raw ?? v.counted)}`);
    refresh();
  }

  // ---------------------------------------------------------------- Nemesis's turn

  function onRemoteChange({ before, after }) {
    if (selfCommitting) return; // your own visit: commit() handles it
    state = activeState();
    if (after.applied > before.applied) {
      buffer = "";
      pending = [];
      afterVisit(before);
    } else {
      toast("A visit was undone");
      refresh();
    }
  }

  function renderBotPanel() {
    const waiting = waitingOnOthers() && !botActive;
    const show = botActive || waiting;
    botPanel.hidden = !show;
    botPanel.classList.toggle("is-waiting", waiting);
    dock.el.classList.toggle("is-watching", show);
    if (!show) return;
    if (waiting) {
      const leg = currentLeg(state);
      const seat = onlineState().seats.find((x) => x && `g:${x.uid}` === cfg.players[leg.thrower].id);
      botWho.textContent = `Waiting for ${nameOf(leg.thrower)}`;
      botHint.textContent = isAway(seat) ? "Their phone looks locked. It'll carry on when they're back." : "Their score appears here as soon as they enter it.";
      botSlots.forEach((slot) => (slot.textContent = "", slot.classList.remove("is-filled", "is-next")));
      botTotal.textContent = "";
      botUndo.hidden = !canUndoNow();
      return;
    }
    botUndo.hidden = true;
    botWho.textContent = "Nemesis is throwing";
    botHint.textContent = "Tap to skip";
    const pv = botPending.length ? preview(botPending) : null;
    botSlots.forEach((slot, i) => {
      const d = botPending[i];
      slot.textContent = d ? dartLabel(d) : "";
      slot.classList.toggle("is-filled", Boolean(d));
      slot.classList.toggle("is-next", !d && i === botPending.length);
    });
    botTotal.textContent = pv && pv.ok && !pv.bust ? String(pv.raw ?? pv.counted) : pv?.bust ? "Bust" : "";
  }

  function wait(ms) {
    return new Promise((resolve) => {
      if (botSkip) return resolve();
      const t = setTimeout(resolve, ms);
      botWake = () => {
        clearTimeout(t);
        resolve();
      };
    });
  }

  function skipBot() {
    botSkip = true;
    botWake?.();
  }

  function cancelBot() {
    botToken++;
    botActive = false;
    botPending = [];
    busy = false;
    botWake?.();
    renderBotPanel();
  }

  function maybeStartBot() {
    if (!mounted) return;
    if (botActive || busy || state.finished || isSheetOpen() || !isBotTurn(state)) return;
    runBot();
  }

  async function runBot() {
    const mine = ++botToken;
    botActive = true;
    busy = true;
    botSkip = false;
    botPending = [];
    const leg = currentLeg(state);
    const thrower = leg.thrower;
    const darts = nemesisVisit(state);
    refresh();
    await wait(leg.visits.length === 0 ? BOT_THINK_LEG_START : BOT_THINK);
    for (const d of darts) {
      if (mine !== botToken) return;
      botPending = [...botPending, d];
      refresh();
      await wait(BOT_DART);
    }
    await wait(BOT_AFTER);
    if (mine !== botToken) return;
    botPending = [];
    botActive = false;
    busy = false;
    await commit(dartsEvent(thrower, darts));
  }

  // A thought now and then, driven by what actually happened.
  function sayThought(before, side, visit) {
    visitsSinceThought++;
    if (!getSettings().nemesisThoughts) return;
    const leg = currentLeg(before);
    const others = before.sides.map((_, i) => i).filter((i) => i !== side);
    const opponentOnFinish = others.some((i) => leg.checkedIn[i] && onAFinish(leg.remaining[i], true, before.rules[i]));
    const prev = leg.visits[leg.visits.length - 1];
    const opponentLast = prev && prev.side !== side && !prev.bust ? (prev.raw ?? prev.counted) : null;
    const legsFor = before.legsWon[side];
    const behind = others.some((i) => before.legsWon[i] > legsFor);
    const t = nemesisThought({
      visit,
      target: nemesisLegTarget(before) ?? profileOf(cfg, visit.player).target,
      opponentOnFinish,
      opponentLast,
      behind,
      composure: profileOf(cfg, visit.player).composure,
    });
    if (!t) return;
    if (t.tier === 2 && visitsSinceThought < 3) return; // don't talk too much
    visitsSinceThought = 0;
    showThought(t.text);
  }

  // ---------------------------------------------------------------- menus

  function openLog() {
    openSheet({ title: `Leg ${currentLeg(state).index + 1}`, className: "sheet--log", body: legLog(state) });
  }

  async function openMenu() {
    const callerOn = getSettings().callerEnabled;
    const hasVisits = currentLeg(state).visits.length > 0;
    const choice = await choose({
      title: "Match options",
      options: onlineMatch
        ? [
            ...MODES_CYCLE.filter((m) => m !== mode).map((m) => ({ label: MODE_LABEL[m], value: `mode:${m}` })),
            { label: callerOn ? "Turn the caller off" : "Turn the caller on", value: "caller" },
            { label: "Leave for now", value: "away", sub: "Your seat is kept. Come back any time." },
            ...(onlineState().isHost
              ? [
                  { label: "Restart match", value: "restartall", sub: "Same players and settings, back to the first dart" },
                  { label: "End match for everyone", value: "endall", tone: "danger" },
                ]
              : []),
          ]
        : [
            ...MODES_CYCLE.filter((m) => m !== mode).map((m) => ({ label: MODE_LABEL[m], value: `mode:${m}` })),
            { label: callerOn ? "Turn the caller off" : "Turn the caller on", value: "caller" },
            { label: "Restart this leg", value: "restart", disabled: !hasVisits },
            { label: "End match", value: "end", tone: "danger" },
          ],
    });
    if (choice === "away") {
      stepAway();
      navigate("/online", { replace: true });
      return;
    }
    if (choice === "restartall") {
      const ok = await confirm({ title: "Restart the match?", lead: "Every visit so far is cleared for everyone.", confirmLabel: "Restart match", tone: "danger" });
      if (ok) await restartMatch();
      return;
    }
    if (choice === "endall") {
      const ok = await confirm({ title: "End the match for everyone?", lead: "Nobody's history gets this match.", confirmLabel: "End match", tone: "danger" });
      if (ok) await closeLobby();
      return;
    }
    if (typeof choice === "string" && choice.startsWith("mode:")) switchMode(choice.slice(5));
    if (choice === "caller") {
      setSetting("callerEnabled", !callerOn);
      toast(callerOn ? "Caller off" : "Caller on");
    }
    if (choice === "restart") {
      const ok = await confirm({ title: "Restart this leg?", lead: "Every visit in this leg will be cleared.", confirmLabel: "Restart leg", tone: "danger" });
      if (!ok) return;
      state = await restartLeg();
      pending = [];
      buffer = "";
      refresh();
    }
    if (choice === "end") {
      const ok = await confirm({ title: "End this match?", lead: "It won't be saved to your history.", confirmLabel: "End match", tone: "danger" });
      if (!ok) return;
      discardActive();
      navigate("/", { replace: true });
    }
  }

  // ---------------------------------------------------------------- keyboard

  let typed = ""; // dart pad: a number being typed
  function onKey(e) {
    if (botActive && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      return skipBot();
    }
    if (e.defaultPrevented || isSheetOpen() || busy || waitingOnOthers()) return;
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key;

    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") {
      e.preventDefault();
      return doUndo();
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (mode === "keypad") {
      if (/^\d$/.test(k)) pressDigit(k);
      else if (k === "Backspace") backspace();
      else if (k === "Enter") enter();
      else if (k === "Escape") (buffer = ""), (error = null), refresh();
      else if (k.toLowerCase() === "u") doUndo();
      else return;
      e.preventDefault();
      return;
    }

    // Dart pad: d/t set the multiplier, type 1-20 then Enter or Space, b bull, o outer, m miss.
    const lower = k.toLowerCase();
    if (lower === "d") (mult = mult === 2 ? 1 : 2), refresh();
    else if (lower === "t") (mult = mult === 3 ? 1 : 3), refresh();
    else if (lower === "s") (mult = 1), refresh();
    else if (lower === "b") addDart(makeDart(25, 2));
    else if (lower === "o") addDart(makeDart(25, 1));
    else if (lower === "m") addDart(MISS);
    else if (lower === "u") doUndo();
    else if (/^\d$/.test(k)) {
      // 3-9 are instant; 1 and 2 wait for a second digit (10-20) or Enter.
      if (typed && Number(typed + k) > 20) {
        addDart(makeDart(Number(typed), mult));
        typed = "";
      }
      typed += k;
      if (Number(typed) >= 3 || typed.length === 2) {
        const n = Number(typed);
        typed = "";
        if (n >= 1 && n <= 20) addDart(makeDart(n, mult));
      }
    } else if (k === "Enter" || k === " ") {
      if (typed) {
        const n = Number(typed);
        typed = "";
        if (n >= 1 && n <= 20) addDart(makeDart(n, mult));
      } else submitDarts();
    } else if (k === "Backspace") backspace();
    else return;
    e.preventDefault();
  }

  // ---------------------------------------------------------------- lifecycle

  buildDock(mode);
  let mounted = false;
  let offRemote = null;
  let offOnline = null;
  refresh();

  return {
    el,
    title: "Match",
    afterMount() {
      mounted = true;
      if (mode === "voice") startVoiceAuto(); // listening by default, as before
      if (onlineMatch) {
        offRemote = onActiveChange(onRemoteChange);
        offOnline = onOnlineChange(() => {
          paintBadge();
          renderBotPanel();
          dock.update(entryView(null));
        });
      }
      document.addEventListener("keydown", onKey);
      keepAwake(true);
      if (getActive().events.length === 0) {
        const starter = currentLeg(state).starterPlayer;
        caller.announceLegStart(callNameOf(starter), { nemesis: isBotPlayer(starter) });
      }
      maybeStartBot();
    },
    destroy() {
      stopVoice();
      offRemote?.();
      offOnline?.();
      chat?.destroy();
      cancelBot();
      clearTimeout(thoughtTimer);
      clearTimeout(autoTimer);
      document.removeEventListener("keydown", onKey);
      keepAwake(false);
    },
  };
}
