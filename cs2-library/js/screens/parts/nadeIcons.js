// screens/parts/nadeIcons.js
// The four grenades as small silhouettes (after the reference art), drawn in a
// 24 x 24 box: smoke canister, HE frag, flashbang with its holes, molotov with
// its flame. Used on the map (on a dark badge ringed in the grenade's colour)
// and, small, in chips and lists.

import { typeById } from "../../data/tags.js";

const NS = "http://www.w3.org/2000/svg";

// Filled shapes, plus details cut back out in the badge colour (holes, highlights).
export const NADE_PATHS = {
  smoke: {
    fill: [
      "M9.5 3.5h5v3.5h-5z", // cap
      "M8 8.5a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5h-5a1.5 1.5 0 0 1-1.5-1.5z", // body
      "M14.5 4h1.2c1.9 0 3.1 1.3 3.1 3.2v6.8h-1.3V7.2c0-1.1-.7-1.9-1.8-1.9h-1.2z", // lever
    ],
    cut: [],
  },
  he: {
    fill: [
      "M10 5h4v4.3h-4z", // fuse
      "M12 9a6 6 0 1 1 0 12a6 6 0 1 1 0-12z", // ball
      "M9.8 5.4L6.6 6.8v7.4h1.4V7.7l2-.9z", // lever
    ],
    cut: [],
  },
  flash: {
    fill: [
      "M9.5 3h5v2.5h-5z", // top
      "M8.5 5.5h7v14a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1z", // body
      "M15.5 4h.8c1.4 0 2.2.9 2.2 2.3V16h-1.2V6.4c0-.7-.4-1.1-1-1.1h-.8z", // lever
    ],
    cut: ["M10 9h1.6v1.6H10zM12.4 9H14v1.6h-1.6zM10 12h1.6v1.6H10zM12.4 12H14v1.6h-1.6zM10 15h1.6v1.6H10zM12.4 15H14v1.6h-1.6z"], // the holes
  },
  molotov: {
    fill: [
      "M10.6 6.2h2.8v3.3l1.9 2.9v8.1a1.4 1.4 0 0 1-1.4 1.4h-3.8a1.4 1.4 0 0 1-1.4-1.4v-8.1l1.9-2.9z", // bottle
      "M11.2 5.8c-1.3-1.4-.6-3.4.9-4.4c-.2 1 .7 1.6 1 2.4c.3.9-.1 1.8-.9 2z", // flame
    ],
    cut: [],
    rotate: 24,
  },
};

function paths(parent, type, colour, cutColour) {
  const def = NADE_PATHS[type] ?? NADE_PATHS.smoke;
  const g = document.createElementNS(NS, "g");
  if (def.rotate) g.setAttribute("transform", `rotate(${def.rotate} 12 12)`);
  for (const d of def.fill) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", colour);
    g.append(p);
  }
  for (const d of def.cut) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", cutColour);
    g.append(p);
  }
  parent.append(g);
  return g;
}

// On the map: a badge at pos (0 to 1). mapCanvas keeps it the same size on screen.
export function nadeBadge(type, pos, { cls = "", attrs = {} } = {}) {
  const colour = typeById(type)?.colour ?? "#fcf0d6";
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", `nadeicon ${cls}`.trim());
  g.dataset.icon = "1";
  g.dataset.cx = String(pos.x * 1000);
  g.dataset.cy = String(pos.y * 1000);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) g.setAttribute(k, String(v));
  const disc = document.createElementNS(NS, "circle");
  disc.setAttribute("r", "16");
  disc.setAttribute("class", `lu lu--${type}`);
  disc.setAttribute("fill", "#071820");
  disc.setAttribute("stroke", colour);
  g.append(disc);
  const inner = document.createElementNS(NS, "g");
  inner.setAttribute("transform", "scale(1.2) translate(-12 -12)");
  paths(inner, type, colour, "#071820");
  g.append(inner);
  return g;
}

// Small, inline in HTML (chips, lists).
export function nadeIconEl(type, size = 16) {
  const colour = typeById(type)?.colour ?? "#fcf0d6";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "nadeglyph");
  paths(svg, type, colour, "var(--nade-cut, #0d2330)");
  return svg;
}
