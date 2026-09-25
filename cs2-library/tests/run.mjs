// node cs2-library/tests/run.mjs
import { parseGetpos, worldToRadar, radarToWorld, levelFor, suggestName, filterLineups, missingFor, authorsOf, permissionsFor, cleanPlayback, groupBySpot, areaRadius } from "../js/data/lineups.js";
import { SPAWNS } from "../js/data/spawns.js";
import { defaultLabels } from "../js/services/labels.js";
import { mapById, MAPS } from "../js/data/maps.js";
import { afterWake, normalise, parseRequest, matchRequest, controlFor, similarity, contextFor, WAKE_WORDS, wakeById } from "../js/data/voice.js";

let passed = 0, failed = 0;
const eq = (a, b, msg) => (JSON.stringify(a) === JSON.stringify(b) ? passed++ : (failed++, console.log("  FAIL", msg, "\n       expected", JSON.stringify(b), "got", JSON.stringify(a))));
const ok = (c, msg) => (c ? passed++ : (failed++, console.log("  FAIL", msg)));
const near = (a, b, msg, tol = 1e-6) => ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b}`);

eq(parseGetpos("setpos 1136.000000 -1215.968750 -103.968750;setang 3.608327 -139.456726 0.000000"), { x: 1136, y: -1215.96875, z: -103.96875, pitch: 3.608327, yaw: -139.456726 }, "getpos output");
eq(parseGetpos("setpos_exact 10, 20, 30")?.z, 30, "setpos_exact with commas");
eq(parseGetpos("hello"), null, "not getpos");

const mirage = mapById("de_mirage");
const p = worldToRadar(mirage, { x: -3230, y: 1713 });
eq(p, { x: 0, y: 0 }, "the overview origin is the radar's top-left corner");
const w = radarToWorld(mirage, worldToRadar(mirage, { x: 100, y: -200 }));
near(w.x, 100, "round trip x"); near(w.y, -200, "round trip y");
eq([levelFor(mapById("de_nuke"), -600), levelFor(mapById("de_nuke"), 0), levelFor(mirage, -600)], ["lower", "upper", "upper"], "Nuke's lower level");
eq(MAPS.length, 10, "ten maps");

eq(suggestName({ type: "smoke", origin: "T Spawn", dest: "Window" }), "Window smoke from T Spawn", "suggested name");
eq(suggestName({ type: "he" }), "", "nothing to suggest yet");
eq(suggestName({ type: "smoke", origin: "CT Spawn", dest: "Mid", spawn: 2 }), "Mid smoke from spawn 2", "instant: named by its spawn");

const L = [
  { id: 1, type: "smoke", side: "T", author: "Reech" },
  { id: 2, type: "flash", side: "CT", author: "ghostex" },
  { id: 3, type: "smoke", side: "both", author: "ghostex" },
];
eq(filterLineups(L, { types: new Set(["smoke"]) }).map((l) => l.id), [1, 3], "type filter");
eq(filterLineups(L, { side: "CT" }).map((l) => l.id), [2, 3], "CT includes 'both'");
eq(filterLineups(L, { author: "Reech" }).map((l) => l.id), [1], "author filter");
eq(filterLineups(L, { sides: new Set(["T"]) }).map((l) => l.id), [1, 3], "T ticked: T and both-sides lineups");
eq(filterLineups(L, { sides: new Set() }).map((l) => l.id), [], "no side ticked: nothing");
eq(filterLineups(L, { authors: new Set(["ghostex"]) }).map((l) => l.id), [2, 3], "several authors: ghostex only");
eq(filterLineups(L, { authors: new Set(["ghostex", "Reech"]) }).length, 3, "both authors: all three");
eq(authorsOf(L), ["ghostex", "Reech"], "authors");
eq(missingFor({ map: "de_mirage", type: "smoke", side: "T", throw: "jump", origin: "T Spawn", dest: "Window", from: { x: 0.5, y: 0.5 }, to: { x: 0.4, y: 0.4 } }), [], "complete lineup");
ok(missingFor({}).length === 8, "empty lineup lists everything");


// ---------------------------------------------------------------- voice
eq(afterWake("Lineup, mirage window smoke from CT spawn"), "mirage window smoke from ct spawn", "everything after the wake word");
eq(afterWake("nade tool jungle smoke", wakeById("nadetool").phrases), "jungle smoke", "the nade tool wake word");
eq(afterWake("what a round that was"), null, "no wake word");
eq(afterWake("lineup"), "", "just the wake word (then you ask)");
eq(normalise("Molly on firebox from see tea spawn"), "molotov on firebox from ct spawn", "speech quirks normalised");
eq(normalise("flashbang for A-site"), "flash for a site", "flashbang and A-site");
eq(parseRequest("mirage window smoke from ct spawn"), { map: "de_mirage", type: "smoke", side: null, dest: "window", origin: "ct spawn", spawn: null }, "a full request");
eq(parseRequest("dust two long doors smoke"), { map: "de_dust2", type: "smoke", side: null, dest: "long doors", origin: "", spawn: null }, "Dust II by ear");
eq(parseRequest("ct side molly into banana").side, "CT", "a side");
eq(parseRequest("ct side molly into banana").dest, "banana", "and its landing");
eq([controlFor("close"), controlFor("next one"), controlFor("slow mo"), controlFor("window smoke")], ["close", "next", "slower", null], "clip controls");
eq([controlFor("closed"), controlFor("quit"), controlFor("clothes"), controlFor("show again"), controlFor("replay"), controlFor("restart")], ["close", "close", "close", "again", "again", "again"], "close and again, as they're often heard");
ok(similarity("jungle", "Jungle") === 1 && similarity("jungel", "Jungle") > 0.6 && similarity("window", "Jungle") < 0.5, "fuzzy callouts");

const LIB = [
  { id: "w1", map: "de_mirage", type: "smoke", side: "T", origin: "T Spawn", dest: "Window", name: "Window smoke from T Spawn" },
  { id: "w2", map: "de_mirage", type: "smoke", side: "CT", origin: "CT Spawn", dest: "Window", name: "Window smoke from CT Spawn" },
  { id: "j1", map: "de_mirage", type: "smoke", side: "T", origin: "T Ramp", dest: "Jungle", name: "Jungle smoke from T Ramp" },
  { id: "f1", map: "de_mirage", type: "flash", side: "T", origin: "Palace", dest: "A Site", name: "Pop flash for A Site from Palace" },
  { id: "d1", map: "de_dust2", type: "smoke", side: "T", origin: "Outside Long", dest: "Long Doors", name: "Long Doors smoke" },
];
let m = matchRequest(LIB, "mirage window smoke from ct spawn");
eq([m.best?.id, m.confident], ["w2", true], "the CT window smoke, confidently");
m = matchRequest(LIB, "window smoke from t spawn", { map: "de_mirage" });
eq([m.best?.id, m.confident], ["w1", true], "no map said: the one on screen");
m = matchRequest(LIB, "jungel smoke");
eq([m.best?.id, m.confident], ["j1", true], "a mis-heard callout still matches");
m = matchRequest(LIB, "window smoke", { map: "de_mirage" });
eq(m.confident, false, "two window smokes: not sure, so it asks");
eq(m.results.slice(0, 2).map((r) => r.lineup.id).sort(), ["w1", "w2"], "and offers both");
m = matchRequest(LIB, "dust two long doors smoke", { map: "de_mirage" });
eq(m.best?.id, "d1", "a map said out loud beats the one on screen");
eq(matchRequest(LIB, "flash a site").best?.id, "f1", "a flash for A site");

eq(parseRequest("t spawn to window smoke"), { map: null, type: "smoke", side: null, dest: "window", origin: "t spawn", spawn: null }, "'X to Y' is from X, landing at Y");
eq(parseRequest("smoke to window").dest, "window", "'smoke to window' still lands at window");
eq(contextFor("I'm on mirage"), { map: "de_mirage" }, "I'm on Mirage");
eq(contextFor("I'm on mirage ct side"), { map: "de_mirage", side: "CT" }, "Mirage CT side");
eq(contextFor("ct side"), { side: "CT" }, "just a side");
eq(contextFor("we're on dust two t side"), { map: "de_dust2", side: "T" }, "Dust II T side");
eq(contextFor("window smoke from t spawn"), null, "a request isn't a context change");
m = matchRequest(LIB, "window smoke", { map: "de_mirage", side: "CT" });
eq([m.best?.id, m.confident], ["w2", true], "your side picks the right window smoke");
eq(matchRequest(LIB, "t spawn to window smoke", { map: "de_mirage" }).best?.id, "w1", "'t spawn to window smoke'");

// ---------------------------------------------------------------- permissions and playback
const mineL = { source: "shared", authorUid: "u1" };
const reech = { user: { uid: "u1" }, admin: true };
const dave = { user: { uid: "u2" }, admin: false };
eq(permissionsFor(mineL, reech), { edit: true, delete: true }, "your own lineup");
eq(permissionsFor(mineL, dave), { edit: false, delete: false }, "someone else's: hands off");
eq(permissionsFor({ source: "shared", authorUid: "u2" }, reech), { edit: false, delete: true }, "the admin can remove, not edit");
eq(permissionsFor(mineL, { user: null }), { edit: false, delete: false }, "signed out");
eq(permissionsFor({ source: "device" }, dave), { edit: true, delete: true }, "on this device: yours");
eq(cleanPlayback({ speed: 0.5, zoom: 9, autoClose: 2 }), { speed: 0.5, zoom: 5, autoClose: 2, nickname: "", wakeId: "lineup", favsOnly: false, showCallouts: false, updatedAt: 0 }, "playback settings cleaned");
eq([cleanPlayback({ favsOnly: 1, showCallouts: "yes" }).favsOnly, cleanPlayback({}).showCallouts], [true, false], "favourites only and callouts: off to begin with");
eq([cleanPlayback({ nickname: "  ghostex   the  great " }).nickname, cleanPlayback({ wakeId: "jarvis" }).wakeId, cleanPlayback({ wakeId: "bob" }).wakeId], ["ghostex the great", "jarvis", "lineup"], "nickname and wake word");
eq(cleanPlayback({ speed: 3, autoClose: 7 }).speed, 1, "an odd speed falls back to 1");
eq(cleanPlayback({ autoClose: 7 }).autoClose, 0, "an odd count keeps playing");

const spots = groupBySpot([{ id: 1, from: { x: 0.5, y: 0.5 }, to: { x: 0.1, y: 0.1 } }, { id: 2, from: { x: 0.505, y: 0.5 }, to: { x: 0.9, y: 0.9 } }, { id: 3, from: { x: 0.2, y: 0.2 }, to: { x: 0.1, y: 0.1 } }]);
eq(spots.map((g) => g.items.map((l) => l.id)), [[1, 2], [3]], "same throw spot: one dot");
eq(groupBySpot([{ id: 1, from: { x: 0.5, y: 0.5 }, to: { x: 0.1, y: 0.1 } }, { id: 3, from: { x: 0.2, y: 0.2 }, to: { x: 0.1, y: 0.1 } }], "to").length, 1, "same landing, grouped when viewing landings");

eq(afterWake("Hey Jarvis, window smoke", wakeById("jarvis").phrases), "window smoke", "Jarvis");
eq(afterWake("lineup window smoke", wakeById("jarvis").phrases), null, "only your chosen wake word counts");
eq(afterWake("atlas mirage jungle smoke", wakeById("atlas").phrases), "mirage jungle smoke", "Atlas");
ok(WAKE_WORDS.every((w) => !/\b(scout|nova|flash|smoke|site|bomb|awp)\b/.test(w.phrases.join(" "))), "no wake word sounds like game chatter");
eq(wakeById("nope").id, "lineup", "an unknown choice falls back to Lineup");

eq([parseRequest("spawn 2 window smoke").spawn, parseRequest("window smoke from spawn two").spawn, parseRequest("show me the window smoke from spawn number 3").spawn], [2, 2, 3], "which spawn");
eq(parseRequest("window smoke from spawn two").dest, "window", "and the landing still reads right");
const SP = [
  { id: "s1", map: "de_ancient", type: "smoke", side: "CT", origin: "CT Spawn", dest: "Mid", spawn: 1, purposes: ["instant"], name: "Mid smoke from spawn 1" },
  { id: "s2", map: "de_ancient", type: "smoke", side: "CT", origin: "CT Spawn", dest: "Mid", spawn: 2, purposes: ["instant"], name: "Mid smoke from spawn 2" },
];
eq(matchRequest(SP, "spawn 2 mid smoke", { map: "de_ancient", side: "CT" }).best?.id, "s2", "spawn 2's mid smoke");
eq(matchRequest(SP, "mid smoke from spawn one", { map: "de_ancient" }).best?.id, "s1", "spawn one's");

// ---------------------------------------------------------------- spawns and areas
const allSpawns = Object.values(SPAWNS).flatMap((m) => [...m.T, ...m.CT]);
eq(allSpawns.length, 137, "137 spawns: NadesDB's 122 plus Train's 15");
eq(Object.keys(SPAWNS).length, 10, "on all ten maps");
for (const [id, sides] of Object.entries(SPAWNS))
  for (const side of ["T", "CT"])
    ok(sides[side].every(([x, y]) => { const p = worldToRadar(mapById(id), { x, y }); return p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1; }), `${id} ${side} spawns are on the radar`);
eq(levelFor(mapById("de_vertigo"), SPAWNS.de_vertigo.T[0][2]), "lower", "Vertigo T spawns: lower level");
near(areaRadius(mapById("de_mirage"), { type: "smoke" }), 144 / 5 / 1024 * 1000, "smoke area to scale");
ok(areaRadius(mapById("de_mirage"), { type: "he" }) > areaRadius(mapById("de_mirage"), { type: "smoke" }), "HE bigger than smoke");
ok(areaRadius(mapById("de_mirage"), { type: "molotov", side: "CT" }) < areaRadius(mapById("de_mirage"), { type: "molotov", side: "T" }), "incendiary a touch smaller");
eq(areaRadius(mapById("de_mirage"), { type: "flash" }), 0, "flashes: no area");

// ---------------------------------------------------------------- callouts
eq([controlFor("show callouts"), controlFor("show me the call outs"), controlFor("hide callouts"), controlFor("callouts off"), controlFor("turn on call-outs")], ["callouts-on", "callouts-on", "callouts-off", "callouts-off", "callouts-on"], "show and hide callouts");
eq(controlFor("close"), "close", "plain close still closes the clip");
const dl = defaultLabels("de_mirage");
eq(dl.map((l) => l.text), ["T Spawn", "CT Spawn"], "T Spawn and CT Spawn on every map");
ok(dl[0].x > 0.8 && dl[1].x < 0.4, "placed from the spawns (Mirage T on the right, CT on the left)");
eq(defaultLabels("de_vertigo")[0].level, "lower", "Vertigo T Spawn on the lower level");

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
