// screens/welcome.js
// First run: ask for a name. That's the whole onboarding.

import { h } from "../ui/dom.js";
import { brandMark } from "../ui/icons.js";
import { saveOwner, getOwner } from "../services/profile.js";
import { navigate } from "../ui/router.js";

export function welcomeScreen() {
  const input = h("input", {
    class: "field field--big",
    type: "text",
    name: "name",
    autocomplete: "nickname",
    autocapitalize: "words",
    maxlength: 16,
    placeholder: "Your name",
    value: getOwner()?.name ?? "",
    "aria-label": "Your name",
  });
  const go = h("button", { class: "btn btn--primary btn--block", type: "submit", disabled: !input.value.trim() }, "Let's play");
  input.addEventListener("input", () => (go.disabled = !input.value.trim()));

  const form = h(
    "form",
    {
      class: "welcome__form",
      onsubmit: (e) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        saveOwner({ name: input.value });
        navigate("/", { replace: true });
      },
    },
    h("label", { class: "welcome__label", for: "welcome-name" }, "What should we call you?"),
    Object.assign(input, { id: "welcome-name" }),
    go
  );

  const el = h(
    "main",
    { class: "page welcome" },
    h("div", { class: "welcome__brand" }, brandMark(40), h("span", { class: "wordmark" }, "Reech Darts")),
    h("div", { class: "welcome__body" }, h("h1", { class: "welcome__title" }, "Scores, checkouts and stats for every leg you throw."), form),
    h("p", { class: "welcome__note faint" }, "Everything stays on this device. Sign in later to take it with you.")
  );

  return { el, title: "Welcome", afterMount: () => input.focus() };
}
