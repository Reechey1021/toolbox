// engine/nemesis/index.js
// The only Nemesis module the rest of the app talks to.
//
// Nemesis is a player like any other, marked with a `bot` field:
//   { id: "nemesis", name: "Nemesis", bot: { kind: "nemesis", profile } }
// so it can sit in any seat: your one-on-one rival, one of the players in a
// local game, or someone's partner in teams.
//
// On its own side it plays a pre-planned leg (see planner.js). As a partner,
// the shared score depends on someone else's darts too, so it plans one visit
// at a time from wherever the score is.

import { makeRng, gaussian } from "../rng.js";
import { legsToWin } from "../match.js";
import { planLeg, skillFor } from "./planner.js";
import { simulateVisit } from "./sim.js";
import { finishMultiplier, formSpread, SKILL_MAX } from "./thrower.js";
import { cleanProfile } from "./profile.js";

export const NEMESIS_ID = "nemesis";
export const NEMESIS_NAME = "Nemesis";

export function makeNemesisPlayer(profile) {
  return { id: NEMESIS_ID, name: NEMESIS_NAME, bot: { kind: "nemesis", profile: cleanProfile(profile) } };
}

export const isBot = (player) => Boolean(player?.bot);

export function botIndex(cfg) {
  return cfg.players.findIndex(isBot);
}

export function isBotTurn(state) {
  if (state.finished) return false;
  const leg = state.legs[state.legs.length - 1];
  return isBot(state.cfg.players[leg.thrower]);
}

export function profileOf(cfg, p) {
  return cleanProfile(cfg.players[p]?.bot?.profile);
}

// ---------------------------------------------------------------------------
// The next visit
// ---------------------------------------------------------------------------

const plans = new Map();
const MAX_PLANS = 40;

function planFor(state, leg, side, player) {
  const cfg = state.cfg;
  const profile = profileOf(cfg, player);
  const legsFor = state.legsWon[side];
  const legsAgainst = Math.max(0, ...state.legsWon.filter((_, i) => i !== side));
  const key = `${cfg.id}|${leg.index}|${player}|${JSON.stringify(profile)}|${legsFor}-${legsAgainst}|${state.rules[side].startScore}`;
  if (!plans.has(key)) {
    if (plans.size >= MAX_PLANS) plans.delete(plans.keys().next().value);
    plans.set(
      key,
      planLeg({
        seed: `${key}|plan`,
        start: state.rules[side].startScore,
        rules: state.rules[side],
        profile,
        legsFor,
        legsAgainst,
        need: legsToWin(cfg),
      })
    );
  }
  return plans.get(key);
}

// The darts Nemesis throws for the current visit. Only call when it's Nemesis's turn.
export function nemesisVisit(state) {
  const cfg = state.cfg;
  const leg = state.legs[state.legs.length - 1];
  const side = leg.current;
  const player = leg.thrower;
  const alone = state.sides[side].players.length === 1;

  if (alone) {
    const plan = planFor(state, leg, side, player);
    const k = leg.visits.filter((v) => v.player === player).length;
    if (k < plan.visits.length) return plan.visits[k];
  }

  // Partner (or a plan that ran out): one visit from wherever the score is.
  const profile = profileOf(cfg, player);
  const rng = makeRng(`${cfg.id}|${leg.index}|${player}|visit${leg.visits.length}`);
  const skill = Math.max(0, Math.min(SKILL_MAX, skillFor(profile.target) + gaussian(rng) * formSpread(profile.consistency)));
  return simulateVisit({
    start: leg.remaining[side],
    checkedIn: leg.checkedIn[side],
    rules: state.rules[side],
    skill,
    rng,
    finishMult: finishMultiplier(profile.checkout),
  }).darts;
}

// Its plan for this leg, if it has one (for the thought bubbles).
export function nemesisLegTarget(state) {
  const leg = state.legs[state.legs.length - 1];
  const p = state.cfg.players.findIndex(isBot);
  if (p < 0) return null;
  const side = state.sides.findIndex((s) => s.players.includes(p));
  if (state.sides[side].players.length !== 1) return profileOf(state.cfg, p).target;
  return planFor(state, leg, side, p).target;
}

// ---------------------------------------------------------------------------
// Throwing for the bull
// ---------------------------------------------------------------------------
// Scatter shrinks as the average rises: roughly 38 mm at a 30 average,
// 21 mm at 60 and 11 mm at 90 (one standard deviation, in each direction).

export function nemesisBullThrow(cfg, player, attempt = 0) {
  const target = profileOf(cfg, player).target;
  const sigma = 38 * Math.pow(0.55, (target - 30) / 30);
  const rng = makeRng(`${cfg.id}|bull|${attempt}`);
  return { x: gaussian(rng) * sigma, y: gaussian(rng) * sigma };
}
