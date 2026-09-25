// js/main.js
// Charades: pick a topic (built in, or one you made), hold the phone to your
// forehead, and your friends act or describe the word. Tap the right half (or
// tilt the screen down) when you get it; tap the left half (or tilt up) to pass.

import { h, replaceChildren } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { openSheet, segmented, switchRow, toast, confirm } from "./ui/components.js";
import { TOPICS } from "./topics.js";
import * as store from "./store.js";
import { tiltAvailable, enableTilt, watchTilt } from "./tilt.js";

const app = document.getElementById("app");
const FEEDBACK_MS = 1000; // "Correct" and "Pass" stay up for a full second
let cleanup = [];
const clean = () => (cleanup.forEach((fn) => fn()), (cleanup = []));

const allTopics = () => [...TOPICS, ...store.games().map((g) => ({ ...g, builtIn: false }))];
const shuffle = (a) => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};

// ---------------------------------------------------------------- home: topics
function home() {
  clean();
  exitFullscreen();
  const topics = allTopics();
  replaceChildren(
    app,
    h(
      "main",
      { class: "cpage" },
      h("header", { class: "chead" }, h("a", { class: "icon-btn", href: "../", "aria-label": "Reech's Toolbox" }, icon("back")), h("h1", { class: "chead__title" }, "Charades"), h("button", { class: "btn btn--primary cnew", type: "button", onclick: () => creator() }, icon("plus", { size: 18 }), h("span", { class: "btn__label" }, "Create a game"))),
      h("p", { class: "muted csub" }, "Pick a topic to play."),
      h(
        "div",
        { class: "ctopics" },
        topics.map((t) =>
          h(
            "div",
            { class: "ctopic" },
            h("button", { class: "ctopic__play", type: "button", onclick: () => setup(t) }, h("span", { class: "ctopic__name" }, t.name), h("span", { class: "ctopic__count" }, `${t.words.length} words${t.builtIn ? "" : " · yours"}`)),
            t.builtIn ? null : h("button", { class: "icon-btn ctopic__edit", type: "button", "aria-label": `Edit ${t.name}`, onclick: () => creator(t) }, icon("more"))
          )
        )
      )
    )
  );
}

// ---------------------------------------------------------------- the game creator
function creator(game = null) {
  const name = h("input", { class: "field", type: "text", maxlength: 40, value: game?.name ?? "", placeholder: "e.g. Our holiday", "aria-label": "Name your game" });
  const words = h("textarea", { class: "field cwords", rows: 9, placeholder: "One per line (or separated by commas)", "aria-label": "Your words" }, game ? game.words.join("\n") : "");
  const sheet = openSheet({
    title: game ? "Edit your game" : "Create a game",
    body: [h("label", { class: "cfield" }, h("span", { class: "clabel" }, "Name your game"), name), h("label", { class: "cfield" }, h("span", { class: "clabel" }, "Add your words"), words)],
    actions: [
      h(
        "button",
        {
          class: "btn btn--primary btn--block",
          type: "button",
          onclick: () => {
            const list = store.parseWords(words.value);
            if (!name.value.trim()) return toast("Give your game a name", { tone: "bad" });
            if (list.length < 3) return toast("Add at least three words", { tone: "bad" });
            const rec = { id: game?.id ?? store.newId(), name: name.value.trim(), words: list };
            const all = store.games();
            store.saveGames(game ? all.map((g) => (g.id === game.id ? rec : g)) : [...all, rec]);
            sheet.close();
            home();
          },
        },
        "Save game"
      ),
      game
        ? h(
            "button",
            {
              class: "btn btn--ghost btn--block",
              type: "button",
              onclick: async () => {
                sheet.close();
                if (!(await confirm({ title: `Delete ${game.name}?`, confirmLabel: "Delete", tone: "danger" }))) return;
                store.saveGames(store.games().filter((g) => g.id !== game.id));
                home();
              },
            },
            "Delete this game"
          )
        : null,
    ],
  });
  setTimeout(() => name.focus(), 200);
}

// ---------------------------------------------------------------- before playing
function setup(topic) {
  clean();
  const s = store.settings();
  const opt = { ...s };
  replaceChildren(
    app,
    h(
      "main",
      { class: "cpage" },
      h("header", { class: "chead" }, h("button", { class: "icon-btn", type: "button", "aria-label": "Topics", onclick: home }, icon("back")), h("h1", { class: "chead__title" }, topic.name)),
      h(
        "section",
        { class: "ccard" },
        h("span", { class: "clabel" }, "Time limit"),
        segmented({ label: "Time limit", value: opt.time, options: [30, 60, 90, 120].map((v) => ({ value: v, label: `${v}s` })), onChange: (v) => (opt.time = v) }),
        h("span", { class: "clabel" }, "Time boost for each correct answer"),
        segmented({ label: "Time boost", value: opt.boost, options: [0, 2, 3, 5].map((v) => ({ value: v, label: v ? `+${v}s` : "Off" })), onChange: (v) => (opt.boost = v) }),
        tiltAvailable() ? h("div", { class: "rows" }, switchRow({ label: "Tilt the phone", hint: "Screen down for correct, up to pass. Tapping always works too.", checked: opt.tilt, onChange: (v) => (opt.tilt = v) })) : null
      ),
      h("p", { class: "muted chow" }, "Hold the phone sideways against your forehead, screen facing your friends. Tap the right side when you get it, the left side to pass."),
      h(
        "button",
        {
          class: "btn btn--primary btn--block cbig",
          type: "button",
          onclick: async () => {
            store.saveSettings(opt);
            const tilt = opt.tilt && tiltAvailable() ? await enableTilt() : false; // asks on iPhone (needs this tap)
            if (opt.tilt && tiltAvailable() && !tilt) toast("Tilt isn't allowed on this phone: tap the sides instead.");
            await goFullscreen();
            play(topic, { ...opt, tilt });
          },
        },
        "Play"
      )
    )
  );
}

