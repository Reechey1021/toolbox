// screens/settings.js

import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { topBar, switchRow, linkRow, segmented, confirm, toast } from "../ui/components.js";
import { getOwner, saveOwner } from "../services/profile.js";
import { getSettings, setSetting } from "../services/settings.js";
import { exportAll, importAll, wipeEverything } from "../services/storage.js";
import { downloadJson, pickJsonFile } from "../services/device.js";
import * as caller from "../services/caller.js";
import { VERSION, BUILD_DATE } from "../version.js";

export function settingsScreen() {
  const s = getSettings();
  const owner = getOwner();

  // ---------------------------------------------------------------- you
  const nameInput = h("input", {
    class: "field",
    type: "text",
    value: owner.name,
    maxlength: 16,
    autocapitalize: "words",
    "aria-label": "Your name",
  });
  const saveName = () => {
    const v = nameInput.value.trim();
    if (!v) {
      nameInput.value = getOwner().name;
      return;
    }
    if (v === getOwner().name) return;
    saveOwner({ name: v });
    toast("Name saved");
  };
  nameInput.addEventListener("change", saveName);
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && nameInput.blur());

  // ---------------------------------------------------------------- caller
  const volume = h("input", {
    class: "range",
    type: "range",
    min: 0,
    max: 1,
    step: 0.05,
    value: s.callerVolume,
    "aria-label": "Caller volume",
    oninput: (e) => {
      setSetting("callerVolume", Number(e.target.value));
      paintVolume();
    },
  });
  const paintVolume = () => volume.style.setProperty("--fill", `${Math.round(Number(volume.value) * 100)}%`);
  paintVolume();

  const el = h(
    "main",
    { class: "page settings" },
    topBar({ title: "Settings", back: "#/" }),

    group(
      "You",
      h("div", { class: "row row--stack" }, h("label", { class: "row__label" }, "Your name"), nameInput, h("span", { class: "row__hint" }, "Shown on the scoreboard and used for your stats.")),
      linkRow({
        label: "Your profile and account",
        hint: "Google sign-in, your darts, and how the caller says your name.",
        iconName: "user",
        href: "#/profile",
      })
    ),

    group(
      "Caller",
      switchRow({ label: "Call scores", hint: "Announces every visit, game shot and the match.", checked: s.callerEnabled, onChange: (v) => setSetting("callerEnabled", v) }),
      switchRow({ label: "Call what's required", hint: "\u201cYou require 32\u201d when the next player is on a finish.", checked: s.callerRemaining, onChange: (v) => setSetting("callerRemaining", v) }),
      h("div", { class: "row row--stack" }, h("span", { class: "row__label" }, "Volume"), volume),
      offlineCallerRow(),
      linkRow({
        label: "Test the caller",
        iconName: "speaker",
        trailing: h("span"),
        onclick: () => {
          caller.unlock();
          if (!getSettings().callerEnabled) return toast("Turn on Call scores first");
          caller.sample();
        },
      })
    ),

    group(
      "Scoring",
      h(
        "div",
        { class: "row row--stack" },
        h("span", { class: "row__label" }, "Start matches with"),
        segmented({
          label: "Default input",
          value: s.inputMode,
          options: [
            { value: "keypad", label: "Keypad" },
            { value: "darts", label: "Dart pad" },
          ],
          onChange: (v) => setSetting("inputMode", v),
        }),
        h("span", { class: "row__hint" }, "Keypad: type the visit total. Dart pad: tap each dart. You can switch during a match.")
      ),
      switchRow({
        label: "Track checkout doubles",
        hint: "The default for new matches. Needed for checkout percentage on the keypad.",
        checked: s.trackDoubles,
        onChange: (v) => setSetting("trackDoubles", v),
      })
    ),

    group(
      "Nemesis",
      switchRow({ label: "Show Nemesis' thoughts", hint: "A short line from Nemesis now and then, when something happens.", checked: s.nemesisThoughts, onChange: (v) => setSetting("nemesisThoughts", v) })
    ),

    group(
      "This device",
      switchRow({ label: "Keep the screen on", hint: "During matches, so your phone doesn't dim mid-leg.", checked: s.keepAwake, onChange: (v) => setSetting("keepAwake", v) }),
      switchRow({ label: "Vibrate on taps", hint: "Android only. iPhones don't allow it in the browser.", checked: s.haptics, onChange: (v) => setSetting("haptics", v) })
    ),

    group(
      "Your data",
      linkRow({
        label: "Back up everything",
        hint: "Saves a file with every match and setting.",
        iconName: "download",
        trailing: h("span"),
        onclick: async () => {
          const data = await exportAll();
          const stamp = new Date().toISOString().slice(0, 10);
          downloadJson(`reech-darts-backup-${stamp}.json`, data);
          toast(`Backed up ${data.matches.length} ${data.matches.length === 1 ? "match" : "matches"}`, { tone: "ok" });
        },
      }),
      linkRow({
        label: "Restore from a backup",
        hint: "Adds matches from a backup file. Nothing here is removed.",
        iconName: "upload",
        trailing: h("span"),
        onclick: async () => {
          try {
            const data = await pickJsonFile();
            if (!data) return;
            const { added } = await importAll(data);
            toast(added ? `Added ${added} ${added === 1 ? "match" : "matches"}` : "Nothing new in that backup", { tone: "ok" });
          } catch (err) {
            toast(err.message, { tone: "bad" });
          }
        },
      }),
      linkRow({
        label: "Delete everything",
        hint: "Every match, stat and setting on this device.",
        iconName: "trash",
        tone: "danger",
        trailing: h("span"),
        onclick: async () => {
          const ok = await confirm({
            title: "Delete everything?",
            lead: "Every match, stat and setting on this device goes. Back up first if you might want it.",
            confirmLabel: "Delete everything",
            tone: "danger",
          });
          if (!ok) return;
          await wipeEverything();
          location.hash = "#/welcome";
          location.reload();
        },
      })
    ),

    h(
      "footer",
      { class: "about" },
      h("p", null, `Reech Darts ${VERSION}, built ${BUILD_DATE}`),
      h("a", { class: "about__link", href: "./tests/" }, icon("check", { size: 16 }), "Run the engine tests")
    )
  );

  return { el, title: "Settings" };
}

