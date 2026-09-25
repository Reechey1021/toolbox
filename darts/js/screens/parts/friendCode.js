// screens/parts/friendCode.js
// Your friend code, big and readable, with Copy link and Share.

import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/components.js";
import { getOwner } from "../../services/profile.js";
import { inviteLink } from "../../services/friends.js";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or no permission: select it the old way.
    const area = h("textarea", { style: { position: "fixed", opacity: "0" } }, text);
    document.body.append(area);
    area.select();
    const ok = document.execCommand?.("copy");
    area.remove();
    return Boolean(ok);
  }
}

export function friendCodeCard() {
  const code = getOwner()?.friendCode;
  if (!code) return h("p", { class: "faint" }, "Your friend code appears here a moment after you sign in.");
  const link = inviteLink(code);
  return h(
    "div",
    { class: "fcode" },
    h("span", { class: "fcode__label" }, "Your friend code"),
    h("span", { class: "fcode__code num", "aria-label": `Friend code ${[...code].join(" ")}` }, code),
    h(
      "div",
      { class: "btn-row" },
      h(
        "button",
        {
          class: "btn btn--quiet fcode__btn",
          type: "button",
          onclick: async () => toast((await copyText(link)) ? "Link copied" : "Couldn't copy. Share your code instead.", { tone: "ok" }),
        },
        icon("list", { size: 18 }),
        h("span", { class: "btn__label" }, "Copy link")
      ),
      navigator.share
        ? h(
            "button",
            {
              class: "btn btn--primary fcode__btn",
              type: "button",
              onclick: () => navigator.share({ title: "Add me on Reech Darts", text: `Add me on Reech Darts. My code is ${code}.`, url: link }).catch(() => {}),
            },
            icon("upload", { size: 18 }),
            h("span", { class: "btn__label" }, "Share")
          )
        : null
    )
  );
}
