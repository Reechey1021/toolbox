// ui/layers.js
// Full-screen pages and bottom sheets that stack, plus toasts.
// The phone's back gesture closes the top layer first (see main.js).

import { h, icon, put } from "./dom.js";

const stack = [];

export function openPage({ title, render, onClose, actions = null }) {
  const body = h("div", { class: "page-body" });
  const titleEl = h("h1", {}, title);
  const layer = h("div", { class: "layer page", role: "dialog", "aria-label": title },
    h("div", { class: "inner" },
      h("header", { class: "page-head" },
        h("button", { class: "back", onClick: () => close(), "aria-label": "Vissza" }, icon("back"), "Vissza"),
        titleEl, actions),
      body));
  const entry = { layer, close, onClose, refresh: () => { body.replaceChildren(); render(body, entry); }, setTitle: (t) => { titleEl.textContent = t; } };
  function close() { removeLayer(entry); }
  stack.push(entry);
  document.getElementById("layers").appendChild(layer);
  render(body, entry);
  return entry;
}

export function openSheet({ render, onClose, dismissable = true }) {
  const inner = h("div", { class: "inner" });
  const layer = h("div", { class: "layer modal", role: "dialog" }, inner);
  const entry = { layer, close, onClose, dismissable, refresh: () => { inner.replaceChildren(); render(inner, entry); } };
  function close() { removeLayer(entry); }
  if (dismissable) layer.addEventListener("click", (e) => { if (e.target === layer) close(); });
  stack.push(entry);
  document.getElementById("layers").appendChild(layer);
  render(inner, entry);
  return entry;
}

function removeLayer(entry) {
  const i = stack.indexOf(entry);
  if (i < 0) return;
  stack.splice(i, 1);
  entry.layer.remove();
  entry.onClose?.();
}

/** Close the top layer (for the back gesture). Returns false if nothing was open. */
export function closeTop() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  if (top.dismissable === false) return true; // swallow back on a sheet that needs an answer
  top.close();
  return true;
}
export const hasLayers = () => stack.length > 0;
export function closeAll() { while (stack.length) stack[stack.length - 1].close(); }

export function confirmSheet({ title, text, ok = "Igen", cancel = "Mégse", danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const sheet = openSheet({
      onClose: () => { if (!answered) resolve(false); },
      render: (el) => {
        put(el, 
          h("h2", { class: "sheet-title" }, title),
          text ? h("p", { class: "sheet-text" }, text) : null,
          h("div", { class: "sheet-actions two" },
            h("button", { class: "btn secondary", onClick: () => { answered = true; sheet.close(); resolve(false); } }, cancel),
            h("button", { class: `btn ${danger ? "danger" : "primary"}`, onClick: () => { answered = true; sheet.close(); resolve(true); } }, ok)));
      },
    });
  });
}

export function toast(content, { kind = "", ms = 3200 } = {}) {
  // split call-outs go at the top (that's where he's looking); everything else at the
  // bottom, over the buttons, so it never hides the speed. Taps pass through toasts.
  const box = document.getElementById(kind.startsWith("split") ? "toasts-top" : "toasts");
  const el = h("div", { class: `toast ${kind}`, role: "status" }, content);
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), ms);
  return el;
}

/**
 * A button that needs two taps: the first arms it ("Biztos?"), the second does
 * it. Disarms itself after 4 seconds. Used for anything that ends a ride.
 */
export function twoTap(btn, { armedLabel = "Biztos? Koppints újra", onConfirm }) {
  const original = [...btn.childNodes];
  let timer = null;
  btn.addEventListener("click", () => {
    if (btn.classList.contains("armed")) {
      clearTimeout(timer);
      btn.classList.remove("armed");
      btn.replaceChildren(...original);
      onConfirm();
      return;
    }
    btn.classList.add("armed");
    btn.replaceChildren(armedLabel);
    try { navigator.vibrate?.(40); } catch { /* ignore */ }
    timer = setTimeout(() => { btn.classList.remove("armed"); btn.replaceChildren(...original); }, 4000);
  });
  return btn;
}
