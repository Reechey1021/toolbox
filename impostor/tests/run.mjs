// node impostor/tests/run.mjs
import { WORDS } from "../js/words.js";
import { dealRoles } from "../js/game.js";
let passed = 0, failed = 0;
const ok = (c, m) => (c ? passed++ : (failed++, console.log("  FAIL", m)));
ok(WORDS.length >= 1000, `at least 1,000 words: ${WORDS.length}`);
ok(new Set(WORDS.map((w) => w.word.toLowerCase())).size === WORDS.length, "no duplicates");
ok(WORDS.every((w) => w.word.length > 1 && w.word.length <= 30), "sensible lengths");
// Every word has a hint, and the hint never gives it away (no shared word of 3+ letters).
const words = (s) => s.toLowerCase().replace(/[^a-z\u00e0-\u00ff' ]/g, " ").split(/\s+/).filter((x) => x.length >= 3);
const noHint = WORDS.filter((w) => !w.hint);
ok(noHint.length === 0, `every word has a hint: missing for ${noHint.map((w) => w.word).join(", ")}`);
const giveaways = WORDS.filter((w) => {
  const a = words(w.word);
  const b = words(w.hint);
  return b.some((x) => a.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)))));
});
ok(giveaways.length === 0, `no hint gives its word away: ${giveaways.map((w) => w.word + " / " + w.hint).join("; ")}`);
for (let n = 3; n <= 12; n++) {
  for (let k = 1; k <= Math.max(1, n - 2); k++) {
    const roles = dealRoles(n, k);
    ok(roles.length === n && roles.filter(Boolean).length === k, `${n} players, ${k} impostors`);
  }
}
const firsts = new Set(Array.from({ length: 200 }, () => dealRoles(5, 1).indexOf(true)));
ok(firsts.size === 5, "the impostor can be anyone");
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
