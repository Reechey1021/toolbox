// main.js
// CS2 Library: a lineup library for Counter-Strike 2. Self-contained: this
// folder doesn't depend on anything else in the toolbox.

import { h } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { defineRoutes, currentPath } from "./ui/router.js";
import { libraryScreen } from "./screens/library.js";
import { mapScreen } from "./screens/mapView.js";
import { addScreen } from "./screens/add.js";
import { liveScreen } from "./screens/live.js";
import { setupScreen } from "./screens/setup.js";
import { voiceScreen } from "./screens/voice.js";
import { meScreen } from "./screens/me.js";
import { spawnsScreen } from "./screens/spawns.js";
import { mountVoicePill } from "./ui/voicePill.js";
import "./services/assistant.js"; // acts on voice requests from any tab
import { initAccount, onAccount, accountState, signIn, signOut } from "./services/account.js";
import { cloudAvailable } from "./services/cloud.js";
import { toast } from "./ui/components.js";

const NAV = [
  { path: "/library", label: "Library", icon: "map", match: /^\/(library|spawns|$)/ },
  { path: "/voice", label: "Voice assistant", icon: "mic", match: /^\/voice/ },
  { path: "/live", label: "Live game", icon: "target", match: /^\/live/, soon: true },
  { path: "/add", label: "Add content", icon: "upload", match: /^\/add/ },
  { path: "/setup", label: "Settings", icon: "sliders", match: /^\/setup/ },
];

// ---------------------------------------------------------------- the side menu
const side = document.getElementById("side");
const scrim = document.getElementById("scrim");
const links = NAV.map((n) =>
  h("a", { class: "side__link", href: `#${n.path}` }, icon(n.icon, { size: 20 }), h("span", null, n.label), n.soon ? h("span", { class: "tag side__soon" }, "Later") : null)
);
// Who you are: sign in for favourites (and adding, if you're a contributor).
const who = h("div", { class: "side__who" });
function paintWho() {
  const a = accountState();
  if (!cloudAvailable() || a.status === "offline") return who.replaceChildren(); // accounts unreachable: nothing to offer
  if (!a.user) {
    return who.replaceChildren(
      h("button", { class: "btn btn--quiet side__signin", type: "button", disabled: a.status === "loading", onclick: () => signIn().catch((e) => toast(e.message, { tone: "bad" })) }, "Sign in with Google"),
      h("p", { class: "side__whynote" }, "For favourites, and adding lineups."),
      h("a", { class: "side__prefs", href: "#/me" }, "Preferences")
    );
  }
  const initials = (a.user.name || a.user.email).split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  who.replaceChildren(
    h(
      "a",
      { class: "side__me", href: "#/me", title: "Your profile and preferences" },
      a.user.photoURL ? h("img", { class: "side__avatar", src: a.user.photoURL, alt: "", referrerpolicy: "no-referrer" }) : h("span", { class: "side__avatar side__avatar--i" }, initials),
      h("span", { class: "side__whotext" }, h("span", { class: "side__name" }, a.user.name || a.user.email), h("span", { class: "side__role" }, a.admin ? "Admin" : a.contributor ? "Contributor" : "Viewer"))
    ),
    h("button", { class: "icon-btn side__out", type: "button", "aria-label": "Sign out", title: "Sign out", onclick: () => signOut() }, icon("close", { size: 18 }))
  );
}
onAccount(paintWho);

side.append(
  h("div", { class: "side__brand" }, h("img", { src: "./icons/icon.svg", alt: "", width: 34, height: 34 }), h("span", null, "CS2 Library")),
  h("nav", { class: "side__nav" }, links),
  who,
  h("a", { class: "side__back", href: "../" }, icon("back", { size: 18 }), h("span", null, "Reech's Toolbox"))
);
paintWho();
initAccount();

function setOpen(open) {
  document.body.classList.toggle("side-open", open);
  scrim.hidden = !open;
}
document.getElementById("menuBtn").append(icon("menu"));
document.getElementById("menuBtn").addEventListener("click", () => setOpen(true));
scrim.addEventListener("click", () => setOpen(false));

function markActive() {
  const path = currentPath();
  NAV.forEach((n, i) => links[i].classList.toggle("is-active", n.match.test(path)));
  setOpen(false);
}
window.addEventListener("hashchange", markActive);
window.addEventListener("routechange", markActive);

// ---------------------------------------------------------------- routes
defineRoutes(
  [
    ["/", libraryScreen],
    ["/library", libraryScreen],
    ["/library/:map", mapScreen],
    ["/add", addScreen],
    ["/add/:id", addScreen],
    ["/live", liveScreen],
    ["/setup", setupScreen],
    ["/voice", voiceScreen],
    ["/me", meScreen],
    ["/spawns/:map", spawnsScreen],
  ],
  { mount: document.getElementById("app") }
);
markActive();
mountVoicePill();
