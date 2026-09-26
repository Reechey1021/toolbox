// data/tags.js
// The tag lists. Tags are picked from these, never typed, so filtering (and
// later voice requests) always line up.

export const TYPES = [
  { id: "smoke", name: "Smoke", colour: "#3f8cff" },
  { id: "flash", name: "Flash", colour: "#f2cf2e" },
  { id: "molotov", name: "Molotov", colour: "#ff4d4d" },
  { id: "he", name: "HE grenade", colour: "#3fcf72" },
  { id: "group", name: "Utility group", colour: "#b98cff" }, // several from one spot, one clip
];
// The real grenades (a group's utilities are each one of these).
export const GRENADES = TYPES.filter((t) => t.id !== "group");
export const GROUP_MAX = 10;

export const SIDES = [
  { id: "T", name: "T" },
  { id: "CT", name: "CT" },
  { id: "both", name: "Both" },
];

// How it's thrown: tags from three groups (any number from each, or none).
export const THROW_GROUPS = [
  { id: "type", name: "Throw type", tags: [{ id: "left", name: "Left click" }, { id: "right", name: "Right click" }, { id: "middle", name: "Left + right click" }] },
  { id: "speed", name: "Speed", tags: [{ id: "crouch", name: "Crouch" }, { id: "walk", name: "Walk" }, { id: "run", name: "Run" }] },
  { id: "tap", name: "Tap", tags: [{ id: "w", name: "W" }, { id: "a", name: "A" }, { id: "s", name: "S" }, { id: "d", name: "D" }, { id: "jump", name: "Jump" }] },
];

// Lineups saved before the groups had one "throw": what each one means now.
export const LEGACY_THROWS = {
  left: { type: ["left"] },
  right: { type: ["right"] },
  middle: { type: ["middle"] },
  jump: { type: ["left"], tap: ["jump"] },
  runjump: { type: ["left"], speed: ["run"], tap: ["jump"] },
  wm1jump: { type: ["left"], tap: ["w", "jump"] },
  walk: { type: ["left"], speed: ["walk"] },
  crouch: { type: ["left"], speed: ["crouch"] },
  run: { type: ["left"], speed: ["run"] },
};

// The old single list (kept so nothing that still reads it breaks).
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
