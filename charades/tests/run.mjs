// node charades/tests/run.mjs
import { TOPICS } from "../js/topics.js";
import { parseWords } from "../js/store.js";
let passed = 0, failed = 0;
const ok = (c, m) => (c ? passed++ : (failed++, console.log("  FAIL", m)));
ok(TOPICS.length >= 6 && TOPICS.every((t) => t.words.length >= 30), "built-in topics, 30+ words each");
ok(TOPICS.every((t) => new Set(t.words.map((w) => w.toLowerCase())).size === t.words.length), "no repeats within a topic");
const w = parseWords("Cat\nDog, Fish\n\n  cat  \nBig   Ben");
ok(JSON.stringify(w) === JSON.stringify(["Cat", "Dog", "Fish", "Big Ben"]), `words: one per line or commas, tidied, no repeats: ${JSON.stringify(w)}`);
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
