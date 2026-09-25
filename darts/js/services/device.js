// services/device.js
// Small device conveniences, all optional and all fail quietly where unsupported.

import { getSettings } from "./settings.js";

// ---------------------------------------------------------------------------
// Keep the screen on during a match (a phone dimming mid-leg is the worst).
// ---------------------------------------------------------------------------

let lock = null;
let wanted = false;

async function acquire() {
  if (!wanted || lock || document.visibilityState !== "visible") return;
  if (!("wakeLock" in navigator) || !getSettings().keepAwake) return;
  try {
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => {
      lock = null;
    });
  } catch {
    lock = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") acquire();
});

export function keepAwake(on) {
  wanted = on;
  if (on) acquire();
  else if (lock) {
    lock.release().catch(() => {});
    lock = null;
  }
}

// ---------------------------------------------------------------------------
// A tiny tap of vibration on key presses (Android; iOS ignores it).
// ---------------------------------------------------------------------------

export function tap(ms = 8) {
  if (!getSettings().haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

// ---------------------------------------------------------------------------
// Save a file to the device.
// ---------------------------------------------------------------------------

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(JSON.parse(await file.text()));
      } catch {
        reject(new Error("That file couldn't be read as a backup"));
      }
    };
    input.click();
  });
}
