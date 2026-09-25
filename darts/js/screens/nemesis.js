// screens/nemesis.js
// Nemesis's home: your rivalry with it, its personality, and one button to play.

import { h, fmt } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { topBar, segmented, switchRow, confirm } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { getOwner, ownerAsPlayer } from "../services/profile.js";
import { getSettings, setSetting } from "../services/settings.js";
import { getActive, activeState, startMatch } from "../services/session.js";
import { matches } from "../services/storage.js";
import { createMatch, needsBull } from "../engine/match.js";
import { recentAverage } from "../engine/stats.js";
import { rivalry } from "../engine/nemesis/rivalry.js";
import { makeNemesisPlayer } from "../engine/nemesis/index.js";
import { cleanProfile, defaultProfile, presetName, PRESETS, formTarget } from "../engine/nemesis/profile.js";
import { openNemesisSheet } from "./parts/nemesisSheet.js";
import { matchOptions } from "./parts/matchOptions.js";

function defaults() {
  const last = getSettings().lastNemesis;
  return {
    profile: cleanProfile(last?.profile ?? defaultProfile()),
    startScore: last?.startScore ?? 501,
    customScore: last?.customScore ?? 1001,
    formatType: last?.formatType ?? "firstTo",
    legs: last?.legs ?? 3,
    checkIn: last?.checkIn ?? "straight",
    checkOut: last?.checkOut ?? "double",
    first: last?.first ?? "random",
  };
}

export async function nemesisScreen() {
  const owner = getOwner();
  const records = await matches.list();
  const r = rivalry(records, owner.id);
  const recent = recentAverage(records, owner.id);
  const s = defaults();

  // "Match my form" follows your latest average every time you open this screen.
  if (s.profile.matchForm && formTarget(recent) !== null) s.profile = cleanProfile({ ...s.profile, target: formTarget(recent) });

  // ---------------------------------------------------------------- head to head
  // Your last five results, oldest on the left, like a football form guide.
  const squares = Array.from({ length: 5 }, (_, k) => r.form[k - (5 - r.form.length)] ?? null);
  const formWords = { win: "W", loss: "L", other: "–" };
  const form = h(
    "div",
    { class: "form", role: "img", "aria-label": r.form.length ? `Last ${r.form.length}: ${r.form.map((x) => (x === "win" ? "won" : x === "loss" ? "lost" : "no result")).join(", ")}` : "No results yet" },
    h("span", { class: "form__label" }, "Last 5"),
    h(
      "span",
      { class: "form__squares" },
      squares.map((x) => h("span", { class: ["form__sq", x && `form__sq--${x}`] }, x ? formWords[x] : ""))
    )
  );

  const hero = h(
    "section",
    { class: "section section--first" },
    h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Head to head")),
    h(
      "div",
      { class: "rival" },
      h(
        "div",
        { class: "rival__score" },
        h("span", { class: "rival__side" }, h("span", { class: "rival__num num" }, r.youWon), h("span", { class: "rival__who" }, "You")),
        h("span", { class: "rival__dash", "aria-hidden": "true" }, "–"),
        h("span", { class: "rival__side rival__side--it" }, h("span", { class: "rival__num num" }, r.itWon), h("span", { class: "rival__who" }, "Nemesis"))
      ),
      form
    ),
    r.matches
      ? h(
          "dl",
          { class: "rival__facts" },
          fact("Your Avg.", fmt.avg(r.yourAvg)),
          fact("Opp. Avg.", fmt.avg(r.itsAvg)),
          fact("Legs", `${r.legsYou}–${r.legsIt}`),
          fact("Best win", r.bestWin ? fmt.avg(r.bestWin.avg) : "–")
        )
      : null,
    r.matches ? h("a", { class: "btn btn--quiet btn--block rival__history", href: "#/nemesis/history" }, icon("clock", { size: 18 }), h("span", { class: "btn__label" }, "View match history")) : null
  );

  // ---------------------------------------------------------------- personality
  const personality = h("button", { class: "persona", type: "button", onclick: editPersonality });
  function renderPersona() {
    const pr = PRESETS.find((x) => x.id === s.profile.preset);
    personality.replaceChildren(
      h("span", { class: "persona__icon" }, icon("bot", { size: 28 })),
      h(
        "span",
        { class: "persona__text" },
        h("span", { class: "persona__title" }, `${s.profile.target} average, ${presetName(s.profile)}`),
        h("span", { class: "persona__sub" }, s.profile.matchForm ? "Matching your recent form, plus a little." : pr ? pr.blurb : `Range \u00b1${s.profile.range}, consistency ${s.profile.consistency}, checkout ${s.profile.checkout}, composure ${s.profile.composure}.`)
      ),
      h("span", { class: "persona__edit" }, "Change")
    );
  }
  async function editPersonality() {
    await openNemesisSheet({
      profile: s.profile,
      recentAverage: recent,
      onSave: (p) => {
        s.profile = p;
        renderPersona();
      },
    });
  }
  renderPersona();

  // ---------------------------------------------------------------- match options
  const options = matchOptions(s, { sideCount: () => 2 });
  const first = segmented({
    label: "Throws first",
    value: s.first,
    options: [
      { value: 0, label: "You" },
      { value: 1, label: "Nemesis" },
      { value: "random", label: "Random" },
      { value: "bull", label: "Throw for bull" },
    ],
    className: "seg--wrap",
    onChange: (v) => (s.first = v),
  });

  async function play() {
    const existing = getActive();
    if (existing && existing.events.length && !activeState().finished) {
      const ok = await confirm({ title: "Replace the match in progress?", lead: "The unfinished match won't be saved.", confirmLabel: "Start new match", tone: "danger" });
      if (!ok) return;
    }
    setSetting("lastNemesis", {
      profile: s.profile,
      startScore: s.startScore,
      customScore: s.customScore,
      formatType: s.formatType,
      legs: s.legs,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      first: s.first,
    });
    const cfg = createMatch({
      players: [ownerAsPlayer(), makeNemesisPlayer(s.profile)],
      startScore: s.startScore,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      format: { type: s.formatType, legs: s.legs },
      firstPlayer: s.first,
      trackDoubles: getSettings().trackDoubles,
    });
    startMatch(cfg);
    navigate(needsBull(cfg) ? "/bull" : "/game");
  }

  const el = h(
    "div",
    { class: "setup nemesis" },
    h(
      "main",
      { class: "page" },
      topBar({ title: "Nemesis", back: "#/" }),
      hero,
      h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Personality")), personality),
      options.game,
      options.legs,
      options.rules,
      h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Throws first")), first),
      h(
        "section",
        { class: "section rows" },
        switchRow({
          label: "Show Nemesis' thoughts",
          hint: "A short line from Nemesis now and then, when something happens.",
          checked: getSettings().nemesisThoughts,
          onChange: (v) => setSetting("nemesisThoughts", v),
        })
      )
    ),
    h("div", { class: "setup__go" }, h("div", { class: "setup__go-inner" }, h("button", { class: "btn btn--primary btn--block", type: "button", onclick: play }, "Play Nemesis")))
  );

  return { el, title: "Nemesis" };
}

function fact(label, value) {
  return h("div", { class: "rival__fact" }, h("dt", null, label), h("dd", { class: "num" }, value));
}
