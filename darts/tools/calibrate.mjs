// node tools/calibrate.mjs
// Measures the Nemesis dart model: the average and checkout rate it produces at
// each skill level, scored through the real engine. The output is the table
// the planner uses to pick a starting skill for a target average.
import { simulateLeg } from "../js/engine/nemesis/sim.js";
import { makeRng } from "../js/engine/rng.js";
import { createMatch, replay, dartsEvent } from "../js/engine/match.js";
import { matchStats } from "../js/engine/stats.js";

const LEGS = Number(process.argv[2] || 200);
const rules = { checkIn: "straight", checkOut: "double", finish: "exact", multiplier: 1 };
const profile = { consistency: 5, checkout: 5 };
const rows = [];
for (let s = 0; s <= 1.5001; s += 0.05) {
  let pts = 0, darts = 0, hit = 0, thrown = 0;
  const rng = makeRng(`cal|${s.toFixed(2)}`);
  for (let l = 0; l < LEGS; l++) {
    const leg = simulateLeg({ start: 501, rules, skill: s, profile, rng });
    const cfg = createMatch({ players: [{ id: "n" }], startScore: 501, format: { legs: 1 }, id: "cal" });
    const st = replay(cfg, leg.visits.map((d) => dartsEvent(0, d)));
    const x = matchStats(st)[0];
    pts += x.points; darts += x.darts; hit += x.doublesHit; thrown += x.doublesThrown;
  }
  rows.push([Number(s.toFixed(2)), (pts / darts) * 3, (hit / thrown) * 100]);
}
for (const [s, avg, co] of rows) console.log(`skill ${s.toFixed(2)}  avg ${avg.toFixed(1).padStart(5)}  checkout ${co.toFixed(1).padStart(5)}%`);
console.log("\nTABLE = " + JSON.stringify(rows.map(([s, a]) => [s, Number(a.toFixed(2))])));
