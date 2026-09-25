// engine/modes.js
// One place that knows every kind of match: X01 (match.js) and the arcade
// games (arcade/core.js). Anything that just needs "replay this" or "whose
// turn is it" asks here, so sessions, history and online play work for all.

import { replay, currentLeg } from "./match.js";
import { replayArcade, isArcade } from "./arcade/core.js";
import { MODES } from "./arcade/modes.js";

export { isArcade };

export function replayAny(cfg, events = []) {
  return isArcade(cfg) ? replayArcade(cfg, events) : replay(cfg, events);
}

// The player index to throw next, or null when it's over.
export function whoThrows(cfg, events = []) {
  const st = replayAny(cfg, events);
  if (st.finished) return null;
  return isArcade(cfg) ? st.turn?.player ?? null : currentLeg(st).thrower;
}

export function gameName(cfg) {
  return isArcade(cfg) ? MODES[cfg.kind].name : `${cfg.startScore}`;
}
