// data/tags.js
// The tag lists. Tags are picked from these, never typed, so filtering (and
// later voice requests) always line up.

export const TYPES = [
  { id: "smoke", name: "Smoke", colour: "#3f8cff" },
  { id: "flash", name: "Flash", colour: "#f2cf2e" },
  { id: "molotov", name: "Molotov", colour: "#ff4d4d" },
  { id: "he", name: "HE grenade", colour: "#3fcf72" },
];

export const SIDES = [
  { id: "T", name: "T" },
  { id: "CT", name: "CT" },
  { id: "both", name: "Both" },
];

export const THROWS = [
  { id: "left", name: "Left click" },
  { id: "right", name: "Right click" },
  { id: "middle", name: "Left + right click" },
  { id: "jump", name: "Jumpthrow" },
  { id: "runjump", name: "Run + jumpthrow" },
  { id: "wm1jump", name: "W + M1 + Jump" },
  { id: "walk", name: "Walk + throw" },
  { id: "crouch", name: "Crouch + throw" },
  { id: "run", name: "Run + throw" },
];

export const PURPOSES = [
  { id: "execute", name: "Execute" },
  { id: "retake", name: "Retake" },
  { id: "oneway", name: "One-way" },
  { id: "popflash", name: "Pop flash" },
  { id: "instant", name: "Instant (from spawn)" },
  { id: "postplant", name: "Post-plant" },
  { id: "antirush", name: "Anti-rush" },
  { id: "fake", name: "Fake" },
];

export const typeById = (id) => TYPES.find((t) => t.id === id);
export const nameOf = (list, id) => list.find((x) => x.id === id)?.name ?? id;
