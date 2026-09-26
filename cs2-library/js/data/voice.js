// data/voice.js
// Turning what was said into a lineup. Pure: no microphone, no DOM, so it's all
// testable. The speech itself comes from services/voice.js.
//
//   "lineup, mirage window smoke from ct spawn"
//     wake word "lineup", then: map mirage, type smoke, landing "window", thrown from "ct spawn"
//
// Speech engines hear things their own way ("see tea", "molly", "dust two"),
// so everything is normalised first, and callouts are matched fuzzily.

import { MAPS } from "./maps.js";

// Wake words: pick one. Each has the ways speech engines tend to write it.
// The names avoid anything said in a CS match (no "scout", "nova", "flash", "site"),
// so talking to your team never sets it off.
export const WAKE_WORDS = [
  { id: "lineup", label: "Lineup", phrases: ["lineup", "line up", "line-up"] },
  { id: "nadetool", label: "Nade tool", phrases: ["nade tool", "nadetool", "made tool", "nay tool"] },
  { id: "grenadetool", label: "Grenade tool", phrases: ["grenade tool", "grenades tool"] },
  { id: "jarvis", label: "Jarvis", phrases: ["jarvis", "hey jarvis", "jervis"] },
  { id: "atlas", label: "Atlas", phrases: ["atlas", "hey atlas", "at last"] },
  { id: "sherpa", label: "Sherpa", phrases: ["sherpa", "hey sherpa", "sure pa"] },
  { id: "oracle", label: "Oracle", phrases: ["oracle", "hey oracle"] },
  { id: "compass", label: "Compass", phrases: ["compass", "hey compass"] },
];
export const wakeById = (id) => WAKE_WORDS.find((w) => w.id === id) ?? WAKE_WORDS[0];
export const WAKE_DEFAULTS = WAKE_WORDS[0].phrases;

