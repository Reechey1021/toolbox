// ui/dom.js
// A tiny element builder so screens read like markup without a framework.
//
//   h("button", { class: "btn", onclick: go }, "Start match")
//   h("div", { class: ["card", active && "is-active"] }, child, [more, children])

export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, children);
  return el;
}

function applyProps(el, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = classNames(value);
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key === "html") el.innerHTML = value;
    else if (key === "ref") value(el);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== "string") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
}

export function classNames(v) {
  if (Array.isArray(v)) return v.flat(Infinity).filter(Boolean).join(" ");
  return String(v);
}

export function append(el, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function replaceChildren(el, ...children) {
  clear(el);
  return append(el, children);
}

// Number formatting used across screens.
export const fmt = {
  avg: (v, digits = 2) => (v === null || v === undefined || Number.isNaN(v) ? "–" : v.toFixed(digits)),
  pct: (v) => (v === null || v === undefined ? "–" : `${Math.round(v)}%`),
  int: (v) => (v === null || v === undefined ? "–" : String(v)),
  date: (ts) =>
    new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
  time: (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
};

export const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
