// ui/map.js
// Two ways to show a route:
//   trackSvg()  just the line, fitted to a box. No network needed. Used on the
//               ride screen and for course thumbnails.
//   TileMap     a real street map (CARTO's dark style, OpenStreetMap data) with
//               drag, pinch, wheel and buttons to zoom. Used on course and ride
//               pages and in the split editor. Offline, the route still draws
//               on the dark background.

import { s, h, icon } from "./dom.js";

const RAD = Math.PI / 180;

/** Fit points into w×h with padding; returns {project, path}. */
function fitter(points, w, h, pad) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const lat0 = points.reduce((a, p) => a + p.lat, 0) / Math.max(points.length, 1);
  const kx = Math.cos(lat0 * RAD);
  for (const p of points) {
    const x = p.lng * kx, y = -p.lat;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const sw = maxX - minX || 1e-6, sh = maxY - minY || 1e-6;
  const k = Math.min((w - 2 * pad) / sw, (h - 2 * pad) / sh);
  const ox = (w - sw * k) / 2, oy = (h - sh * k) / 2;
  return (p) => [ox + (p.lng * kx - minX) * k, oy + (-p.lat - minY) * k];
}

const pathOf = (pts, proj) => pts.map((p, i) => { const [x, y] = proj(p); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join("");

/**
 * The route line in an SVG. `marks` are extra dots: [{ p, color, r }].
 * `done` (0..1 of points) draws the ridden part brighter.
 */
export function trackSvg(points, { w = 100, h = 100, pad = 8, color = "#c2fe00", width = 3, marks = [], dim = false } = {}) {
  const svg = s("svg", { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "xMidYMid meet" });
  if (points.length < 2) return svg;
  const proj = fitter(points, w, h, pad);
  svg.append(s("path", { d: pathOf(points, proj), fill: "none", stroke: dim ? "#3a4a85" : color, "stroke-width": width, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  const [sx, sy] = proj(points[0]);
  svg.append(s("circle", { cx: sx, cy: sy, r: width * 1.3, fill: "#ececec" }));
  for (const m of marks) {
    if (!m.p) continue;
    const [x, y] = proj(m.p);
    svg.append(s("circle", { cx: x, cy: y, r: m.r || width * 2.2, fill: m.color, stroke: "#040817", "stroke-width": 2, "data-mark": m.id || "" }));
  }
  svg._project = proj;
  return svg;
}

// ---------- tile map ----------

const TILE = 256;
const worldX = (lng, z) => ((lng + 180) / 360) * TILE * 2 ** z;
const worldY = (lat, z) => {
  const r = Math.max(-85.05, Math.min(85.05, lat)) * RAD;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * 2 ** z;
};
const lngOf = (x, z) => (x / (TILE * 2 ** z)) * 360 - 180;
const latOf = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

export class TileMap {
  /**
   * draw(api) is called on every redraw to add overlay shapes; api has
   * project(p) -> [x,y], line(points, attrs), dot(p, attrs), text(p, str, attrs).
   */
  constructor({ height = 280, points = [], draw = () => {}, onTap = null }) {
    this.points = points;
    this.draw = draw;
    this.onTap = onTap;
    this.zoom = 14;
    this.cx = 0; this.cy = 0; // centre in world pixels at this.zoom
    this.tiles = h("div", { class: "tiles" });
    this.svg = s("svg", { class: "ov" });
    this.el = h("div", { class: "map", style: { height: `${height}px` } },
      this.tiles, this.svg,
      h("div", { class: "zoom" },
        h("button", { "aria-label": "Nagyítás", onClick: (e) => { e.stopPropagation(); this.zoomBy(1); } }, icon("plus")),
        h("button", { "aria-label": "Kicsinyítés", onClick: (e) => { e.stopPropagation(); this.zoomBy(-1); } }, icon("minus")),
        h("button", { "aria-label": "Az egész pálya", onClick: (e) => { e.stopPropagation(); this.fit(); } }, icon("fit"))),
      h("div", { class: "attr" }, "© OpenStreetMap, © CARTO"));
    this.cache = new Map();
    this.bindGestures();
    this.ro = new ResizeObserver(() => { if (!this.fitted) this.fit(); else this.render(); });
    this.ro.observe(this.el);
  }

  get w() { return this.el.clientWidth || 360; }
  get h() { return this.el.clientHeight || 280; }

  fit(points = this.points) {
    if (!points.length) { this.render(); return; }
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const p of points) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng); }
    const pad = 36;
    let z = 18;
    while (z > 3) {
      const wpx = worldX(maxLng, z) - worldX(minLng, z), hpx = worldY(minLat, z) - worldY(maxLat, z);
      if (wpx <= this.w - pad * 2 && hpx <= this.h - pad * 2) break;
      z--;
    }
    this.zoom = z;
    this.cx = (worldX(minLng, z) + worldX(maxLng, z)) / 2;
    this.cy = (worldY(minLat, z) + worldY(maxLat, z)) / 2;
    this.fitted = this.el.clientWidth > 0;
    this.render();
  }

  zoomBy(dz, ax = this.w / 2, ay = this.h / 2) {
    const nz = Math.max(3, Math.min(19, this.zoom + dz));
    if (nz === this.zoom) return;
    const wx = this.cx - this.w / 2 + ax, wy = this.cy - this.h / 2 + ay;
    const f = 2 ** (nz - this.zoom);
    this.cx = wx * f - ax + this.w / 2;
    this.cy = wy * f - ay + this.h / 2;
    this.zoom = nz;
    this.render();
  }

  project(p) { return [worldX(p.lng, this.zoom) - this.cx + this.w / 2, worldY(p.lat, this.zoom) - this.cy + this.h / 2]; }
  unproject(x, y) { return { lat: latOf(y + this.cy - this.h / 2, this.zoom), lng: lngOf(x + this.cx - this.w / 2, this.zoom) }; }

  render() {
    const z = this.zoom, n = 2 ** z;
    const left = this.cx - this.w / 2, top = this.cy - this.h / 2;
    const x0 = Math.floor(left / TILE), x1 = Math.floor((left + this.w) / TILE);
    const y0 = Math.max(0, Math.floor(top / TILE)), y1 = Math.min(n - 1, Math.floor((top + this.h) / TILE));
    const want = new Set();
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const tx = ((x % n) + n) % n;
      const key = `${z}/${tx}/${y}`;
      want.add(key + "@" + x);
      let img = this.cache.get(key + "@" + x);
      if (!img) {
        img = new Image();
        img.decoding = "async";
        img.alt = "";
        img.onerror = () => { img.style.visibility = "hidden"; };
        img.src = `https://${"abcd"[(tx + y) % 4]}.basemaps.cartocdn.com/dark_all/${key}@2x.png`;
        this.cache.set(key + "@" + x, img);
      }
      img.style.left = `${x * TILE - left}px`;
      img.style.top = `${y * TILE - top}px`;
      if (img.parentNode !== this.tiles) this.tiles.appendChild(img);
    }
    for (const [k, img] of this.cache) {
      if (!want.has(k)) { img.remove(); if (!k.startsWith(`${z}/`)) this.cache.delete(k); }
    }
    this.drawOverlay();
  }

  drawOverlay() {
    this.svg.replaceChildren();
    const api = {
      project: (p) => this.project(p),
      line: (pts, a = {}) => { if (pts.length > 1) this.svg.append(s("path", { d: pathOf(pts, (p) => this.project(p)), fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round", stroke: "#c2fe00", "stroke-width": 5, ...a })); },
      dot: (p, a = {}) => { const [x, y] = this.project(p); this.svg.append(s("circle", { cx: x, cy: y, r: 9, fill: "#ececec", stroke: "#040817", "stroke-width": 3, ...a })); },
      text: (p, str, a = {}) => { const [x, y] = this.project(p); this.svg.append(s("text", { x, y: y + 6, "text-anchor": "middle", "font-size": 17, "font-weight": 700, fill: "#241a00", "font-family": "Barlow, sans-serif", ...a }, str)); },
    };
    this.draw(api);
  }

  bindGestures() {
    const pts = new Map();
    let start = null, pinch = null;
    this.el.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      this.el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) start = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, t: Date.now(), moved: false };
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.zoom };
      }
    });
    this.el.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const want = pinch.z + Math.round(Math.log2(d / pinch.d));
        if (want !== this.zoom) {
          const r = this.el.getBoundingClientRect();
          this.zoomBy(want - this.zoom, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        }
        if (start) start.moved = true;
        return;
      }
      if (start) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) start.moved = true;
        if (start.moved) { this.cx = start.cx - dx; this.cy = start.cy - dy; this.render(); }
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && start) {
        if (!start.moved && Date.now() - start.t < 500 && this.onTap) {
          const r = this.el.getBoundingClientRect();
          this.onTap(this.unproject(e.clientX - r.left, e.clientY - r.top));
        }
        start = null;
      }
    };
    this.el.addEventListener("pointerup", end);
    this.el.addEventListener("pointercancel", end);
    this.el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = this.el.getBoundingClientRect();
      this.zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }

  destroy() { this.ro.disconnect(); }
}
