// services/caller.js
// The match caller. Plays the recorded clips in /audio back to back:
//   "sixty"                          after a visit
//   "no score"                       after a bust or a zero
//   "Marie, you require 32"          when the next player is on a finish
//   "game shot" / "game shot and the match, congratulations"
//
// Web Audio is used so clips can be trimmed of MP3 padding and scheduled
// gaplessly. iOS only allows audio after a tap, so unlock() is called from the
// first user gesture (see main.js).

import { getSettings, onSettingsChange } from "./settings.js";
import { recordingFor, callerNames } from "./names.js";

const BASE = new URL("../../audio/", import.meta.url);

// Name clips come from whatever is in audio/names (see names.js).

const pad3 = (n) => String(n).padStart(3, "0");
const clipUrl = (path) => new URL(`${path}.mp3`, BASE).href;

export const clips = {
  number: (n) => (Number.isInteger(n) && n >= 1 && n <= 180 ? `numbers/${pad3(n)}` : null),
  name: (name) => {
    const file = recordingFor(name);
    return file ? `names/${file}` : null;
  },
  noScore: "phrases/no_score",
  require: "phrases/require",
  gameShot: "phrases/GameShot",
  gameShotMatch: "phrases/GameShotMatch",
  congratulations: "phrases/Congratulations",
  throwFirst: "phrases/ThrowFirst",
  gameOn: "phrases/match_start",
  nemesisGameOn: "phrases/nemesis_gameon",
  nemesisRequires: "phrases/nemesis_requires",
  nemesisLeg: "phrases/nemesis_gameend",
  nemesisMatch: "phrases/nemesis_matchend",
};

let ctx = null;
let gain = null;
let unlocked = false;
let token = 0;
let playing = [];
const cache = new Map(); // path -> Promise<{ buffer, start, duration } | null>

function audioContextClass() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function ensureContext() {
  if (ctx) return ctx;
  const AC = audioContextClass();
  if (!AC) return null;
  ctx = new AC();
  gain = ctx.createGain();
  gain.gain.value = getSettings().callerVolume;
  gain.connect(ctx.destination);
  return ctx;
}

onSettingsChange((s) => {
  if (gain) gain.gain.value = s.callerVolume;
  if (!s.callerEnabled) stop();
});

// Call from a user gesture. Safe to call repeatedly.
export function unlock() {
  const c = ensureContext();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  if (!unlocked) {
    // A silent blip is what actually unlocks playback on older iOS.
    const b = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = b;
    src.connect(c.destination);
    src.start(0);
    unlocked = true;
    // Warm up the clips used most.
    [clips.require, clips.noScore, clips.gameShot].forEach(load);
  }
}

function decode(c, data) {
  return new Promise((resolve, reject) => {
    const p = c.decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === "function") p.then(resolve, reject);
  });
}

// Find where the sound actually starts and stops, ignoring encoder padding.
function trim(buffer) {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const CHUNK = 256;
  const THRESH = 0.02;
  const loud = (i) => {
    let m = 0;
    const end = Math.min(data.length, i + CHUNK);
    for (let j = i; j < end; j++) {
      const a = Math.abs(data[j]);
      if (a > m) m = a;
    }
    return m > THRESH;
  };
  let first = 0;
  while (first < data.length && !loud(first)) first += CHUNK;
  let last = data.length - CHUNK;
  while (last > first && !loud(last)) last -= CHUNK;
  if (first >= data.length) return { start: 0, duration: buffer.duration };
  const start = Math.max(0, first / sr - 0.015);
  const end = Math.min(buffer.duration, (last + CHUNK) / sr + 0.04);
  return { start, duration: Math.max(0.05, end - start) };
}

function load(path) {
  if (!path) return Promise.resolve(null);
  if (cache.has(path)) return cache.get(path);
  const c = ensureContext();
  const p = (async () => {
    if (!c) return null;
    try {
      const res = await fetch(clipUrl(path));
      if (!res.ok) return null;
      const buffer = await decode(c, await res.arrayBuffer());
      return { buffer, ...trim(buffer) };
    } catch {
      return null;
    }
  })();
  cache.set(path, p);
  return p;
}

export function stop() {
  token++;
  for (const s of playing) {
    try {
      s.stop();
    } catch {
      /* already stopped */
    }
  }
  playing = [];
}

