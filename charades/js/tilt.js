// js/tilt.js
// Tilting the phone (held to your forehead, sideways): screen towards the floor
// is "down" (correct), towards the ceiling is "up" (pass). Uses gravity along
// the screen's axis, so it works whichever way round the phone is held. After a
// tilt, the phone has to come back upright before the next one counts.

const DOWN = -7; // m/s², screen facing the floor
const UP = 7; // screen facing the ceiling
const LEVEL = 3.5; // back upright
// iPhones report gravity the other way round.
const SIGN = /iPhone|iPad|iPod/.test(navigator.userAgent) ? -1 : 1;

export const tiltAvailable = () => typeof window.DeviceMotionEvent !== "undefined";

// iPhones ask permission (it must come from a tap). Resolves true if we can listen.
export async function enableTilt() {
  if (!tiltAvailable()) return false;
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      return (await DeviceMotionEvent.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

export function watchTilt(onTilt) {
  let armed = true;
  function motion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.z === null) return;
    const z = g.z * SIGN;
    if (armed && z < DOWN) (armed = false), onTilt("down");
    else if (armed && z > UP) (armed = false), onTilt("up");
    else if (!armed && Math.abs(z) < LEVEL) armed = true;
  }
  window.addEventListener("devicemotion", motion);
  return () => window.removeEventListener("devicemotion", motion);
}