// Save every caller clip so calls still work in a pub with no signal.
function offlineCallerRow() {
  const status = h("span", { class: "tag" }, "…");
  const hint = h("span", { class: "row__hint" }, "Downloads about 7 MB so every call works without signal.");
  let running = false;
  const row = h(
    "button",
    {
      class: "row row--link",
      type: "button",
      onclick: async () => {
        if (running) return;
        running = true;
        try {
          const { failed } = await caller.saveForOffline((done, total) => {
            status.textContent = `${Math.round((done / total) * 100)}%`;
          });
          if (failed) toast(`${failed} clips couldn't be saved. Try again with a better connection.`, { tone: "bad" });
          else toast("Caller saved for offline use", { tone: "ok" });
        } catch {
          toast("Couldn't save the caller on this browser", { tone: "bad" });
        } finally {
          running = false;
          refresh();
        }
      },
    },
    h("span", { class: "row__icon" }, icon("download")),
    h("span", { class: "row__text" }, h("span", { class: "row__label" }, "Save the caller for offline use"), hint),
    status
  );
  async function refresh() {
    const s = await caller.offlineStatus();
    if (!s.supported) {
      row.disabled = true;
      status.textContent = "Not available";
      hint.textContent = "Works once the app is on a secure (https) address, like GitHub Pages.";
      return;
    }
    const all = s.saved === s.total;
    status.textContent = all ? "Saved" : s.saved ? `${Math.round((s.saved / s.total) * 100)}%` : "Not saved";
    status.className = ["tag", all && "tag--win"].filter(Boolean).join(" ");
    hint.textContent = all ? "Every call works without signal." : "Downloads about 7 MB so every call works without signal.";
  }
  refresh();
  return row;
}

function group(title, ...rows) {
  return h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, title)), h("div", { class: "rows" }, rows));
}

