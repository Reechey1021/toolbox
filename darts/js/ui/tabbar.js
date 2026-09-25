// ui/tabbar.js
// The menu bar floating at the bottom: Home, Stats, Friends, Profile, Settings.
// Everywhere except during a match (and the bull throw), to keep the oche view clear.

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { friendsState, onFriendsChange } from "../services/friends.js";

const TABS = [
  { path: "/", label: "Home", icon: "home", match: /^\/($|setup|nemesis|arcade|online|lobby|join|summary)/ },
  { path: "/stats", label: "Stats", icon: "chart", match: /^\/stats/ },
  { path: "/friends", label: "Friends", icon: "users", match: /^\/(friends|add)/ },
  { path: "/profile", label: "Profile", icon: "user", match: /^\/(profile|history)/ },
  { path: "/settings", label: "Settings", icon: "sliders", match: /^\/settings/ },
];
const HIDDEN = /^\/(game|bull|welcome)/;

export function mountTabbar() {
  const badge = h("span", { class: "tabbar__badge", hidden: true });
  const links = TABS.map((t) =>
    h("a", { class: "tabbar__tab", href: `#${t.path}` }, h("span", { class: "tabbar__icon" }, icon(t.icon, { size: 22 }), t.path === "/friends" ? badge : null), h("span", { class: "tabbar__label" }, t.label))
  );
  const bar = h("nav", { class: "tabbar", "aria-label": "Main" }, links);
  document.body.append(bar);

  function update() {
    const path = location.hash.replace(/^#/, "") || "/";
    const hidden = HIDDEN.test(path);
    bar.hidden = hidden;
    document.body.classList.toggle("has-tabbar", !hidden);
    TABS.forEach((t, i) => {
      const on = t.match.test(path);
      links[i].classList.toggle("is-active", on);
      links[i].toggleAttribute("aria-current", on);
    });
  }
  function paintBadge() {
    const n = friendsState().incoming.length;
    badge.hidden = n === 0;
    badge.textContent = String(n);
  }
  window.addEventListener("hashchange", update);
  window.addEventListener("routechange", update);
  onFriendsChange(paintBadge);
  update();
  paintBadge();
}
