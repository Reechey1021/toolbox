// screens/voice.js
// The Voice assistant tab: start and stop listening, what it heard and did,
// examples from your own library, and settings. Listening carries on while you
// use the other tabs.

import { h, replaceChildren } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { switchRow } from "../ui/components.js";
import { mapById } from "../data/maps.js";
import { nameOf, TYPES } from "../data/tags.js";
import { WAKE_WORDS } from "../data/voice.js";
import { listLineups } from "../services/library.js";
import { voiceSupport, voiceState, voiceSettings, saveVoiceSettings, startVoice, stopVoice, onVoice, voiceContext, setVoiceContext } from "../services/voice.js";
import { lastRequest, onAssistant, chooseResult } from "../services/assistant.js";
import { MAPS } from "../data/maps.js";
import { createMapPanel } from "./parts/mapPanel.js";
import { createSpawnPanel } from "./parts/spawnPanel.js";

export async function voiceScreen() {
  const support = voiceSupport();
  const lib = await listLineups();
  const mic = h("button", { class: "vmic", type: "button", "aria-pressed": "false" });
  const status = h("p", { class: "vstatus", "aria-live": "polite" });
  const heard = h("p", { class: "vheard" });
  const lastBox = h("div", { class: "vlast" });

  // What you're playing: requests assume this map and side.
  const mapSel = h("select", { class: "field select", "aria-label": "Map you're playing", onchange: (e) => setVoiceContext({ map: e.target.value }) });
  const sideSel = h("select", { class: "field select", "aria-label": "Side you're on", onchange: (e) => setVoiceContext({ side: e.target.value }) });
  function paintContext() {
    const c = voiceContext();
    mapSel.replaceChildren(h("option", { value: "" }, "The map on screen"), ...MAPS.map((m) => h("option", { value: m.id, selected: c.map === m.id }, m.name)));
    sideSel.replaceChildren(...[["", "Either side"], ["T", "T side"], ["CT", "CT side"]].map(([v, n]) => h("option", { value: v, selected: c.side === v }, n)));
    mapSel.value = c.map;
    sideSel.value = c.side;
  }
  paintContext();
  const ctxHint = h("p", { class: "muted" });
  const paintCtxHint = () => (ctxHint.textContent = `Requests assume these, so \u201c${voiceSettings().wakeLabel}, window smoke\u201d is enough. Or say \u201c${voiceSettings().wakeLabel}, I'm on Mirage CT side\u201d.`);
  paintCtxHint();

  function paint() {
    const { state, error, listening } = voiceState();
    const wake = voiceSettings().wakeLabel;
    mic.classList.toggle("is-on", listening);
    mic.classList.toggle("is-armed", state === "armed");
    mic.setAttribute("aria-pressed", String(listening));
    replaceChildren(mic, icon("mic", { size: 40 }), h("span", { class: "vmic__label" }, listening ? "Stop listening" : "Start listening"));
    status.textContent = error || { off: "Not listening.", starting: "Starting the microphone…", listening: `Listening. Say \u201c${wake}\u201d, then what you need.`, armed: "Go ahead…", error: "" }[state];
    status.classList.toggle("is-error", Boolean(error));
  }
  mic.addEventListener("click", () => (voiceState().listening ? stopVoice() : startVoice()));

  function paintLast() {
    const r = lastRequest();
    if (!r) return replaceChildren(lastBox, h("p", { class: "muted" }, "Your last request shows here."));
    const q = r.query || {};
    const chip = (label, value) => (value ? h("span", { class: "vchip" }, h("span", { class: "vchip__k" }, label), value) : null);
    replaceChildren(
      lastBox,
      h("p", { class: "vlast__said" }, `\u201c${r.text}\u201d`),
      h("div", { class: "vchips" }, chip("Map", q.map ? mapById(q.map)?.name : null), chip("Grenade", q.type ? nameOf(TYPES, q.type) : null), chip("Lands at", q.dest), chip("From", q.origin)),
      r.outcome === "control"
        ? h("p", { class: "vlast__out" }, icon("check", { size: 16 }), r.note)
        : r.outcome === "context"
        ? h("p", { class: "vlast__out" }, icon("check", { size: 16 }), `Now playing: ${[r.context.map ? mapById(r.context.map)?.name : "the map on screen", r.context.side ? `${r.context.side} side` : "either side"].join(", ")}`)
        : r.outcome === "opened"
        ? h("p", { class: "vlast__out" }, icon("play", { size: 16 }), `Opened ${r.results[r.index].lineup.name}`)
        : r.outcome === "choose"
          ? h("div", { class: "vlast__choose" }, h("p", { class: "muted" }, `Not sure which. Say the number (\u201ctwo\u201d, or \u201c${voiceSettings().wakeLabel}, 2\u201d), tap one, or be more specific:`), r.results.map((x, i) => h("button", { class: "btn btn--quiet vpick", type: "button", onclick: () => chooseResult(i) }, h("span", { class: "vpicks__n" }, i + 1), h("span", null, x.lineup.name))))
          : h("p", { class: "vlast__out is-none" }, "Nothing matched. Try naming where it lands, like \u201cwindow smoke\u201d.")
    );
  }

  const s = voiceSettings();
  const wakeSel = h(
    "select",
    { class: "field select", "aria-label": "Wake word", onchange: (e) => saveVoiceSettings({ wakeId: e.target.value }) },
    WAKE_WORDS.map((w) => h("option", { value: w.id, selected: s.wakeId === w.id }, w.label))
  );
  const langSel = h(
    "select",
    { class: "field select", "aria-label": "Language", onchange: (e) => saveVoiceSettings({ lang: e.target.value }) },
    [["en-GB", "English (UK)"], ["en-US", "English (US)"], ["en-AU", "English (Australia)"], ["en-IE", "English (Ireland)"]].map(([v, n]) => h("option", { value: v, selected: s.lang === v }, n))
  );

  // Examples from the library itself, in your wake word, so they're things you can really ask for.
  const howBox = h("div", { class: "vhow" });
  function paintHow() {
    const w = voiceSettings().wakeLabel;
    const say = (x) => `\u201c${w}, ${x}\u201d`;
    const examples = lib.length
      ? lib.slice(0, 3).map((l) => say(`${mapById(l.map)?.name.toLowerCase()} ${l.dest.toLowerCase()} ${l.type === "he" ? "HE" : l.type} from ${l.origin.toLowerCase()}`))
      : [say("mirage window smoke from t spawn"), say("jungle smoke"), say("ct side molly into firebox")];
    replaceChildren(
      howBox,
      h("p", null, "Say the wake word, then where it lands, the grenade, and where it's thrown from. The map and side you've picked above are assumed."),
      h("ul", { class: "vexamples" }, examples.map((x) => h("li", null, x))),
      h("p", { class: "muted" }, `Or just say \u201c${w}\u201d: after the beep, you have six seconds to ask. \u201cT spawn to window smoke\u201d works too.`),
      h("p", null, h("strong", null, "Change what you're playing: "), [say("I'm on Mirage"), say("I'm on Mirage CT side"), say("T side")].join(", "), "."),
      h("p", null, h("strong", null, "While a clip is open: "), [say("close"), "\u201cagain\u201d", "\u201cslower\u201d", "\u201cfaster\u201d", "\u201cnext\u201d"].join(", "), " (the next-best match).")
    );
  }
  paintHow();

  const off1 = onVoice((ev) => {
    if (ev.type === "heard") heard.textContent = ev.text;
    else if (ev.type === "context") paintContext();
    else {
      paint();
      paintHow();
      paintCtxHint();
      wakeSel.value = voiceSettings().wakeId;
    }
  });
  const off2 = onAssistant(paintLast);
  paint();
  paintLast();

  // Right-hand side: the map you've locked, with its lineups, and your side's spawns.
  const mapSide = h("div", { class: "vmapcol" });
  let panel = null;
  let spawnP = null;
  let shownKey = "";
  async function paintMapSide() {
    const c = voiceContext();
    const k = `${c.map}|${c.side}`;
    if (k === shownKey) return;
    shownKey = k;
    panel?.destroy();
    spawnP?.destroy();
    panel = spawnP = null;
    const map = c.map ? mapById(c.map) : null;
    if (!map) {
      return replaceChildren(mapSide, h("div", { class: "vmapcol__empty" }, h("p", null, "Pick a map under \u201cWhat you're playing\u201d and it shows here, with its lineups and spawns."), h("p", { class: "muted" }, "Requests on this tab stick to that map and side. The voice pill on other tabs listens for anything.")));
    }
    panel = createMapPanel(map, { tools: "compact", side: c.side || null });
    // The map's name and its toolbar share one row, level with the page heading.
    const top = h("div", { class: "vmapcol__top" }, h("h2", { class: "vmapcol__title" }, map.name, c.side ? h("span", { class: `sidetag sidetag--${c.side === "T" ? "t" : "ct"}` }, c.side) : null));
    const parts = [top, panel.el];
    if (c.side) {
      spawnP = createSpawnPanel(map, c.side, { lineups: await listLineups(map.id) });
      parts.push(spawnP.el);
    } else parts.push(h("p", { class: "muted vmapcol__note" }, "Pick your side to see its numbered spawns for instant smokes."));
    replaceChildren(mapSide, ...parts);
  }
  paintMapSide();
  const offCtx = onVoice((ev) => ev.type === "context" && paintMapSide());

  const fold = (title, ...body) => h("details", { class: "addsec vfold" }, h("summary", { class: "vfold__sum" }, h("span", { class: "addsec__title" }, title)), h("div", { class: "vfold__body" }, ...body));
  const el = h(
    "main",
    { class: "page cs-page voicepage" },
    h(
      "div",
      { class: "vgrid" },
      h(
        "div",
        { class: "vcol" },
        h("header", { class: "cs-head" }, h("p", { class: "cs-kicker" }, "Chrome and Edge"), h("h1", { class: "cs-title" }, "Voice assistant")),
        support.ok ? null : h("div", { class: "vwarn" }, icon("info", { size: 20 }), h("span", null, support.reason)),
        h("section", { class: "vpanel" }, mic, status, h("p", { class: "vheard__label" }, "Hearing"), heard),
        h(
          "section",
          { class: "addsec" },
          h("h2", { class: "addsec__title" }, "What you're playing"),
          h("div", { class: "vctx" }, h("div", { class: "addfield" }, h("span", { class: "addfield__label" }, "Map"), mapSel), h("div", { class: "addfield" }, h("span", { class: "addfield__label" }, "Side"), sideSel)),
          ctxHint
        ),
        h("section", { class: "addsec" }, h("h2", { class: "addsec__title" }, "Last request"), lastBox),
        fold("Tutorial", howBox),
        fold(
          "Settings",
          h("div", { class: "addfield" }, h("span", { class: "addfield__label" }, "Wake word"), wakeSel, h("span", { class: "addfield__hint muted" }, "Pick one that nobody says during a match. It follows your account; change it on your profile too.")),
          h("div", { class: "addfield" }, h("span", { class: "addfield__label" }, "Language"), langSel),
          h("div", { class: "rows" }, switchRow({ label: "Beeps", hint: "A tone when it hears the wake word, and when it finds a lineup.", checked: s.sounds, onChange: (v) => saveVoiceSettings({ sounds: v }) })),
          h("p", { class: "muted vprivacy" }, "Chrome and Edge turn speech into text using Google's and Microsoft's speech services, so it needs the internet. Only speech after the wake word is acted on.")
        )
      ),
      mapSide
    )
  );
  return {
    el,
    title: "Voice assistant",
    destroy() {
      off1();
      off2();
      offCtx();
      panel?.destroy();
      spawnP?.destroy();
    },
  };
}
