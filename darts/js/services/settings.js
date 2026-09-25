// services/settings.js
// App settings with sensible defaults. Saved on change; screens can subscribe.

import { kv } from "./storage.js";

const KEY = "settings";

const DEFAULTS = Object.freeze({
  callerEnabled: true,
  callerRemaining: true, // "you require 32"
  callerVolume: 0.9,
  inputMode: "keypad", // "keypad" | "darts"
  trackDoubles: true, // default for new matches
  keepAwake: true,
  haptics: true,
  lastSetup: null,
  nemesisThoughts: true, // Nemesis's thought bubbles
  lastNemesis: null, // the last Nemesis personality and match options
});

let current = { ...DEFAULTS, ...(kv.get(KEY, {}) || {}) };
const listeners = new Set();

export function getSettings() {
  return current;
}

export function getSetting(key) {
  return current[key];
}

export function setSetting(key, value) {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  kv.set(KEY, current);
  for (const fn of listeners) fn(current, key);
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetSettings() {
  current = { ...DEFAULTS };
  kv.set(KEY, current);
  for (const fn of listeners) fn(current, null);
}
