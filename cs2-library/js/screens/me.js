// screens/me.js
// Your profile and preferences: nickname (the author on your lineups), how clips
// play, and your wake word. Saved to your account when you're signed in, so they
// follow you; on this device otherwise.

import { h, replaceChildren } from "../ui/dom.js";
import { segmented, toast } from "../ui/components.js";
import { accountState, onAccount, signIn, signOut } from "../services/account.js";
import { preferences, setPreferences, onPlayback, savedWhere, displayNickname } from "../services/playback.js";
import { WAKE_WORDS } from "../data/voice.js";
import { cloudAvailable } from "../services/cloud.js";

const PLAYS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 0, label: "Keep playing" },
];

export function meScreen() {
  const who = h("section", { class: "addsec me" });
  const saved = h("p", { class: "pset__saved" });

  function paintWho() {
    const a = accountState();
    const parts = [];
    if (a.user) {
      const initials = (a.user.name || a.user.email).split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
      parts.push(
        h(
          "div",
          { class: "me__head" },
          a.user.photoURL ? h("img", { class: "me__avatar", src: a.user.photoURL, alt: "", referrerpolicy: "no-referrer" }) : h("span", { class: "me__avatar me__avatar--i" }, initials),
          h("div", { class: "me__text" }, h("h2", { class: "me__name" }, a.user.name || a.user.email), h("p", { class: "me__email muted" }, a.user.email), h("span", { class: "me__role" }, a.admin ? "Admin" : a.contributor ? "Contributor" : "Viewer")),
          h("button", { class: "btn btn--quiet", type: "button", onclick: () => signOut() }, "Sign out")
        )
      );
    } else if (cloudAvailable() && a.status !== "offline") {
      parts.push(h("p", null, "You're not signed in. Your preferences are saved on this device; sign in to keep them on every device."), h("button", { class: "btn btn--primary", type: "button", onclick: () => signIn().catch((e) => toast(e.message, { tone: "bad" })) }, "Sign in with Google"));
    } else parts.push(h("p", { class: "muted" }, "Your preferences are saved on this device."));
    replaceChildren(who, h("h2", { class: "addsec__title" }, "You"), ...parts);
    saved.textContent = savedWhere() === "account" ? "Saved to your account, on every device." : "Saved on this device.";
  }

  const nick = h("input", {
    class: "field",
    type: "text",
    maxlength: 24,
    "aria-label": "Nickname",
    onchange: (e) => {
      setPreferences({ nickname: e.target.value });
      toast("Nickname saved", { tone: "ok" });
    },
  });
  const nickBox = h("div");
  const playBox = h("div", { class: "pset" });
  const wakeSel = h("select", { class: "field select", "aria-label": "Wake word", onchange: (e) => setPreferences({ wakeId: e.target.value }) });

  function paintPrefs() {
    const p = preferences();
    nick.value = p.nickname;
    nick.placeholder = displayNickname() || "e.g. Reech";
    replaceChildren(
      playBox,
      h("div", { class: "pset__row" }, h("span", { class: "pset__label" }, "Speed"), segmented({ label: "Speed", value: p.speed, options: [1, 0.5, 0.25].map((v) => ({ value: v, label: `${v}\u00d7` })), onChange: (v) => setPreferences({ speed: v }) })),
      h("div", { class: "pset__row" }, h("span", { class: "pset__label" }, "Magnify"), segmented({ label: "Magnify", value: p.zoom, options: [2, 3, 4, 5].map((v) => ({ value: v, label: `\u00d7${v}` })), onChange: (v) => setPreferences({ zoom: v }) })),
      h("div", { class: "pset__row" }, h("span", { class: "pset__label" }, "Close after"), segmented({ label: "Close after", value: p.autoClose, options: PLAYS, className: "seg--wrap", onChange: (v) => setPreferences({ autoClose: v }) }))
    );
    replaceChildren(wakeSel, ...WAKE_WORDS.map((w) => h("option", { value: w.id, selected: p.wakeId === w.id }, w.label)));
    wakeSel.value = p.wakeId;
  }

  const offA = onAccount(() => (paintWho(), paintPrefs()));
  const offP = onPlayback(() => paintPrefs());
  paintWho();
  paintPrefs();
  replaceChildren(nickBox, nick);

  const el = h(
    "main",
    { class: "page cs-page mepage" },
    h("header", { class: "cs-head" }, h("p", { class: "cs-kicker" }, "Profile"), h("h1", { class: "cs-title" }, "Your preferences")),
    who,
    h(
      "section",
      { class: "addsec" },
      h("h2", { class: "addsec__title" }, "Nickname"),
      nickBox,
      h("p", { class: "muted" }, "Shown as the author on lineups you add. Leave it empty to use your Google first name.")
    ),
    h("section", { class: "addsec" }, h("h2", { class: "addsec__title" }, "Playback"), playBox, h("p", { class: "muted" }, "How clips play when they open. \u201cClose after\u201d means you never need to tab out of the game.")),
    h("section", { class: "addsec" }, h("h2", { class: "addsec__title" }, "Voice"), h("div", { class: "addfield" }, h("span", { class: "addfield__label" }, "Wake word"), wakeSel), h("p", { class: "muted" }, "Language, beeps and what you're playing are on the Voice assistant tab.")),
    saved
  );
  return {
    el,
    title: "Your preferences",
    destroy() {
      offA();
      offP();
    },
  };
}
