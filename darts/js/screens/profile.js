// screens/profile.js
// Your dashboard: who you are, your account, your numbers, your darts, and how
// the caller says your name. Works as a guest too; signing in backs it all up.

import { h, fmt, replaceChildren } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { topBar, stepper, toast } from "../ui/components.js";
import { getOwner, saveOwner, saveOwnerFields, initials } from "../services/profile.js";
import { callerNames, discoverNames } from "../services/names.js";
import { accountState, onAccountChange, signIn, signOut, statusText } from "../services/account.js";
import { matches } from "../services/storage.js";
import { lifetimeStats } from "../engine/stats.js";
import * as caller from "../services/caller.js";
import { friendCodeCard } from "./parts/friendCode.js";
import { matchRow } from "./history.js";
import { visibleTo } from "../engine/records.js";
import { linkRow } from "../ui/components.js";

// "Target Power 9Five, 23g"
function dartsLine(eq) {
  if (!eq || !(eq.brand || eq.model)) return null;
  return [eq.brand, eq.model].filter(Boolean).join(" ") + (eq.weight ? `, ${eq.weight}g` : "");
}

const BRANDS = ["Target", "Winmau", "Unicorn", "Harrows", "Red Dragon", "Mission", "Shot", "One80", "Cosmo", "Loxley", "Bull's", "Datadart"];

export function avatar(owner, size = 72) {
  const photo = owner?.account?.photoURL;
  return photo
    ? h("img", { class: "avatar", src: photo, alt: "", width: size, height: size, referrerpolicy: "no-referrer", style: { width: `${size}px`, height: `${size}px` } })
    : h("span", { class: "avatar avatar--initials", style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }, "aria-hidden": "true" }, initials(owner?.name));
}

