// screens/parts/bullBoard.js
// The zoomed-in dartboard used for throwing for the bull, locally and online.

import { BOARD_ORDER } from "../../engine/board.js";
import { BOARD } from "../../engine/bull.js";

export const VIEW = 78; // mm shown either side of the centre
const SVG_NS = "http://www.w3.org/2000/svg";
export const PLAYER_COLOURS = ["#fcf0d6", "#e8b04e", "#6b9ebd", "#58b48c"];

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

// A wedge between two radii and two angles (degrees, 0 = up, clockwise).
function wedge(r0, r1, a0, a1) {
  const pt = (r, a) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${(r * Math.cos(rad)).toFixed(2)},${(r * Math.sin(rad)).toFixed(2)}`;
  };
  return `M${pt(r0, a0)} L${pt(r1, a0)} A${r1},${r1} 0 0,1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0},${r0} 0 0,0 ${pt(r0, a0)} Z`;
}

export function drawBoard() {
  const g = svg("g", { class: "board-art" });
  BOARD_ORDER.forEach((n, i) => {
    const a0 = i * 18 - 9;
    const a1 = i * 18 + 9;
    const even = i % 2 === 0;
    g.append(
      svg("path", { d: wedge(BOARD.outerBull, BOARD.trebleInner, a0, a1), class: even ? "seg-a" : "seg-b" }),
      svg("path", { d: wedge(BOARD.trebleInner, BOARD.trebleOuter, a0, a1), class: even ? "ring-a" : "ring-b" }),
      svg("path", { d: wedge(BOARD.trebleOuter, 130, a0, a1), class: even ? "seg-a" : "seg-b" })
    );
    // Numbers sit just inside the view so the board stays readable when zoomed.
    const rad = ((i * 18 - 90) * Math.PI) / 180;
    const t = svg("text", { x: (70 * Math.cos(rad)).toFixed(2), y: (70 * Math.sin(rad) + 2.2).toFixed(2), class: "board-num", "text-anchor": "middle" });
    t.textContent = String(n);
    g.append(t);
  });
  g.append(svg("circle", { r: BOARD.outerBull, class: "outer-bull" }), svg("circle", { r: BOARD.bull, class: "inner-bull" }));
  return g;
}

export function markerEl(pos, colour, label, isPending, index) {
  const g = svg("g", { class: ["marker", isPending ? "is-pending" : ""].join(" "), transform: `translate(${pos.x.toFixed(2)} ${pos.y.toFixed(2)})` });
  g.append(svg("circle", { r: isPending ? 5.2 : 0, class: "marker-halo" }), svg("circle", { r: 2.6, fill: colour, class: "marker-dot" }));
  // Alternate sides by player, but always point the label inwards near the edge.
  let left = index % 2 === 1;
  if (pos.x < -VIEW * 0.45) left = false;
  if (pos.x > VIEW * 0.45) left = true;
  const t = svg("text", { x: left ? -4.4 : 4.4, y: left ? 7.4 : -3.6, "text-anchor": left ? "end" : "start", class: "marker-label" });
  t.textContent = label;
  g.append(t);
  return g;
}

// Where a tap on the board landed, in millimetres from the centre.
export function toBoard(board, e) {
  const pt = board.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(board.getScreenCTM().inverse());
  return { x: Math.max(-VIEW * 1.4, Math.min(VIEW * 1.4, p.x)), y: Math.max(-VIEW * 1.4, Math.min(VIEW * 1.4, p.y)) };
}

// The board element, zoomed on the middle.
export function makeBoard(markers) {
  return svg(
    "svg",
    { viewBox: `${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`, class: "bull__board", role: "img", tabindex: "0", "aria-label": "Dartboard. Tap where your dart landed, or use the arrow keys." },
    drawBoard(),
    markers
  );
}
