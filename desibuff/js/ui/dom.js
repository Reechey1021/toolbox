// ui/dom.js
// h("div", { class: "x", onClick: fn }, child, "text", [more]) builds elements.

const SVG_NS = "http://www.w3.org/2000/svg";

function apply(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "ref") v(el);
    else if (k in el && !(el instanceof SVGElement) && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
}

function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  apply(el, props);
  append(el, kids);
  return el;
}

export function s(tag, props, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(props || {})) if (v != null) el.setAttribute(k, v);
  append(el, kids);
  return el;
}

/** Like el.append(), but skips null/false (the built-in append writes them out as text). */
export function put(el, ...kids) { append(el, kids); return el; }

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** Set text only if it changed (cheap updates 4 times a second). */
export function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
export function setClass(el, cls) { if (el && el.getAttribute("class") !== cls) el.setAttribute("class", cls); }

/**
 * Shrinks a big number until it fits its box (the font may still be loading,
 * or the value may be unusually long). Only re-measures when the text length
 * changes, so it costs nothing 4 times a second.
 */
export function fitWidth(el, box = el.parentElement) {
  if (!el || !box) return;
  const len = el.textContent.length;
  if (el._fitLen === len && el._fitW === box.clientWidth) return;
  el._fitLen = len; el._fitW = box.clientWidth;
  el.style.fontSize = "";
  const cs = getComputedStyle(box);
  const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const need = el.scrollWidth;
  if (avail > 0 && need > avail) {
    const base = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${Math.floor(base * (avail / need) * 0.98)}px`;
  }
}

// Simple line icons, drawn for this app at 24×24.
const P = {
  ride: "M5 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M13 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M8 17l3-7h4l3 7M11 10l-1.5-3H7M14 6h2",
  courses: "M4 18c2-6 6-1 8-6s5-6 8-4M4 18a1.5 1.5 0 1 0 .1 0M20 8a1.5 1.5 0 1 0 .1 0",
  profile: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8M4 21c1-4 4-6 8-6s7 2 8 6",
  back: "M15 5l-7 7l7 7",
  close: "M6 6l12 12M18 6L6 18",
  star: "M12 3.5l2.6 5.3l5.9.9l-4.3 4.1l1 5.8L12 16.9l-5.2 2.7l1-5.8L3.5 9.7l5.9-.9z",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  gps: "M12 21s-6-5.6-6-11a6 6 0 1 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5",
  sun: "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  play: "M8 5l11 7l-11 7z",
  pause: "M8 5v14M16 5v14",
  stop: "M7 7h10v10H7z",
  flag: "M5 21V4M5 4h12l-2 4l2 4H5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20h4l11-11l-4-4L4 16zM13 7l4 4",
  up: "M12 19V5M6 11l6-6l6 6",
  down: "M12 5v14M6 13l6 6l6-6",
  share: "M12 3v12M7 8l5-5l5 5M5 13v6h14v-6",
  download: "M12 3v12M7 10l5 5l5-5M5 19h14",
  upload: "M12 15V3M7 8l5-5l5 5M5 19h14",
  settings: "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14.6H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
  split: "M12 3v18M7 8h10M5 21h14",
  record: "M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  home: "M4 11l8-7l8 7M6 9.5V20h12V9.5",
  battery: "M3 8h15v8H3zM20 11v2",
  bolt: "M13 3L5 14h6l-1 7l8-11h-6z",
  compass: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M15.5 8.5l-2 5l-5 2l2-5z",
  mountain: "M3 19l6-10l4 6l2-3l6 7z",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M12 7v5l3 2",
};

export function icon(name, { filled = false, cls = "" } = {}) {
  return s("svg", { viewBox: "0 0 24 24", class: cls, "aria-hidden": "true", fill: filled ? "currentColor" : "none", stroke: "currentColor", "stroke-width": filled ? 1 : 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" },
    s("path", { d: P[name] || "" }));
}
