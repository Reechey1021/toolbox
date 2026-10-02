// services/voice.js
// Spoken call-outs in Hungarian, short beeps and vibration, so the important
// moments (countdown, splits, finish, each km) don't need a look at the screen.
// Speech uses the phone's own text-to-speech; on Samsung/Google phones that
// includes Hungarian. If no Hungarian voice exists, we beep instead of speaking
// Hungarian words with an English voice.

let ctx = null;
let huVoice = null;
let voicesChecked = false;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Beep: freq in Hz, ms long. Loud enough for wind noise, short enough not to annoy. */
export function beep(freq = 880, ms = 140, when = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = "square";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + ms / 1000 + 0.02);
}

export function buzz(pattern) { try { navigator.vibrate?.(pattern); } catch { /* not supported */ } }

function findVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = speechSynthesis.getVoices();
  if (voices.length) voicesChecked = true;
  huVoice = voices.find((v) => /^hu(-|_|$)/i.test(v.lang)) || null;
  return huVoice;
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  findVoice();
  speechSynthesis.addEventListener?.("voiceschanged", findVoice);
}

export const hasHungarianVoice = () => !!(huVoice || findVoice());
export const voicesKnown = () => voicesChecked;

export function speak(text, { interrupt = false } = {}) {
  if (!("speechSynthesis" in window) || !text) return false;
  const v = huVoice || findVoice();
  if (!v) return false;
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v;
  u.lang = v.lang;
  u.rate = 1.0;
  u.volume = 1;
  speechSynthesis.speak(u);
  return true;
}

/** Wake audio up from a tap (browsers only allow sound after one). */
export function unlockAudio() { audio(); }
