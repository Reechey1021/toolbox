// services/voice.js
// Listening, built for Chrome and Edge (their speech recognition is excellent;
// most other browsers don't have it, and Opera GX pretends to). The page must be
// open and on screen: a second monitor is perfect.
//
// Always listening once started. Speech only counts when it starts with a wake
// word ("lineup" by default). Say it all at once ("lineup, mirage window smoke"),
// or just the wake word: a short beep, then you have a few seconds to ask.
//
// Chrome ends sessions on its own (silence, network blips), so this restarts
// quietly, waiting longer each time if something keeps failing.

import { afterWake, wakeById } from "../data/voice.js";
import { prefs } from "./store.js";
import { preferences, setPreferences, onPlayback } from "./playback.js";

const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const ARMED_MS = 6000;

let rec = null;
let want = false;
let state = "off"; // "off" | "starting" | "listening" | "armed" | "error"
let armedUntil = 0;
let restartTimer = null;
let failures = 0;
let lastError = "";
let audio = null;
const listeners = new Set();

// The wake word is one of your preferences (it follows your account); language and
// beeps stay on this device.
export function voiceSettings() {
  const w = wakeById(preferences().wakeId);
  return {
    wakeId: w.id,
    wakeLabel: w.label,
    wake: w.phrases,
    lang: prefs.get("voiceLang", "en-GB"),
    sounds: prefs.get("voiceSounds", true),
  };
}
export function saveVoiceSettings(next) {
  if (next.wakeId) setPreferences({ wakeId: next.wakeId });
  if (next.lang) prefs.set("voiceLang", next.lang);
  if (next.sounds !== undefined) prefs.set("voiceSounds", next.sounds);
  if (next.lang && want) restart(0); // pick up a new language
  emit({ type: "state", state, error: lastError });
}

// What you're playing: the map and side requests assume. Set on the Voice tab or by
// saying "lineup, I'm on Mirage CT side". map "" = the map on screen; side "" = either.
export function voiceContext() {
  return { map: prefs.get("voiceMap", ""), side: prefs.get("voiceSide", "") };
}
export function setVoiceContext(next) {
  const c = { ...voiceContext(), ...next };
  prefs.set("voiceMap", c.map);
  prefs.set("voiceSide", c.side);
  emit({ type: "context", context: c });
}

// Can this browser do it? { ok, reason }
export function voiceSupport() {
  const ua = navigator.userAgent || "";
  if (!Ctor) return { ok: false, reason: "This browser can't do speech recognition. Use Chrome or Edge." };
  if (/OPR\/|Opera|OPX\//.test(ua)) return { ok: false, reason: "Opera (including GX) says it supports speech, but it doesn't work. Use Chrome or Edge." };
  if (navigator.brave) return { ok: false, reason: "Brave blocks Google's speech service. Use Chrome or Edge." };
  return { ok: true, reason: "" };
}

export function onVoice(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (ev) => listeners.forEach((fn) => fn(ev));
function setState(s, extra = {}) {
  state = s;
  emit({ type: "state", state, error: lastError, ...extra });
}
export const voiceState = () => ({ state, error: lastError, listening: want });

// A short tone: heard the wake word, or found a lineup.
export function beep(kind = "armed") {
  if (!voiceSettings().sounds) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = kind === "armed" ? 880 : kind === "found" ? 1175 : 330;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.14);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.16);
  } catch {
    /* no audio: fine */
  }
}

// After a question ("which one?"), the next few seconds need no wake word.
export function armVoice() {
  if (want) arm();
}

function arm() {
  armedUntil = Date.now() + ARMED_MS;
  beep("armed");
  setState("armed");
  setTimeout(() => state === "armed" && Date.now() >= armedUntil && setState("listening"), ARMED_MS + 50);
}

// A finished phrase, with the engine's alternative transcriptions.
function heardFinal(alts) {
  const { wake } = voiceSettings();
  const rests = alts.map((a) => afterWake(a, wake));
  const addressed = rests.filter((r) => r !== null);
  if (addressed.length) {
    const asked = addressed.filter(Boolean);
    if (!asked.length) return arm(); // just the wake word
    armedUntil = 0;
    setState("listening");
    return emit({ type: "command", texts: asked, raw: alts[0] });
  }
  if (Date.now() < armedUntil) {
    armedUntil = 0;
    setState("listening");
    return emit({ type: "command", texts: alts, raw: alts[0] });
  }
  // Not for us: ignore.
}

function build() {
  const r = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 3;
  r.lang = voiceSettings().lang;
  r.onstart = () => {
    failures = 0;
    lastError = "";
    setState(Date.now() < armedUntil ? "armed" : "listening");
  };
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const alts = Array.from(res, (a) => a.transcript.trim()).filter(Boolean);
      if (!alts.length) continue;
      emit({ type: "heard", text: alts[0], final: res.isFinal });
      if (res.isFinal) heardFinal(alts);
    }
  };
  r.onerror = (e) => {
    const code = e.error;
    if (code === "no-speech" || code === "aborted") return; // normal: onend restarts
    if (code === "not-allowed" || code === "service-not-allowed") {
      want = false;
      lastError = "The microphone is blocked. Click the lock icon in the address bar, allow the microphone, then start again.";
      return setState("error");
    }
    if (code === "audio-capture") {
      want = false;
      lastError = "No microphone found. Plug one in, then start again.";
      return setState("error");
    }
    if (code === "language-not-supported") {
      want = false;
      lastError = "That language isn't supported here. Pick another in the settings.";
      return setState("error");
    }
    failures++;
    lastError = code === "network" ? "Can't reach the speech service (it needs the internet). Retrying…" : `Speech stopped (${code}). Retrying…`;
    emit({ type: "state", state, error: lastError });
  };
  r.onend = () => {
    rec = null;
    if (want) restart(failures ? Math.min(15000, 1000 * 2 ** (failures - 1)) : 250);
    else setState("off");
  };
  return r;
}

function restart(delay) {
  clearTimeout(restartTimer);
  if (rec) {
    try {
      rec.onend = null;
      rec.abort();
    } catch {
      /* already stopped */
    }
    rec = null;
  }
  restartTimer = setTimeout(() => {
    if (!want) return;
    try {
      rec = build();
      rec.start();
    } catch {
      restart(1000);
    }
  }, delay);
}

// Start listening (call from a click: browsers need that for the microphone).
export function startVoice() {
  const s = voiceSupport();
  if (!s.ok) {
    lastError = s.reason;
    return setState("error");
  }
  want = true;
  lastError = "";
  beep("armed"); // also unlocks audio on this click
  setState("starting");
  restart(0);
}

export function stopVoice() {
  want = false;
  armedUntil = 0;
  clearTimeout(restartTimer);
  try {
    rec?.stop();
  } catch {
    /* fine */
  }
  if (!rec) setState("off");
}

let lastWake = preferences().wakeId;
onPlayback((p) => {
  if (p.wakeId === lastWake) return;
  lastWake = p.wakeId;
  emit({ type: "state", state, error: lastError });
});
