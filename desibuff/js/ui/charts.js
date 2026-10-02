// ui/charts.js
// One line chart, drawn as SVG: value over distance. Big labels, few of them.

import { s, h } from "./dom.js";

export function lineChart(series, { color = "#c2fe00", unit = "", zero = false, digits = 0, signed = false, empty = "Ehhez a menethez nincs elég adat." } = {}) {
  if (!series || series.length < 2) return h("div", { class: "empty" }, empty);
  const W = 400, H = 210, L = 52, R = 8, T = 12, B = 30; // drawn at phone scale so 17-unit text stays ≥ 17 px
  let min = Math.min(...series.map((p) => p.v)), max = Math.max(...series.map((p) => p.v));
  if (zero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (max - min < 1) { max += 0.5; min -= 0.5; }
  const pad = (max - min) * 0.08;
  min -= pad; max += pad;
  const km0 = series[0].km, km1 = series[series.length - 1].km || 1;
  const x = (km) => L + ((km - km0) / Math.max(km1 - km0, 1e-6)) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const fmt = (v) => {
    const t = v.toFixed(digits);
    return Number(t) === 0 ? (0).toFixed(digits) : `${signed && v > 0 ? "+" : ""}${t}`;
  };

  const d = series.map((p, i) => `${i ? "L" : "M"}${x(p.km).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet", role: "img" });
  // grid: top, middle, bottom
  for (const v of [max - pad, (max + min) / 2, min + pad]) {
    svg.append(s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "#1d2a5c", "stroke-width": 1 }));
    svg.append(s("text", { x: L - 8, y: y(v) + 6, "text-anchor": "end", fill: "#9aa6c8", "font-size": 17, "font-family": "Barlow Condensed, sans-serif" }, fmt(v)));
  }
  if (zero) svg.append(s("line", { x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: "#ececec", "stroke-width": 1.5, "stroke-dasharray": "6 6" }));
  svg.append(s("path", { d: `${d}L${x(km1)} ${H - B}L${x(km0)} ${H - B}Z`, fill: color, opacity: 0.12 }));
  svg.append(s("path", { d, fill: "none", stroke: color, "stroke-width": 3, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }));
  svg.append(s("text", { x: L, y: H - 8, fill: "#9aa6c8", "font-size": 17, "font-family": "Barlow, sans-serif" }, `${km0.toFixed(1)} km`));
  svg.append(s("text", { x: W - R, y: H - 8, "text-anchor": "end", fill: "#9aa6c8", "font-size": 17, "font-family": "Barlow, sans-serif" }, `${km1.toFixed(1)} km`));
  if (unit) svg.append(s("text", { x: W / 2, y: H - 8, "text-anchor": "middle", fill: "#9aa6c8", "font-size": 17, "font-family": "Barlow, sans-serif" }, unit));
  return h("div", { class: "chart" }, svg);
}
