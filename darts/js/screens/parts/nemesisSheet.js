// screens/parts/nemesisSheet.js
// Nemesis's personality, in one sheet used everywhere: the Nemesis screen and
// the Nemesis row in a local setup. Presets up top, the target average, then
// the four dials under Fine-tune. Moving a dial makes it Custom.

import { h, replaceChildren } from "../../ui/dom.js";
import { openSheet, stepper } from "../../ui/components.js";
import { PRESETS, cleanProfile, applyPreset, formTarget, TARGET_MIN, TARGET_MAX, RANGE_MAX } from "../../engine/nemesis/profile.js";

const DIALS = [
  { key: "range", label: "Range", min: 0, max: RANGE_MAX, show: (v) => `\u00b1${v}`, lo: "Exact", hi: "Anything goes", hint: "How far Nemesis' average can stray from the target in a leg." },
  { key: "consistency", label: "Consistency", min: 1, max: 10, show: String, lo: "Wild", hi: "Steady", hint: "How much Nemesis' scoring swings from visit to visit." },
  { key: "checkout", label: "Checkout strength", min: 1, max: 10, show: String, lo: "Shaky", hi: "Clinical", hint: "How well Nemesis hits the doubles." },
  { key: "composure", label: "Composure", min: 1, max: 10, show: String, lo: "Bottler", hi: "Ice cold", hint: "How Nemesis reacts when they're behind or in a deciding leg." },
];

// recentAverage: your recent 3-dart average, for "Match my form" (null if none yet).
export function openNemesisSheet({ profile, recentAverage = null, onSave }) {
  let p = cleanProfile(profile);
  const formValue = formTarget(recentAverage);

  const presetGrid = h("div", { class: "presets", role: "radiogroup", "aria-label": "Personality" });
  const dialsBox = h("div", { class: "dials" });
  const targetStepper = stepper({
    value: p.target,
    min: TARGET_MIN,
    max: TARGET_MAX,
    label: "target average",
    onChange: (v) => {
      p = cleanProfile({ ...p, target: v, matchForm: false });
      renderForm();
    },
  });
  const formBtn = h("button", { class: "chip form-chip", type: "button" });
  formBtn.addEventListener("click", () => {
    if (formValue === null) return;
    p = cleanProfile({ ...p, target: formValue, matchForm: true });
    targetStepper.setValue(p.target);
    renderForm();
  });

  function renderForm() {
    formBtn.hidden = formValue === null;
    formBtn.setAttribute("aria-pressed", String(p.matchForm));
    formBtn.textContent = p.matchForm ? `Matching your form (${formValue})` : `Match my form (${formValue})`;
  }

  function renderPresets() {
    replaceChildren(
      presetGrid,
      PRESETS.map((pr) =>
        h(
          "button",
          {
            type: "button",
            role: "radio",
            class: "preset",
            "aria-checked": String(p.preset === pr.id),
            onclick: () => {
              p = applyPreset(p, pr.id);
              renderPresets();
              renderDials();
            },
          },
          h("span", { class: "preset__name" }, pr.name),
          h("span", { class: "preset__blurb" }, pr.blurb)
        )
      ),
      p.preset === "custom" ? h("p", { class: "presets__custom" }, "Custom: your own mix of the dials below.") : null
    );
  }

  function renderDials() {
    replaceChildren(
      dialsBox,
      DIALS.map((d) => {
        const out = h("output", { class: "dial__value num" }, d.show(p[d.key]));
        const input = h("input", {
          class: "range",
          type: "range",
          min: d.min,
          max: d.max,
          step: 1,
          value: p[d.key],
          "aria-label": d.label,
          "aria-valuetext": `${d.label} ${d.show(p[d.key])}`,
        });
        const paint = () => input.style.setProperty("--fill", `${((Number(input.value) - d.min) / (d.max - d.min)) * 100}%`);
        paint();
        input.addEventListener("input", () => {
          p = cleanProfile({ ...p, [d.key]: Number(input.value) });
          out.textContent = d.show(p[d.key]);
          input.setAttribute("aria-valuetext", `${d.label} ${d.show(p[d.key])}`);
          paint();
          renderPresets();
        });
        return h(
          "div",
          { class: "dial" },
          h("div", { class: "dial__head" }, h("span", { class: "dial__label" }, d.label), out),
          input,
          h("div", { class: "dial__ends" }, h("span", null, d.lo), h("span", null, d.hi)),
          h("p", { class: "dial__hint" }, d.hint)
        );
      })
    );
  }

  renderForm();
  renderPresets();
  renderDials();

  const sheet = openSheet({
    title: "Nemesis' personality",
    className: "sheet--nemesis",
    body: [
      h("div", { class: "question" }, h("span", { class: "question__label" }, "Target average"), h("div", { class: "target-row" }, targetStepper, formBtn)),
      h("div", { class: "question" }, h("span", { class: "question__label" }, "Personality"), presetGrid),
      h("details", { class: "finetune" }, h("summary", null, "Fine-tune"), dialsBox),
    ],
    actions: [
      h(
        "button",
        {
          class: "btn btn--primary btn--block",
          type: "button",
          onclick: () => {
            onSave?.(p);
            sheet.close();
          },
        },
        "Save personality"
      ),
    ],
  });
  return sheet.closed;
}
