// screens/parts/voicePanel.js
// The voice input panel: a big microphone in the middle, what it heard, and
// always-listen or tap-to-talk. Element ids are the ones the voice engine
// (services/voice.js, from the original app) drives.

import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";

export function voicePanel() {
  const mode = h(
    "select",
    { id: "voiceAutoMode", class: "field select voice__mode", "aria-label": "Microphone" },
    h("option", { value: "always" }, "Always listen"),
    h("option", { value: "push" }, "Tap to talk")
  );
  return h(
    "div",
    { class: "voicepanel" },
    h(
      "button",
      { id: "voiceMicBtn", class: "voicemic", type: "button", "aria-pressed": "false" },
      h("span", { class: "voicemic__icon" }, icon("mic", { size: 44 })),
      h("span", { class: "voiceMicLabel" }, "Tap & Speak")
    ),
    h("p", { id: "voiceStatus", class: "voice__status", "aria-live": "polite" }, "Tap & Speak"),
    h("p", { id: "voiceHeard", class: "voice__heard" }),
    h("label", { class: "voice__modewrap" }, h("span", { class: "muted" }, "Microphone"), mode),
    h("p", { id: "voiceEngine", class: "voice__engine faint" })
  );
}