export async function profileScreen() {
  let owner = getOwner();
  const records = await matches.list();
  const life = lifetimeStats(records, owner.id);
  const recent = records.filter((r) => visibleTo(r, owner.id)).slice(0, 5);

  // ---------------------------------------------------------------- who you are
  const head = h("section", { class: "me" });
  const accountBox = h("section", { class: "section" });

  function renderHead() {
    owner = getOwner();
    const st = accountState();
    replaceChildren(
      head,
      avatar(owner, 76),
      h(
        "div",
        { class: "me__text" },
        h("h2", { class: "me__name" }, owner.name),
        dartsLine(owner.equipment) ? h("p", { class: "me__darts" }, icon("target", { size: 16 }), h("span", null, dartsLine(owner.equipment))) : null,
        h("p", { class: "me__sub" }, st.user ? st.user.email : "Guest on this device")
      )
    );
  }

  function renderAccount() {
    const st = accountState();
    const tone = st.status === "synced" ? "ok" : st.status === "error" ? "bad" : st.status === "offline" ? "warn" : "";
    const status = h("p", { class: ["account__status", tone && `is-${tone}`] }, h("span", { class: "account__dot", "aria-hidden": "true" }), statusText(st));

    let body;
    if (st.status === "off") {
      body = [
        h("p", { class: "account__lead" }, "Sign in with Google to back up your matches, use your stats on any device, and play friends online."),
        status,
        h("p", { class: "faint account__note" }, "This needs a one-off Firebase setup. The steps are in FIREBASE_SETUP.md in the project folder."),
      ];
    } else if (!st.user) {
      body = [
        h("p", { class: "account__lead" }, "Sign in with Google to back up your matches, use your stats on any device, and play friends online."),
        h(
          "button",
          {
            class: "btn btn--google btn--block",
            type: "button",
            disabled: st.status === "loading",
            onclick: async () => {
              try {
                await signIn();
              } catch (err) {
                toast(err.message || "Sign-in didn't work. Try again.", { tone: "bad" });
              }
            },
          },
          h("span", { class: "g-mark", "aria-hidden": "true" }, "G"),
          h("span", { class: "btn__label" }, "Sign in with Google")
        ),
        h("p", { class: "faint account__note" }, "Your matches on this device come with you."),
      ];
    } else {
      body = [
        status,
        h(
          "button",
          {
            class: "btn btn--quiet btn--block",
            type: "button",
            onclick: async () => {
              await signOut();
              toast("Signed out. Your matches stay on this device.");
            },
          },
          "Sign out"
        ),
      ];
    }
    replaceChildren(
      accountBox,
      h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Account")),
      h("div", { class: "account" }, body),
      st.user ? h("div", { class: "account__code" }, friendCodeCard(), h("a", { class: "section__link", href: "#/friends" }, "See your friends")) : null
    );
  }

  const off = onAccountChange(() => {
    renderHead();
    renderAccount();
  });
  renderHead();
  renderAccount();

  // ---------------------------------------------------------------- your numbers
  const cell = (label, value) => h("div", { class: "statcell" }, h("dt", null, label), h("dd", { class: "num" }, value));
  const numbers = life.matches
    ? h(
        "dl",
        { class: "statgrid" },
        cell("3-dart average", fmt.avg(life.avg)),
        cell("First 9", fmt.avg(life.first9)),
        cell("Checkout", fmt.pct(life.checkoutPct)),
        cell("180s", life.s180)
      )
    : h("p", { class: "muted" }, "Your numbers show up here once you've finished a match.");

  // ---------------------------------------------------------------- your darts
  const eq = { brand: "", model: "", weight: 22, ...(owner.equipment || {}) };
  let saveTimer = null;
  const flushDarts = () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveOwnerFields({ equipment: { ...eq } });
    renderHead(); // your darts show under your name
  };
  const saveDarts = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushDarts, 400);
  };
  const brandList = h("datalist", { id: "dart-brands" }, BRANDS.map((b) => h("option", { value: b })));
  const brand = h("input", {
    class: "field",
    type: "text",
    list: "dart-brands",
    maxlength: 30,
    value: eq.brand,
    placeholder: "Brand, e.g. Target",
    "aria-label": "Dart brand",
    oninput: (e) => ((eq.brand = e.target.value.trim()), saveDarts()),
  });
  const model = h("input", {
    class: "field",
    type: "text",
    maxlength: 40,
    value: eq.model,
    placeholder: "Model, e.g. Phil Taylor Power 9Five",
    "aria-label": "Dart model",
    oninput: (e) => ((eq.model = e.target.value.trim()), saveDarts()),
  });
  const weight = stepper({ value: eq.weight, min: 12, max: 50, label: "grams", format: (v) => `${v}g`, onChange: (v) => ((eq.weight = v), saveDarts()) });

  // ---------------------------------------------------------------- the caller
  // A dropdown of every recording in audio/names, refreshed in the background.
  const callPicker = h("select", { class: "field select", "aria-label": "Announcer name" });
  function fillNames(names) {
    const current = getOwner().callerName || "";
    const list = current && !names.includes(current) ? [...names, current] : names;
    callPicker.replaceChildren(h("option", { value: "" }, "Select"), ...list.map((n) => h("option", { value: n }, n)));
    callPicker.value = current;
  }
  fillNames(callerNames());
  discoverNames().then((names) => fillNames(names));
  callPicker.addEventListener("change", () => {
    const v = callPicker.value;
    saveOwnerFields({ callerName: v });
    if (!v) return;
    caller.unlock();
    caller.sampleName(v);
  });
  const hear = h(
    "button",
    {
      class: "btn btn--quiet announcer__play",
      type: "button",
      "aria-label": "Hear it",
      onclick: () => {
        caller.unlock();
        caller.sampleName(callPicker.value);
      },
    },
    icon("speaker", { size: 20 }),
    h("span", { class: "btn__label" }, "Hear it")
  );

  // ---------------------------------------------------------------- your name
  const nameInput = h("input", { class: "field", type: "text", value: owner.name, maxlength: 16, autocapitalize: "words", "aria-label": "Your name" });
  nameInput.addEventListener("change", () => {
    const v = nameInput.value.trim();
    if (!v) return (nameInput.value = getOwner().name);
    if (v === getOwner().name) return;
    saveOwner({ name: v });
    renderHead();
    toast("Name saved");
  });

  const el = h(
    "main",
    { class: "page profile" },
    topBar({ title: "Your profile", back: "#/" }),
    head,
    h(
      "section",
      { class: "section" },
      h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Your numbers"), life.matches ? h("a", { class: "section__link", href: "#/stats" }, "All stats") : null),
      numbers
    ),
    h(
      "section",
      { class: "section" },
      h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Recent matches"), recent.length ? h("a", { class: "section__link", href: "#/history" }, "Full history") : null),
      recent.length ? h("div", { class: "rows" }, recent.map((r) => matchRow(r, owner))) : h("p", { class: "muted" }, "Your finished matches show up here.")
    ),
    h("h2", { class: "profile__group" }, "Profile settings"),
    accountBox,
    h(
      "section",
      { class: "section" },
      h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Your name")),
      nameInput,
      h("p", { class: "setup__hint faint" }, "Shown on the scoreboard, and to friends when you play online.")
    ),
    h(
      "section",
      { class: "section" },
      h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Announcer")),
      h("div", { class: "announcer" }, callPicker, hear),
      h("p", { class: "setup__hint faint" }, "The recording the caller uses for you: \u201cRichard, you require 32.\u201d Add an MP3 to the audio/names folder and it appears here.")
    ),
    h(
      "section",
      { class: "section" },
      h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Your darts")),
      h("div", { class: "darts-form" }, brandList, brand, model, h("div", { class: "darts-form__weight" }, h("span", { class: "muted" }, "Weight"), weight))
    ),
    h("section", { class: "section rows" }, linkRow({ label: "App settings", hint: "Caller, scoring, this device and your data", iconName: "sliders", href: "#/settings" }))
  );

  return {
    el,
    title: "Your profile",
    destroy() {
      off();
      if (saveTimer) flushDarts(); // don't lose a change made just before leaving
    },
  };
}
