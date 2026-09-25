// screens/parts/mapCanvas.js
// A zoomable, pannable radar. Positions are 0 to 1 across the radar, drawn in
// a 1000 x 1000 space. Wheel zooms around the pointer, drag pans, two fingers
// pinch. Dots keep the same size on screen at any zoom.

const NS = "http://www.w3.org/2000/svg";
const SIZE = 1000;
const MIN = 1;
const MAX = 10;

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  return el;
}

// onTap(pos, event): a tap or click that wasn't a drag, with its radar position.
export function createMapCanvas({ radar, label = "Map", onTap = null } = {}) {
  const el = document.createElement("div");
  el.className = "mapcv";
  const svg = svgEl("svg", { viewBox: `0 0 ${SIZE} ${SIZE}`, class: "mapcv__svg", role: "img", "aria-label": label, preserveAspectRatio: "xMidYMid meet" });
  const world = svgEl("g", { class: "mapcv__world" });
  const fallback = svgEl("g", { class: "mapcv__fallback" });
  // radar: { local, remote } (your copy first, then GitHub) or a plain URL.
  let current = typeof radar === "string" ? { local: radar, remote: null } : radar;
  const image = svgEl("image", { width: SIZE, height: SIZE, href: current.local, preserveAspectRatio: "none" });
  // Bottom to top: callouts, paths, lineups, marks (so lineups always sit above callouts).
  const layers = { labels: svgEl("g", { class: "mapcv__labels" }), lines: svgEl("g", { class: "mapcv__lines" }), dots: svgEl("g", { class: "mapcv__dots" }), marks: svgEl("g", { class: "mapcv__marks" }) };
  world.append(fallback, image, layers.labels, layers.lines, layers.dots, layers.marks);
  svg.append(world);
  el.append(svg);

  // If the radar can't load (offline, blocked), a grid keeps it usable.
  const note = document.createElement("p");
  note.className = "mapcv__note";
  note.hidden = true;
  note.textContent = "The radar image couldn't load. Dots still work; check your connection.";
  el.append(note);
  image.addEventListener("error", () => {
    if (current.remote && image.getAttribute("href") !== current.remote) return image.setAttribute("href", current.remote);
    note.hidden = false;
    fallback.replaceChildren(svgEl("rect", { width: SIZE, height: SIZE, class: "mapcv__grid" }));
    for (let i = 1; i < 10; i++) {
      fallback.append(svgEl("line", { x1: i * 100, y1: 0, x2: i * 100, y2: SIZE, class: "mapcv__gridline" }), svgEl("line", { x1: 0, y1: i * 100, x2: SIZE, y2: i * 100, class: "mapcv__gridline" }));
    }
  });

  let view = { s: 1, x: 0, y: 0 };
  const zoomers = new Set();
  function apply() {
    world.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.s})`);
    el.style.setProperty("--zoom", view.s);
    // Keep dots and lines the same size on screen.
    for (const c of svg.querySelectorAll("[data-r]")) c.setAttribute("r", Number(c.dataset.r) / view.s);
    for (const l of svg.querySelectorAll("[data-w]")) l.setAttribute("stroke-width", Number(l.dataset.w) / view.s);
    for (const t of svg.querySelectorAll("[data-fs]")) t.setAttribute("font-size", Number(t.dataset.fs) / view.s);
    for (const g of svg.querySelectorAll("[data-icon]")) g.setAttribute("transform", `translate(${g.dataset.cx} ${g.dataset.cy}) scale(${1 / view.s})`);
    zoomers.forEach((fn) => fn(view));
  }

  function clamp() {
    view.s = Math.max(MIN, Math.min(MAX, view.s));
    const lo = SIZE - SIZE * view.s;
    view.x = Math.max(lo, Math.min(0, view.x));
    view.y = Math.max(lo, Math.min(0, view.y));
  }

  // Screen point to the 1000 x 1000 space (before zoom), and to the radar (0 to 1).
  function toSvg(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function toRadar(clientX, clientY) {
    const p = toSvg(clientX, clientY);
    return { x: (p.x - view.x) / view.s / SIZE, y: (p.y - view.y) / view.s / SIZE };
  }
  // A radar position to the screen, for placing tooltips.
  function toScreen(pos) {
    const pt = svg.createSVGPoint();
    pt.x = pos.x * SIZE * view.s + view.x;
    pt.y = pos.y * SIZE * view.s + view.y;
    const p = pt.matrixTransform(svg.getScreenCTM());
    const box = el.getBoundingClientRect();
    return { x: p.x - box.left, y: p.y - box.top };
  }

  function zoomAt(clientX, clientY, factor) {
    const p = toSvg(clientX, clientY);
    const s = Math.max(MIN, Math.min(MAX, view.s * factor));
    view.x = p.x - ((p.x - view.x) * s) / view.s;
    view.y = p.y - ((p.y - view.y) * s) / view.s;
    view.s = s;
    clamp();
    apply();
  }

  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false }
  );

  // Drag to pan, pinch to zoom; a press that barely moved is a tap.
  const pointers = new Map();
  let start = null;
  let pinch = null;
  el.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, target: e.target };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s };
      start && (start.moved = true);
    }
  });
  el.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.s * (d / pinch.d)) / view.s);
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 6) return;
    if (!start.moved) el.setPointerCapture?.(e.pointerId);
    start.moved = true;
    const k = SIZE / el.getBoundingClientRect().width; // screen px to svg units (roughly square)
    view.x = start.vx + dx * k;
    view.y = start.vy + dy * k;
    clamp();
    apply();
  });
  const end = (e) => {
    const wasTap = start && !start.moved && pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (wasTap && e.type === "pointerup" && onTap) onTap(toRadar(e.clientX, e.clientY), e, start.target);
    if (pointers.size === 0) start = null;
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  apply();
  return {
    el,
    svg,
    layers,
    toRadar,
    toScreen,
    zoomIn: () => {
      const b = el.getBoundingClientRect();
      zoomAt(b.left + b.width / 2, b.top + b.height / 2, 1.5);
    },
    zoomOut: () => {
      const b = el.getBoundingClientRect();
      zoomAt(b.left + b.width / 2, b.top + b.height / 2, 1 / 1.5);
    },
    reset: () => ((view = { s: 1, x: 0, y: 0 }), apply()),
    // Zoom so a box (0 to 1: { x, y, w, h }) fills the view, with some room around it.
    fitTo(box, pad = 0.06, min = 0.08) {
      const w = Math.max(box.w + pad * 2, min);
      const hgt = Math.max(box.h + pad * 2, min);
      const s = Math.max(MIN, Math.min(MAX, 1 / Math.max(w, hgt)));
      const cx = (box.x + box.w / 2) * SIZE;
      const cy = (box.y + box.h / 2) * SIZE;
      view = { s, x: SIZE / 2 - cx * s, y: SIZE / 2 - cy * s };
      clamp();
      apply();
    },
    setRadar: (r) => {
      current = typeof r === "string" ? { local: r, remote: null } : r;
      note.hidden = true;
      fallback.replaceChildren();
      image.setAttribute("href", current.local);
    },
    onZoom: (fn) => (zoomers.add(fn), () => zoomers.delete(fn)),
    refresh: apply,
    get zoom() {
      return view.s;
    },
  };
}

// A line through points (0 to 1), constant width on screen.
export function pathLine(points, cls, width = 3) {
  return svgEl("polyline", { points: points.map((p) => `${p.x * SIZE},${p.y * SIZE}`).join(" "), class: cls, "data-w": width, fill: "none" });
}

// A dot at a position (0 to 1), constant size on screen.
export function dot(pos, cls, r, attrs = {}) {
  return svgEl("circle", { cx: pos.x * SIZE, cy: pos.y * SIZE, r, "data-r": r, class: cls, ...attrs });
}
