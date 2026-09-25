// services/demo.js
// Three example Mirage lineups using a generated test clip (media/demo-clip.webm),
// so the library can be tried before uploading real clips. Positions are rough;
// delete them whenever you like (author "Demo").

import { saveLineup } from "./store.js";

const clip = { kind: "url", url: "media/demo-clip.webm" };
const DEMO = [
  { name: "Window smoke from T Spawn", type: "smoke", side: "T", throw: "jump", origin: "T Spawn", dest: "Window", purposes: ["execute"], from: { x: 0.86, y: 0.35 }, to: { x: 0.36, y: 0.38 }, arc: [], notes: "Demo: aim at the top of the antenna, then jumpthrow." },
  { name: "Jungle smoke from T Ramp", type: "smoke", side: "T", throw: "left", origin: "T Ramp", dest: "Jungle", purposes: ["execute"], from: { x: 0.72, y: 0.66 }, to: { x: 0.37, y: 0.6 }, arc: [] },
  { name: "Pop flash for A Site from Palace", type: "flash", side: "T", throw: "right", origin: "Palace", dest: "A Site", purposes: ["popflash"], from: { x: 0.56, y: 0.83 }, to: { x: 0.43, y: 0.74 }, arc: [{ x: 0.5, y: 0.86 }] },
  { name: "Molotov Firebox from A Ramp", type: "molotov", side: "T", throw: "left", origin: "A Ramp", dest: "Firebox", purposes: ["execute"], from: { x: 0.52, y: 0.72 }, to: { x: 0.33, y: 0.78 }, arc: [] },
];

export async function seedDemo() {
  for (const d of DEMO) await saveLineup({ ...d, map: "de_mirage", author: "Demo", clip, world: null, level: "upper" });
}
