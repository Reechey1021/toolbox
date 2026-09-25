// screens/setup.js
// How to record lineups, practice-server commands, and where the library lives.

import { h } from "../ui/dom.js";
import { confirm, toast } from "../ui/components.js";
import { listLineups, deleteLineup } from "../services/store.js";
import { h as hh, replaceChildren } from "../ui/dom.js";
import { accountState, onAccount, addContributor, removeContributor, setUpAccess } from "../services/account.js";
import { cloudAvailable } from "../services/cloud.js";
import { clipHostReady } from "../services/clips.js";
import { publishDeviceLineups } from "../services/library.js";

const PRACTICE = `sv_cheats 1
mp_warmup_end
mp_roundtime_defuse 60
mp_freezetime 0
mp_buy_anywhere 1
mp_maxmoney 60000
mp_startmoney 60000
sv_infinite_ammo 1
ammo_grenade_limit_total 5
sv_grenade_trajectory_prac_pipreview 1
mp_restartgame 1`;

// Who can add lineups (the admin keeps the list), and publishing device lineups.
function accessSection() {
  const box = hh("div", { class: "access" });
  async function paint() {
    const a = accountState();
    const local = await listLineups();
    const parts = [];
    if (!cloudAvailable()) parts.push(hh("p", { class: "muted" }, "Accounts are off: everything is saved in this browser."));
    else if (!a.user) parts.push(hh("p", { class: "muted" }, "Sign in (bottom of the menu) to see who can add lineups."));
    else if (!a.access) {
      parts.push(hh("p", null, "Nobody's set up access yet. If this is your library, you'll be the admin."), hh("button", { class: "btn btn--primary", type: "button", onclick: () => setUpAccess().catch(() => toast("Only the library's owner can do that (see SETUP.md).", { tone: "bad" })) }, "Set up access"));
    } else {
      parts.push(hh("p", null, a.admin ? "You're the admin. Contributors can add lineups; everyone else can browse, watch and keep favourites." : a.contributor ? "You're a contributor: you can add lineups." : "You can browse, watch and keep favourites. Ask the library's owner to make you a contributor."));
      if (a.admin) {
        const input = hh("input", { class: "field", type: "email", placeholder: "friend@gmail.com", "aria-label": "Contributor's email" });
        const add = async () => {
          try {
            await addContributor(input.value);
            input.value = "";
            toast("Contributor added", { tone: "ok" });
          } catch (err) {
            toast(err.message, { tone: "bad" });
          }
        };
        input.addEventListener("keydown", (e) => e.key === "Enter" && add());
        parts.push(
          hh("h3", { class: "access__h" }, "Contributors"),
          (a.access.contributors || []).length
            ? hh("ul", { class: "access__list" }, a.access.contributors.map((e) => hh("li", null, hh("span", null, e), hh("button", { class: "btn btn--quiet access__rm", type: "button", onclick: () => removeContributor(e) }, "Remove"))))
            : hh("p", { class: "muted" }, "Just you so far."),
          hh("div", { class: "access__add" }, input, hh("button", { class: "btn btn--quiet", type: "button", onclick: add }, "Add"))
        );
      }
      parts.push(hh("p", { class: ["access__clips", clipHostReady() ? "is-ok" : "is-warn"] }, clipHostReady() ? "Clip hosting is set up: new lineups go to the shared library." : "Clip hosting isn't set up yet, so new lineups are saved on this device. SETUP.md explains the five-minute setup."));
      if (a.contributor && clipHostReady() && local.length) {
        const btn = hh(
          "button",
          {
            class: "btn btn--primary",
            type: "button",
            onclick: async () => {
              btn.disabled = true;
              try {
                const n = await publishDeviceLineups((i, of) => (btn.textContent = `Publishing ${i} of ${of}\u2026`));
                toast(`${n} ${n === 1 ? "lineup" : "lineups"} added to the shared library`, { tone: "ok" });
              } catch (err) {
                toast(err.message || "Couldn't publish those", { tone: "bad" });
              }
              paint();
            },
          },
          `Publish the ${local.length} ${local.length === 1 ? "lineup" : "lineups"} on this device`
        );
        parts.push(btn);
      }
    }
    replaceChildren(box, ...parts);
  }
  onAccount(paint);
  paint();
  return box;
}

export function setupScreen() {
  const code = (text) =>
    h(
      "div",
      { class: "codeblock" },
      h("pre", null, text),
      h(
        "button",
        {
          class: "btn btn--quiet codeblock__copy",
          type: "button",
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast("Copied", { tone: "ok" });
            } catch {
              toast("Couldn't copy: select it instead");
            }
          },
        },
        "Copy"
      )
    );
  return {
    el: h(
      "main",
      { class: "page cs-page cs-prose" },
      h("header", { class: "cs-head" }, h("h1", { class: "cs-title" }, "Settings")),
      h("h2", null, "Recording a lineup"),
      h(
        "ol",
        null,
        h("li", null, "Start a practice server (commands below) and stand exactly where you throw from."),
        h("li", null, "Open the console and type ", h("code", null, "getpos"), ". Copy the line it prints (setpos \u2026;setang \u2026): pasting it into Add content places the throw spot exactly."),
        h("li", null, "Record about five seconds: aim, throw, and a moment of the flight. The crosshair must be visible; the magnifier zooms into the middle of the clip."),
        h("li", null, "In Add content, pick the clip, fill in the tags, mark the landing spot (and any bounces) on the map, and save.")
      ),
      h("h2", null, "Practice server commands"),
      h("p", { class: "muted" }, "Paste into the console after starting a local game (Play, Practice, with bots off)."),
      code(PRACTICE),
      h("h2", null, "Who can add lineups"),
      accessSection(),
      h("h2", null, "Where your library lives"),
      h("p", null, "Shared lineups live in the library everyone sees. Lineups saved before sharing was set up (or while clip hosting isn't) stay in this browser until you publish them."),
      h(
        "button",
        {
          class: "btn btn--ghost",
          type: "button",
          onclick: async () => {
            if (!(await confirm({ title: "Delete the lineups on this device?", lead: "Only ones saved in this browser, with their clips. The shared library isn't touched.", confirmLabel: "Delete them", tone: "danger" }))) return;
            for (const l of await listLineups()) await deleteLineup(l.id);
            toast("Library cleared");
          },
        },
        "Clear this device's lineups"
      )
    ),
    title: "Settings",
  };
}