// What speech engines tend to produce, mapped to one spelling.
const SWAPS = [
  [/\b(counter[\s-]?terrorists?|see tea|c t|sea tea|ct's)\b/g, "ct"],
  [/\b(terrorists?|t side|tee side|tea side)\b/g, "t"],
  [/\b(flash ?bangs?|flashes|flesh)\b/g, "flash"],
  [/\b(molly|mollie|molotovs?|molotov cocktail|incendiary|incendiaries|incend|fire)\b/g, "molotov"],
  [/\b(smokes|smoking|smoked)\b/g, "smoke"],
  [/\b(h e|h\.e\.|he grenade|hand grenade|frag|frag grenade|explosive)\b/g, "he"],
  [/\b(dust two|dust 2|dust ii|dust too|d2)\b/g, "dust2"],
  [/\b(eh site|a-site|asite)\b/g, "a site"],
  [/\b(bee site|b-site|bsite)\b/g, "b site"],
  [/\b(spawn point)\b/g, "spawn"],
  [/\b(the|please|show me|show|play|give me|i need|can i have|lineup for|line up for)\b/g, " "],
];

export function normalise(text) {
  let t = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ")} `;
  for (const [re, to] of SWAPS) t = t.replace(re, ` ${to} `);
  return t.replace(/\s+/g, " ").trim();
}

// Everything after the wake word, or null if it wasn't said.
export function afterWake(text, wakeWords = WAKE_DEFAULTS) {
  const t = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
  let best = null;
  for (const w of wakeWords) {
    const i = t.indexOf(` ${w.toLowerCase()} `);
    if (i >= 0 && (best === null || i < best.i)) best = { i, len: w.length + 2 };
  }
  return best ? t.slice(best.i + best.len).trim() : null;
}

// Spoken controls for the clip that's playing.
const CONTROLS = [
  ["close", /^(close|closed|clothes|close it|quit|exit|stop|hide|done|cancel|that's it)$/],
  ["again", /^(again|show again|show it again|replay|repeat|one more time|restart|play again)$/],
  ["slower", /^(slower|slow|slow motion|slow mo|slow it down)$/],
  ["faster", /^(faster|normal speed|full speed)$/],
  ["next", /^(next|next one|other one|another|no|wrong one|not that one)$/],
];

// "I'm on mirage", "I'm on mirage CT side", "we're T side", "CT side": set what you're playing.
// Returns { map?, side? } or null.
export function contextFor(text) {
  const t = ` ${normalise(text)} `;
  const setting = /^ (i'm|im|i am|we're|were|we are|playing|switch to|switching to|change to|now|on) /.test(t) || /^ (ct|t) side $/.test(t);
  if (!setting) return null;
  const out = {};
  for (const m of MAP_ALIASES) if (m.words.some((w) => t.includes(` ${w} `))) out.map = m.id;
  const side = / (ct|t) side /.exec(t) || / (ct|t) $/.exec(t);
  if (side) out.side = side[1] === "ct" ? "CT" : "T";
  return out.map || out.side ? out : null;
}

// "2", "two", "number two", "option 2": picking one of the numbered choices.
const PICK_WORDS = { one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6 };
export function numberFrom(text) {
  const t = normalise(text).replace(/^(number|option|choice|no) /, "");
  if (/^\d$/.test(t)) return Number(t);
  return PICK_WORDS[t] ?? null;
}

export function controlFor(text) {
  const raw = ` ${String(text || "").toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ")} `;
  const co = "(?:call ?outs?|call-outs?|callout labels?)";
  if (new RegExp(` (?:show|display|turn on|switch on|enable|see) (?:the |me the |all )?${co} `).test(raw) || new RegExp(` ${co} on `).test(raw)) return "callouts-on";
  if (new RegExp(` (?:hide|remove|turn off|switch off|disable|clear|close) (?:the |all )?${co} `).test(raw) || new RegExp(` ${co} off `).test(raw)) return "callouts-off";
  const t = normalise(text);
  return CONTROLS.find(([, re]) => re.test(t))?.[0] ?? null;
}

const MAP_ALIASES = MAPS.map((m) => ({ id: m.id, words: [m.name.toLowerCase().replace(/\s+/g, ""), m.id.replace("de_", ""), m.name.toLowerCase()] }));
const TYPE_WORDS = { smoke: "smoke", flash: "flash", molotov: "molotov", he: "he" };

const NUMBER_WORDS = { one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
// "mirage window smoke from ct spawn" -> { map, type, side, dest, origin, spawn }
export function parseRequest(text) {
  let t = ` ${normalise(text)} `;
  const out = { map: null, type: null, side: null, dest: "", origin: "", spawn: null, group: false };
  // "group": utility groups only when it's said.
  if (/ groups? /.test(t)) {
    out.group = true;
    t = t.replace(/ groups? /g, " ");
  }
  // "spawn 2" / "spawn two"; sound-alikes ("to", "for") only after "spawn number",
  // so "t spawn to window" stays a route.
  const sp = / spawn (?:number |no |position )?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten) /.exec(t) || / spawn (?:number|no|position) (won|to|too|for) /.exec(t);
  if (sp) {
    out.spawn = Number(sp[1]) || NUMBER_WORDS[sp[1]];
    t = t.replace(sp[0], " ").replace(/ from +$/, " ").replace(/ from  /g, " ");
  }
  for (const m of MAP_ALIASES) {
    const w = m.words.find((x) => t.includes(` ${x} `));
    if (w) {
      out.map = m.id;
      t = t.replace(` ${w} `, " ");
      break;
    }
  }
  for (const [word, type] of Object.entries(TYPE_WORDS)) {
    if (t.includes(` ${word} `)) {
      out.type = type;
      t = t.replace(` ${word} `, " ");
      break;
    }
  }
  // "ct side" / "t side" as a side; "ct spawn" stays a callout.
  const side = / (ct|t) side /.exec(t) || / for (ct|t) /.exec(t);
  if (side) {
    out.side = side[1] === "ct" ? "CT" : "T";
    t = t.replace(side[0], " ");
  }
  const tidy = (x) => (x || "").replace(/\b(to|into|onto|at|for|on)\b/g, " ").replace(/\s+/g, " ").trim();
  if (/ (from|off) /.test(t)) {
    const parts = t.split(/ from | off /);
    out.dest = tidy(parts[0]);
    out.origin = (parts[1] || "").replace(/\s+/g, " ").trim();
  } else if (/ to /.test(t)) {
    // "t spawn to window": thrown from the first, landing at the second.
    const [left, right] = t.split(/ to (.*)/s);
    out.origin = tidy(left);
    out.dest = tidy(right);
  } else out.dest = tidy(t);
  return out;
}

// How alike two short phrases are, 0 to 1.
function lev(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// How alike two short phrases are, 0 to 1, word by word. Short words (T, CT, A, B)
// must match exactly: "t spawn" and "ct spawn" are different places. Longer words
// can be slightly off. Speech engines swap whole words rather than letters, so
// words are what count.
function wordMatch(x, y) {
  if (x === y) return 1;
  if (Math.min(x.length, y.length) <= 2) return 0;
  const r = 1 - lev(x, y) / Math.max(x.length, y.length);
  return r >= 0.6 ? r : 0;
}
export function similarity(spoken, target) {
  const a = normalise(spoken).split(" ").filter(Boolean);
  const b = normalise(target).split(" ").filter(Boolean);
  if (!a.length || !b.length) return 0;
  const recall = b.reduce((sum, w) => sum + Math.max(...a.map((x) => wordMatch(x, w))), 0) / b.length;
  const precision = a.reduce((sum, w) => sum + Math.max(...b.map((y) => wordMatch(w, y))), 0) / a.length;
  return recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
}

// Score every lineup against a request. context.map: the map on screen, used
// when no map was said. Returns the best first, with a confidence verdict.
export function matchRequest(lineups, request, { map: contextMap = null, side: contextSide = null } = {}) {
  const parsed = typeof request === "string" ? parseRequest(request) : request;
  const q = { ...parsed, side: parsed.side || contextSide };
  const map = q.map || contextMap;
  // Instant lineups (thrown from a numbered spawn) only when a spawn number is said,
  // and then only those: "t spawn to window smoke" never offers the instant ones.
  // ...and utility groups only when "group" is said (or their name: see matchName).
  const pool = (map ? lineups.filter((l) => l.map === map) : lineups).filter((l) => (q.spawn ? Boolean(l.spawn) : !l.spawn)).filter((l) => (q.group ? l.type === "group" : l.type !== "group"));
  const scored = pool
    .map((l) => {
      let s = 0;
      const items = l.type === "group" ? l.items || [] : null;
      if (q.type) s += (items ? items.some((it) => it.type === q.type) : l.type === q.type) ? 2 : -3;
      if (items) {
        // A group: its name, or any of its utilities' landings.
        if (q.dest) {
          const d = Math.max(similarity(q.dest, l.name || "") * 4, ...items.map((it) => similarity(q.dest, it.dest || "") * 4));
          s += d < 1 ? -6 : d;
        }
        if (q.origin) s += similarity(q.origin, l.origin) * 3;
        if (!q.dest && !q.origin) s += 0.1;
        if (q.side) s += l.side === q.side || l.side === "both" ? 0.5 : -1;
        return { lineup: l, score: Math.round(s * 100) / 100 };
      }
      if (q.side) s += l.side === q.side || l.side === "both" ? 0.5 : -1;
      if (q.dest) {
        const d = Math.max(similarity(q.dest, l.dest) * 4, similarity(q.dest, l.name || "") * 3);
        // A landing was named and this one's nothing like it: not a candidate at all.
        s += d < 1 ? -6 : d;
      }
      if (q.origin) s += similarity(q.origin, l.origin) * 3;
      if (q.spawn) s += l.spawn === q.spawn ? 3 : -4;
      if (!q.dest && !q.origin) s += 0.1; // only a type or map: all equal-ish
      return { lineup: l, score: Math.round(s * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score);
  const [first, second] = scored;
  const max = (q.type ? 2 : 0) + (q.side ? 0.5 : 0) + (q.dest ? 4 : 0) + (q.origin ? 3 : 0) + (q.spawn ? 3 : 0) || 1;
  const confident = Boolean(first) && first.score >= max * 0.55 && (!second || first.score - second.score >= 0.4);
  return { query: { ...q, map }, results: scored, best: first?.lineup ?? null, confident };
}

// Your custom names: "lineup, bazinga". entries: [{ lineup, name }]. The best
// match that's close enough (or null).
export function matchName(entries, text) {
  const t = normalise(text);
  if (!t) return null;
  let best = null;
  for (const e of entries) {
    const n = normalise(e.name);
    const s = n === t ? 1 : similarity(t, e.name);
    if (s >= 0.85 && (!best || s > best.score)) best = { ...e, score: s };
  }
  return best;
}
