// ui/router.js
// Hash routing (#/setup, #/game, #/history/abc). Works on any static host,
// GitHub Pages subfolders included, with no server rewrites.
//
// A screen is a function (params) => { el, destroy?, title? } or a Promise of one.

import { clear, reducedMotion } from "./dom.js";

let routes = [];
let outlet = null;
let current = null;
let guard = null;
let renderToken = 0;

export function defineRoutes(table, { mount, beforeEach = null }) {
  routes = table.map(([pattern, screen]) => ({ ...compile(pattern), screen }));
  outlet = mount;
  guard = beforeEach;
  window.addEventListener("hashchange", render);
  render();
}

function compile(pattern) {
  const keys = [];
  const re = new RegExp(
    "^" + pattern.replace(/\/:(\w+)/g, (_, k) => (keys.push(k), "/([^/]+)")).replace(/\//g, "\\/") + "\\/?$"
  );
  return { re, keys };
}

export function currentPath() {
  const raw = location.hash.replace(/^#/, "");
  return raw.startsWith("/") ? raw : "/";
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target) return render();
  if (replace) {
    history.replaceState(null, "", target);
    render();
  } else {
    location.hash = path;
  }
}

async function render() {
  const token = ++renderToken;
  const path = currentPath();

  if (guard) {
    const redirect = guard(path);
    if (redirect && redirect !== path) return navigate(redirect, { replace: true });
  }

  let match = null;
  for (const r of routes) {
    const m = r.re.exec(path);
    if (m) {
      match = { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      break;
    }
  }
  if (!match) return navigate("/", { replace: true });

  const view = await match.route.screen(match.params);
  if (token !== renderToken) {
    view?.destroy?.();
    return; // a newer navigation won
  }

  current?.destroy?.();
  current = view;
  clear(outlet);
  outlet.append(view.el);
  document.title = view.title ? `${view.title} | Reech Darts` : "Reech Darts";
  window.scrollTo(0, 0);

  if (!reducedMotion()) {
    view.el.classList.add("screen-enter");
    requestAnimationFrame(() => requestAnimationFrame(() => view.el.classList.remove("screen-enter")));
  }
  view.afterMount?.();
  // Every screen change, including ones that don't fire hashchange (replace navigations).
  window.dispatchEvent(new CustomEvent("routechange", { detail: path }));
}
