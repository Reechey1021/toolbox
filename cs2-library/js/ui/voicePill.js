// ui/voicePill.js
// While listening, a small pill in the corner of every tab: what state it's in
// and what it just heard. When a request is ambiguous, the choices appear above it.

import { h, replaceChildren } from "./dom.js";
import { icon } from "./icons.js";
import { onVoice, voiceState, voiceSettings } from "../services/voice.js";
import { onAssistant, chooseResult, describeContext } from "../services/assistant.js";

export function mountVoicePill() {
  const text = h("span", { class: "vpill__text" });
  const heard = h("span", { class: "vpill__heard" });
  const pill = h("a", { class: "vpill", href: "#/voice", hidden: true }, h("span", { class: "vpill__dot" }), icon("mic", { size: 16 }), h("span", { class: "vpill__body" }, text, heard));
  const picks = h("div", { class: "vpicks", hidden: true });
  document.body.append(picks, pill);
  let heardTimer = null;
  let pickTimer = null;

  function paint() {
    const { state, error, listening } = voiceState();
    pill.hidden = !listening && state !== "error";
    pill.dataset.state = state;
    const ctx = describeContext();
    text.textContent = error ? "Voice stopped" : state === "armed" ? "Go ahead…" : state === "starting" ? "Starting…" : `Say \u201c${voiceSettings().wakeLabel}\u201d${ctx ? ` \u00b7 ${ctx}` : ""}`;
  }

  onVoice((ev) => {
    if (ev.type === "heard") {
      heard.textContent = ev.text;
      clearTimeout(heardTimer);
      heardTimer = setTimeout(() => (heard.textContent = ""), 4000);
    } else paint();
  });

  onAssistant((r) => {
    clearTimeout(pickTimer);
    if (r?.outcome !== "choose") return (picks.hidden = true);
    replaceChildren(
      picks,
      h("p", { class: "vpicks__title" }, "Which one?"),
      r.results.map((x, i) => h("button", { class: "vpicks__btn", type: "button", onclick: () => ((picks.hidden = true), chooseResult(i)) }, x.lineup.name))
    );
    picks.hidden = false;
    pickTimer = setTimeout(() => (picks.hidden = true), 15000);
  });
  paint();
}