// Play a sequence. Each step is a clip path, or { clip, pause } to add a pause after it.
export async function say(steps) {
  const s = getSettings();
  if (!s.callerEnabled) return;
  const list = steps.map((x) => (typeof x === "string" ? { clip: x, pause: 0 } : x)).filter((x) => x && x.clip);
  if (!list.length) return;
  const c = ensureContext();
  if (!c) return;
  stop();
  const mine = token;
  const loaded = await Promise.all(list.map((x) => load(x.clip)));
  if (mine !== token) return; // something newer started
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      return;
    }
  }

  let t = c.currentTime + 0.04;
  loaded.forEach((clip, i) => {
    if (!clip) return;
    const src = c.createBufferSource();
    src.buffer = clip.buffer;
    src.connect(gain);
    src.start(t, clip.start, clip.duration);
    src.onended = () => {
      playing = playing.filter((p) => p !== src);
    };
    playing.push(src);
    t += clip.duration + 0.04 + (list[i].pause || 0);
  });
}

// ---------------------------------------------------------------------------
// What gets said when
// ---------------------------------------------------------------------------

export function announceLegStart(starterName, { nemesis = false } = {}) {
  if (nemesis) return say([clips.nemesisGameOn]);
  const name = clips.name(starterName);
  return say(name ? [name, clips.throwFirst] : [clips.gameOn]);
}

// outcome: the scored visit. next: the player up next and their position.
export function announceVisit({ outcome, legWon, matchWon, winnerName, next, byNemesis = false }) {
  const steps = [];
  const scored = outcome.bust ? 0 : (outcome.raw ?? outcome.counted); // call what was thrown

  if (legWon && byNemesis) return say([matchWon ? clips.nemesisMatch : clips.nemesisLeg]);

  if (legWon) {
    if (matchWon) {
      steps.push({ clip: clips.gameShotMatch, pause: 0.15 });
      const n = clips.name(winnerName);
      if (n) steps.push(n);
      steps.push(clips.congratulations);
    } else {
      steps.push(clips.gameShot);
    }
    return say(steps);
  }

  steps.push({ clip: scored > 0 ? clips.number(scored) : clips.noScore, pause: 0.3 });

  if (next && next.onFinish && getSettings().callerRemaining) {
    if (next.nemesis) {
      steps.push(clips.nemesisRequires);
    } else {
      const n = clips.name(next.name);
      if (n) steps.push(n);
      steps.push(clips.require);
    }
    steps.push(clips.number(next.remaining));
  }
  return say(steps);
}

// ---------------------------------------------------------------------------
// Offline: save every clip so the caller works with no signal.
// Uses the same cache as the offline worker (sw.js), so either can serve them.
// ---------------------------------------------------------------------------

const AUDIO_CACHE = "darts-audio-v1";

export function allClipUrls() {
  const paths = [];
  for (let n = 1; n <= 180; n++) paths.push(clips.number(n));
  for (const file of callerNames()) paths.push(`names/${file}`);
  paths.push(clips.noScore, clips.require, clips.gameShot, clips.gameShotMatch, clips.congratulations, clips.throwFirst, clips.gameOn);
  paths.push(clips.nemesisGameOn, clips.nemesisRequires, clips.nemesisLeg, clips.nemesisMatch);
  return paths.map(clipUrl);
}

export async function offlineStatus() {
  if (!("caches" in globalThis)) return { supported: false, saved: 0, total: 0 };
  const urls = allClipUrls();
  const cache = await caches.open(AUDIO_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  return { supported: true, saved: urls.filter((u) => have.has(u)).length, total: urls.length };
}

export async function saveForOffline(onProgress = () => {}) {
  const urls = allClipUrls();
  const cache = await caches.open(AUDIO_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const todo = urls.filter((u) => !have.has(u));
  let done = urls.length - todo.length;
  let failed = 0;
  onProgress(done, urls.length);
  // A few at a time keeps it quick without flooding a weak connection.
  const queue = [...todo];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
        else failed++;
      } catch {
        failed++;
      }
      onProgress(++done, urls.length);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { total: urls.length, failed };
}

// "Richard, you require 32": how your chosen name sounds.
export function sampleName(callName) {
  const n = clips.name(callName);
  return say([...(n ? [n] : []), clips.require, clips.number(32)]);
}

export function sample() {
  return say([{ clip: clips.number(180), pause: 0.3 }, clips.require, clips.number(32)]);
}