// Full screen, sideways, and awake (where the browser allows it).
let wakeLock = null;
async function goFullscreen() {
  try {
    await document.documentElement.requestFullscreen?.();
    await screen.orientation?.lock?.("landscape");
  } catch {
    /* not everywhere: fine */
  }
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    /* fine */
  }
}
function exitFullscreen() {
  try {
    screen.orientation?.unlock?.();
    if (document.fullscreenElement) document.exitFullscreen();
  } catch {
    /* fine */
  }
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

// ---------------------------------------------------------------- playing
function play(topic, opt) {
  clean();
  const deck = shuffle(topic.words);
  const results = []; // { word, correct }
  let left = opt.time;
  let word = null;
  let busy = true; // during the countdown and feedback, nothing counts
  let ticker = null;

  const timeEl = h("span", { class: "ctimer num" });
  const wordEl = h("p", { class: "cword" });
  const flash = h("div", { class: "cflash", hidden: true });
  const stage = h(
    "main",
    { class: "cplay" },
    h("div", { class: "cplay__top" }, timeEl, h("button", { class: "cstop", type: "button", onclick: (e) => (e.stopPropagation(), finish("Stopped")) }, "End")),
    wordEl,
    h("div", { class: "cplay__zones", "aria-hidden": "true" }, h("span", null, "\u2190 Pass"), h("span", null, "Correct \u2192")),
    flash
  );
  replaceChildren(app, stage);
  const paintTime = () => (timeEl.textContent = `${Math.max(0, Math.ceil(left))}`);

  function nextWord() {
    word = deck.shift();
    if (!word) return finish("That's every word!");
    wordEl.textContent = word;
    busy = false;
  }

  function answer(correct) {
    if (busy || !word) return;
    busy = true;
    results.push({ word, correct });
    if (correct && opt.boost) left += opt.boost;
    paintTime();
    flash.className = `cflash ${correct ? "is-correct" : "is-pass"}`;
    flash.textContent = correct ? (opt.boost ? `Correct! +${opt.boost}s` : "Correct!") : "Pass";
    flash.hidden = false;
    navigator.vibrate?.(correct ? 60 : [30, 40, 30]);
    setTimeout(() => {
      flash.hidden = true;
      if (left > 0) nextWord();
    }, FEEDBACK_MS);
  }

  let done = false;
  function finish(title) {
    if (done) return; // time running out and the last word can land together
    done = true;
    clearInterval(ticker);
    busy = true;
    clean();
    flash.className = "cflash is-end";
    flash.textContent = title;
    flash.hidden = false;
    setTimeout(() => showResults(topic, opt, results), FEEDBACK_MS);
  }

  // Tap: right half correct, left half pass.
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".cstop")) return;
    answer(e.clientX > window.innerWidth / 2);
  });
  if (opt.tilt) cleanup.push(watchTilt((dir) => answer(dir === "down")));

  // 3, 2, 1, then go.
  let n = 3;
  wordEl.textContent = "Get ready\u2026";
  paintTime();
  const count = () => {
    if (n === 0) {
      nextWord();
      ticker = setInterval(() => {
        left -= 0.25;
        paintTime();
        if (left <= 0) finish("Time's up!");
      }, 250);
      return;
    }
    wordEl.textContent = String(n--);
    setTimeout(count, 1000);
  };
  setTimeout(count, 600);
  cleanup.push(() => clearInterval(ticker));
}

// ---------------------------------------------------------------- the end
function showResults(topic, opt, results) {
  exitFullscreen();
  const right = results.filter((r) => r.correct);
  const passed = results.filter((r) => !r.correct);
  replaceChildren(
    app,
    h(
      "main",
      { class: "cpage" },
      h("header", { class: "chead" }, h("button", { class: "icon-btn", type: "button", "aria-label": "Topics", onclick: home }, icon("back")), h("h1", { class: "chead__title" }, topic.name)),
      h("section", { class: "cscore" }, h("div", { class: "cscore__box is-correct" }, h("span", { class: "cscore__n num" }, right.length), h("span", null, "Correct")), h("div", { class: "cscore__box is-pass" }, h("span", { class: "cscore__n num" }, passed.length), h("span", null, "Passed"))),
      results.length
        ? h("ol", { class: "clist" }, results.map((r) => h("li", { class: r.correct ? "is-correct" : "is-pass" }, h("span", { class: "clist__mark", "aria-hidden": "true" }, r.correct ? "\u2713" : "\u2717"), h("span", null, r.word), h("span", { class: "visually-hidden" }, r.correct ? "correct" : "passed"))))
        : h("p", { class: "muted" }, "No words played."),
      h("div", { class: "cactions" }, h("button", { class: "btn btn--primary", type: "button", onclick: async () => (await goFullscreen(), play(topic, opt)) }, "Play again"), h("button", { class: "btn btn--quiet", type: "button", onclick: home }, "Change topic"))
    )
  );
}

home();
