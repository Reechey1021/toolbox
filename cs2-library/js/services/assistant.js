// services/assistant.js
// What happens when you ask for something: controls for the clip that's open
// ("close", "again", "slower", "next"), or a lineup search that opens the best
// match, or offers the top few when it isn't sure.

import { onVoice, beep, voiceContext, setVoiceContext } from "./voice.js";
import { listLineups } from "./library.js";
import { matchRequest, controlFor, contextFor } from "../data/voice.js";
import { mapById } from "../data/maps.js";
import { setShowCallouts } from "./labels.js";
import { openPlayer, activePlayer } from "../screens/player.js";
import { currentPath } from "../ui/router.js";

const listeners = new Set();
let last = null; // { text, query, results, index, outcome }
export const lastRequest = () => last;
export function onAssistant(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(last));

// Where a request is scoped when it doesn't name a map:
//   on the Voice tab   the map and side you've locked there
//   anywhere else      the map on screen, if any (else every map), any side
const onVoiceTab = () => /^\/voice/.test(currentPath());
function scope() {
  if (onVoiceTab()) {
    const c = voiceContext();
    return { map: c.map || null, side: c.side || null };
  }
  return { map: /^\/library\/([a-z0-9_]+)/.exec(currentPath())?.[1] ?? activePlayer()?.lineup.map ?? null, side: null };
}
let lastOpened = null; // for "again" once the clip has closed

export async function handleRequest(texts) {
  const text = texts[0];
  // "I'm on Mirage CT side": change what you're playing, nothing else.
  const ctx = texts.map(contextFor).find(Boolean);
  if (ctx) {
    setVoiceContext(ctx);
    const c = voiceContext();
    last = { text, query: null, results: [], index: 0, outcome: "context", context: c };
    beep("found");
    return emit();
  }
  const control = texts.map(controlFor).find(Boolean);
  const player = activePlayer();
  if (control) {
    const said = (outcome, note) => ((last = { text, query: null, results: last?.results ?? [], index: last?.index ?? 0, outcome, note }), emit());
    if (control === "next" && last?.results?.length > 1) return showResult((last.index + 1) % last.results.length);
    if (control === "again") {
      if (player) {
        player.replay();
        return said("control", "Playing it again");
      }
      if (lastOpened) {
        beep("found");
        said("control", `Opened ${lastOpened.name} again`);
        return openPlayer(lastOpened);
      }
      return said("control", "Nothing to show again yet");
    }
    if (control === "callouts-on" || control === "callouts-off") {
      setShowCallouts(control === "callouts-on");
      beep("found");
      return said("control", control === "callouts-on" ? "Showing callouts" : "Hiding callouts");
    }
    if (!player) return said("control", "No clip is open");
    if (control === "close") player.close(), said("control", "Closed the clip");
    if (control === "slower") player.setSpeed(0.5), said("control", "Slowed it down");
    if (control === "faster") player.setSpeed(1), said("control", "Back to full speed");
    if (control === "next") said("control", "No other matches");
    return;
  }

  // Every alternative transcription gets a go; the best top score wins.
  const lineups = await listLineups();
  let pick = null;
  for (const t of texts) {
    const m = matchRequest(lineups, t, scope());
    if (!pick || (m.results[0]?.score ?? -99) > (pick.results[0]?.score ?? -99)) pick = { ...m, text: t };
  }
  const results = (pick?.results ?? []).filter((r) => r.score > 1).slice(0, 4);
  last = { text: pick?.text ?? text, query: pick?.query ?? null, results, index: 0, outcome: "" };
  if (!results.length) {
    last.outcome = "none";
    beep("none");
    return emit();
  }
  if (pick.confident) return showResult(0);
  last.outcome = "choose";
  emit();
}

async function showResult(i) {
  last.index = i;
  last.outcome = "opened";
  const l = last.results[i].lineup;
  lastOpened = l;
  activePlayer()?.close();
  beep("found");
  emit();
  await openPlayer(l);
}

// "Mirage, CT side" for the pill and the Voice tab.
export function describeContext(c = voiceContext()) {
  const map = c.map ? mapById(c.map)?.name : null;
  const side = c.side ? `${c.side} side` : null;
  return [map, side].filter(Boolean).join(", ");
}

export function chooseResult(i) {
  return showResult(i);
}

onVoice((ev) => ev.type === "command" && handleRequest(ev.texts));
