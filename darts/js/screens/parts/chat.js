// screens/parts/chat.js
// The lobby and match chat, with the live log mixed in: scoring lines are
// worked out from the match's visits (nothing extra is stored), and sit in
// time order alongside what people say.

import { h, fmt, replaceChildren } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/components.js";
import { onlineState, onOnlineChange, sendChat } from "../../services/online.js";
import { activeState, onlineCode } from "../../services/session.js";
import { sideName } from "../../engine/match.js";

// "Reech scored 138. 363 remaining." for every visit in the match.
export function logLines(state) {
  if (!state) return [];
  if (state.games) return arcadeLines(state);
  const cfg = state.cfg;
  const out = [];
  state.legs.forEach((leg) => {
    leg.visits.forEach((v) => {
      const who = cfg.players[v.player].name;
      const pts = v.raw ?? v.counted;
      let text;
      if (v.checkout) text = `${who} checked out ${pts} to win leg ${leg.index + 1}.`;
      else if (v.bust) text = `${who} bust. ${v.start} remaining.`;
      else text = `${who} scored ${pts}. ${v.remaining} remaining.`;
      out.push({ kind: "log", at: v.t ?? 0, text });
    });
  });
  if (state.finished) out.push({ kind: "log", at: Date.now(), text: `${sideName(cfg, state.winner)} won the match.`, big: true });
  return out;
}

// Arcade: "Reech moved on 2." and who won each game.
function arcadeLines(state) {
  const names = state.cfg.players.map((p) => p.name);
  const out = [];
  for (const g of state.games) {
    for (const v of g.visits) out.push({ kind: "log", at: v.t ?? 0, text: v.phase === "bull" ? `${names[v.player]} threw for the bull.` : `${names[v.player]} ${v.text}.` });
    if (g.phase === "over") out.push({ kind: "log", at: (g.visits[g.visits.length - 1]?.t ?? 0) + 1, text: g.result === "draw" ? `Game ${g.index + 1} is a draw.` : `${names[g.result]} wins game ${g.index + 1}.`, big: true });
  }
  return out;
}

export function createChat({ withLog = true } = {}) {
  const list = h("ol", { class: "chat__list", "aria-live": "polite" });
  const input = h("input", { class: "field chat__input", type: "text", maxlength: 280, placeholder: "Say something", "aria-label": "Chat message", autocomplete: "off" });
  const send = h("button", { class: "icon-btn chat__send", type: "submit", "aria-label": "Send" }, icon("chevron"));
  const form = h(
    "form",
    {
      class: "chat__form",
      onsubmit: async (e) => {
        e.preventDefault();
        const text = input.value;
        if (!text.trim()) return;
        input.value = "";
        try {
          await sendChat(text);
        } catch (err) {
          toast(err.message || "Couldn't send that", { tone: "bad" });
          input.value = text;
        }
      },
    },
    input,
    send
  );
  const el = h("section", { class: "chat", "aria-label": "Chat" }, list, form);

  let seen = 0;
  function render() {
    const s = onlineState();
    const state = withLog && onlineCode() === s.code ? activeState() : null;
    const items = [...s.chat.map((m) => ({ kind: "msg", at: m.at, text: m.text, name: m.name, mine: m.uid === s.uid })), ...logLines(state)].sort((a, b) => a.at - b.at);
    replaceChildren(
      list,
      items.length
        ? items.map((m) =>
            m.kind === "msg"
              ? h("li", { class: ["chat__msg", m.mine && "is-mine"] }, h("span", { class: "chat__who" }, m.mine ? "You" : m.name, h("span", { class: "chat__time" }, fmt.time(m.at))), h("span", { class: "chat__text" }, m.text))
              : h("li", { class: ["chat__log", m.big && "is-big"] }, m.text)
          )
        : h("li", { class: "chat__empty" }, "Nothing yet. Say hello.")
    );
    list.scrollTop = list.scrollHeight;
  }

  // Messages from others you haven't seen yet (for the phone's chat badge).
  function unread() {
    const s = onlineState();
    return s.chat.filter((m) => m.uid !== s.uid).length - seen;
  }
  function markRead() {
    const s = onlineState();
    seen = s.chat.filter((m) => m.uid !== s.uid).length;
  }

  const off = onOnlineChange(render);
  render();
  markRead();
  return { el, render, unread, markRead, focus: () => input.focus(), destroy: off };
}
