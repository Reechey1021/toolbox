// ui/components.js
// Shared interface pieces. Each returns plain DOM elements.

import { h, reducedMotion } from "./dom.js";
import { icon } from "./icons.js";

// ---------------------------------------------------------------------------
// Sheets: bottom sheets on phones, centred dialogs on bigger screens.
// ---------------------------------------------------------------------------

const stack = [];

export function isSheetOpen() {
  return stack.length > 0;
}

document.addEventListener("keydown", (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === "Escape" && top.dismissible) {
    e.preventDefault();
    e.stopImmediatePropagation(); // the screen underneath shouldn't also react
    top.close(undefined);
  }
  if (e.key === "Tab") trapFocus(top.panel, e);
});

function focusables(root) {
  return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && el.offsetParent !== null
  );
}

function trapFocus(panel, e) {
  const items = focusables(panel);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function openSheet({ title, lead = null, body = null, actions = null, dismissible = true, className = null, focus = true }) {
  let resolve;
  const closed = new Promise((r) => (resolve = r));
  const returnFocus = document.activeElement;

  const panel = h(
    "div",
    { class: ["sheet", className], role: "dialog", "aria-modal": "true", "aria-label": title || "Dialog" },
    h(
      "div",
      { class: "sheet__head" },
      title ? h("h2", { class: "sheet__title" }, title) : null,
      dismissible
        ? h("button", { class: "icon-btn sheet__close", type: "button", "aria-label": "Close", onclick: () => close(undefined) }, icon("close"))
        : null
    ),
    lead ? h("p", { class: "sheet__lead" }, lead) : null,
    body ? h("div", { class: "sheet__body" }, body) : null,
    actions ? h("div", { class: "sheet__actions" }, actions) : null
  );
  const backdrop = h("div", { class: "sheet-backdrop", onclick: () => dismissible && close(undefined) });
  const layer = h("div", { class: "sheet-layer" }, backdrop, panel);
  document.body.append(layer);
  requestAnimationFrame(() => layer.classList.add("is-open"));

  const entry = { panel, dismissible, close };
  stack.push(entry);

  if (focus) {
    requestAnimationFrame(() => {
      const target = panel.querySelector("[data-autofocus]") || focusables(panel).find((el) => !el.classList.contains("sheet__close"));
      (target || panel).focus?.({ preventScroll: true });
    });
  }

  let done = false;
  function close(result) {
    if (done) return;
    done = true;
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    layer.classList.remove("is-open");
    const remove = () => layer.remove();
    if (reducedMotion()) remove();
    else setTimeout(remove, 220);
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus?.({ preventScroll: true });
    resolve(result);
  }

  return { panel, close, closed };
}

// Ask a question with a handful of answers. Resolves with the chosen value,
// or undefined if dismissed.
export function choose({ title, lead = null, options, layout = "stack", dismissible = true, extra = null }) {
  let sheet;
  const buttons = options.map((opt) =>
    h(
      "button",
      {
        type: "button",
        class: ["btn", opt.tone ? `btn--${opt.tone}` : "btn--quiet", layout === "grid" && "btn--tile"],
        disabled: opt.disabled,
        "data-autofocus": opt.autofocus ? "" : null,
        onclick: () => sheet.close(opt.value),
      },
      h("span", { class: "btn__label" }, opt.label),
      opt.sub ? h("span", { class: "btn__sub" }, opt.sub) : null
    )
  );
  sheet = openSheet({
    title,
    lead,
    dismissible,
    body: [h("div", { class: ["choices", `choices--${layout}`], style: layout === "grid" ? { "--cols": String(options.length) } : null }, buttons), extra],
  });
  return sheet.closed;
}

export function confirm({ title, lead = null, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "primary" }) {
  return choose({
    title,
    lead,
    options: [
      { label: confirmLabel, value: true, tone, autofocus: true },
      { label: cancelLabel, value: false },
    ],
  }).then((v) => v === true);
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

let toastHost = null;

export function toast(message, { tone = "neutral", ms = 2600 } = {}) {
  if (!toastHost) {
    toastHost = h("div", { class: "toast-host", role: "status", "aria-live": "polite" });
    document.body.append(toastHost);
  }
  const el = h("div", { class: ["toast", `toast--${tone}`] }, message);
  toastHost.append(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  setTimeout(() => {
    el.classList.remove("is-in");
    setTimeout(() => el.remove(), 250);
  }, ms);
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

// A row of mutually exclusive options.
export function segmented({ options, value, onChange, label, className = null }) {
  let current = value;
  const buttons = options.map((opt) =>
    h(
      "button",
      {
        type: "button",
        role: "radio",
        class: "seg__opt",
        "aria-checked": String(opt.value === current),
        disabled: opt.disabled,
        onclick: () => {
          if (opt.value === current) return;
          set(opt.value);
          onChange?.(opt.value);
        },
      },
      opt.label
    )
  );
  const el = h("div", { class: ["seg", className], role: "radiogroup", "aria-label": label }, buttons);
  el.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const enabled = options.filter((o) => !o.disabled);
    const i = enabled.findIndex((o) => o.value === current);
    const next = enabled[(i + (e.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length];
    if (!next) return;
    e.preventDefault();
    set(next.value);
    onChange?.(next.value);
    buttons[options.indexOf(next)].focus();
  });
  function set(v) {
    current = v;
    buttons.forEach((b, i) => b.setAttribute("aria-checked", String(options[i].value === v)));
  }
  el.setValue = set;
  return el;
}

export function stepper({ value, min = 1, max = 99, step = 1, onChange, format = String, label }) {
  let current = value;
  const out = h("output", { class: "stepper__value", "aria-live": "polite" }, format(current));
  const dec = h("button", { type: "button", class: "icon-btn stepper__btn", "aria-label": `Fewer ${label || ""}`.trim(), onclick: () => bump(-1) }, icon("minus"));
  const inc = h("button", { type: "button", class: "icon-btn stepper__btn", "aria-label": `More ${label || ""}`.trim(), onclick: () => bump(1) }, icon("plus"));
  const el = h("div", { class: "stepper", role: "group", "aria-label": label }, dec, out, inc);
  function sync() {
    out.textContent = format(current);
    dec.disabled = current - step < min;
    inc.disabled = current + step > max;
  }
  function bump(dir) {
    const next = current + dir * step;
    if (next < min || next > max) return;
    current = next;
    sync();
    onChange?.(current);
  }
  el.setValue = (v) => {
    current = v;
    sync();
  };
  el.setLimits = (lo, hi, st = step) => {
    min = lo;
    max = hi;
    step = st;
    sync();
  };
  sync();
  return el;
}

// A setting row with an on/off switch.
export function switchRow({ label, hint = null, checked, onChange }) {
  const input = h("input", {
    type: "checkbox",
    class: "switch__input",
    checked,
    onchange: (e) => onChange?.(e.target.checked),
  });
  return h(
    "label",
    { class: "row row--switch" },
    h("span", { class: "row__text" }, h("span", { class: "row__label" }, label), hint ? h("span", { class: "row__hint" }, hint) : null),
    h("span", { class: "switch" }, input, h("span", { class: "switch__track", "aria-hidden": "true" }))
  );
}

// A tappable row that goes somewhere.
export function linkRow({ label, hint = null, iconName = null, href = null, onclick = null, tone = null, trailing = null }) {
  const tag = href ? "a" : "button";
  return h(
    tag,
    { class: ["row", "row--link", tone && `row--${tone}`], href, type: href ? null : "button", onclick },
    iconName ? h("span", { class: "row__icon" }, icon(iconName)) : null,
    h("span", { class: "row__text" }, h("span", { class: "row__label" }, label), hint ? h("span", { class: "row__hint" }, hint) : null),
    trailing ?? h("span", { class: "row__chev" }, icon("chevron", { size: 18 }))
  );
}

export function topBar({ title, sub = null, back = null, actions = [] }) {
  return h(
    "header",
    { class: "topbar" },
    back
      ? h("a", { class: "icon-btn", href: back, "aria-label": "Back" }, icon("back"))
      : h("span", { class: "topbar__spacer" }),
    h("div", { class: "topbar__title" }, h("h1", null, title), sub ? h("p", null, sub) : null),
    h("div", { class: "topbar__actions" }, actions)
  );
}
