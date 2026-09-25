// main.js
// Boots the app: routes, the first-run guard, audio unlock and offline support.

import { defineRoutes } from "./ui/router.js";
import { hasOwner } from "./services/profile.js";
import { getActive, activeState } from "./services/session.js";
import { unlock as unlockAudio } from "./services/caller.js";
import { welcomeScreen } from "./screens/welcome.js";
import { homeScreen } from "./screens/home.js";
import { setupScreen } from "./screens/setup.js";
import { gameScreen } from "./screens/game.js";
import { summaryScreen } from "./screens/summary.js";
import { statsScreen } from "./screens/stats.js";
import { historyScreen } from "./screens/history.js";
import { settingsScreen } from "./screens/settings.js";
import { bullScreen } from "./screens/bull.js";
import { nemesisScreen } from "./screens/nemesis.js";
import { profileScreen } from "./screens/profile.js";
import { friendsScreen } from "./screens/friends.js";
import { friendScreen } from "./screens/friend.js";
import "./services/friends.js"; // starts watching your friends when you sign in
import { onOnlineChange, onlineState } from "./services/online.js";
import { onlineScreen, lobbyScreen, joinScreen, acceptInvite } from "./screens/online.js";
import { dismissInvite } from "./services/online.js";
import { navigate } from "./ui/router.js";
import { toast } from "./ui/components.js";
import { h } from "./ui/dom.js";
import { personAvatar } from "./screens/friends.js";
import { arcadeSetupScreen } from "./screens/arcadeSetup.js";
import { arcadePlayScreen } from "./screens/arcadePlay.js";
import { isArcade } from "./engine/arcade/core.js";
import { mountTabbar } from "./ui/tabbar.js";
import { initAccount } from "./services/account.js";
import { choose } from "./ui/components.js";
import { discoverNames } from "./services/names.js";
import { needsBull } from "./engine/match.js";

// Browsers only allow sound after a tap or key press. Unlock on the first one.
const unlockOnce = () => unlockAudio();
window.addEventListener("pointerdown", unlockOnce, { passive: true });
window.addEventListener("keydown", unlockOnce);

function guard(path) {
  if (!hasOwner()) return path === "/welcome" ? null : "/welcome";
  if (path === "/welcome") return "/";
  if ((path === "/game" || path === "/bull") && !getActive()) return "/";
  if (path === "/game" && needsBull(getActive().cfg)) return "/bull";
  if (path === "/bull" && !needsBull(getActive().cfg)) return "/game";
  if (path === "/summary") {
    const s = getActive() ? activeState() : null;
    if (!s || !s.finished) return getActive() ? "/game" : "/";
  }
  return null;
}

defineRoutes(
  [
    ["/", homeScreen],
    ["/welcome", welcomeScreen],
    ["/setup", setupScreen],
    ["/game", (params) => (isArcade(getActive()?.cfg) ? arcadePlayScreen(params) : gameScreen(params))],
    ["/arcade", arcadeSetupScreen],
    ["/arcade/:mode", arcadeSetupScreen],
    ["/bull", bullScreen],
    ["/nemesis", nemesisScreen],
    ["/profile", profileScreen],
    ["/friends", friendsScreen],
    ["/friends/:uid", friendScreen],
    ["/add/:code", friendsScreen],
    ["/online", onlineScreen],
    ["/lobby/:code", lobbyScreen],
    ["/join/:code", joinScreen],
    ["/nemesis/history", () => historyScreen({ filter: "nemesis" })],
    ["/summary", summaryScreen],
    ["/history", historyScreen],
    ["/history/:id", summaryScreen],
    ["/stats", statsScreen],
    ["/settings", settingsScreen],
  ],
  { mount: document.getElementById("app"), beforeEach: guard }
);

// Refresh the caller's name recordings in the background.
discoverNames();

// Accounts: dormant until Firebase is configured (see FIREBASE_SETUP.md).
// On a device's first sign-in you're asked whether to back up its matches.
initAccount({
  ask: (n) =>
    choose({
      title: "Bring your matches with you?",
      lead: `There ${n === 1 ? "is 1 match" : `are ${n} matches`} on this device. Add ${n === 1 ? "it" : "them"} to your account to back ${n === 1 ? "it" : "them"} up and see ${n === 1 ? "it" : "them"} on your other devices.`,
      dismissible: false,
      options: [
        { label: "Add to my account", value: true, tone: "primary", autofocus: true },
        { label: "Keep on this device only", value: false },
      ],
    }).then((v) => v !== false),
});

// Online: follow the lobby when the host starts, rematches or ends the match.
onOnlineChange((s, reason) => {
  const at = location.hash;
  const inOnline = /^#\/(lobby|game|summary)/.test(at);
  if (reason === "status:open" && s.code && /^#\/(game|summary)/.test(at)) navigate(`/lobby/${s.code}`);
  if (["closed", "gone", "removed"].includes(reason) && inOnline) {
    toast(reason === "removed" ? "You're no longer in that lobby" : "The host ended that game");
    navigate("/online", { replace: true });
  }
});

// Invites: a banner on any screen when a friend asks you to play.
const dismissed = new Set();
let banner = null;
onOnlineChange((s, reason) => {
  if (reason !== "invites" && reason !== "signed-out") return;
  banner?.remove();
  banner = null;
  const inv = s.invites.filter((i) => !dismissed.has(i.id) && i.code !== s.code).sort((a, b) => b.at - a.at)[0];
  if (!inv) return;
  banner = h(
    "div",
    { class: "invite", role: "status" },
    personAvatar({ name: inv.fromName, photoURL: inv.fromPhoto }, 36),
    h("span", { class: "invite__text" }, h("strong", null, inv.fromName), " invited you to play"),
    h("button", { class: "btn btn--primary invite__btn", type: "button", onclick: () => (dismissed.add(inv.id), banner?.remove(), acceptInvite(inv)) }, "Join"),
    h("button", { class: "icon-btn invite__close", type: "button", "aria-label": "Not now", onclick: () => (dismissed.add(inv.id), dismissInvite(inv.id), banner?.remove()) }, "\u00d7")
  );
  document.body.append(banner);
});
void onlineState;

// The menu bar at the bottom (hidden during a match).
mountTabbar();

// Offline support. Skipped on file:// and when ?nosw is in the URL (handy while developing).
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !new URLSearchParams(location.search).has("nosw")) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
      const reg = await navigator.serviceWorker.ready;
      // Hand over everything this page loaded, so the whole app works offline next time.
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name.split("#")[0])
        .filter((u) => u.startsWith(location.origin) && !u.includes("/audio/"));
      urls.push(location.href.split("#")[0]);
      reg.active?.postMessage({ type: "cache", urls: [...new Set(urls)] });
    } catch {
      /* offline support is a bonus, never a blocker */
    }
  });
}
