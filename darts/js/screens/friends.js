// screens/friends.js
// Your friends: requests waiting for you, your friends, requests you've sent,
// and adding someone by their code or link (#/add/CODE lands here with it filled in).

import { h, fmt, replaceChildren } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { topBar, openSheet, toast } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { accountState, onAccountChange, whenAccountReady } from "../services/account.js";
import { friendsState, onFriendsChange, lookup, sendRequest, accept, removeFriendship, friendProfile } from "../services/friends.js";
import { initials } from "../services/profile.js";
import { friendCodeCard } from "./parts/friendCode.js";

export function personAvatar(p, size = 44) {
  return p?.photoURL
    ? h("img", { class: "avatar", src: p.photoURL, alt: "", width: size, height: size, referrerpolicy: "no-referrer", style: { width: `${size}px`, height: `${size}px` } })
    : h("span", { class: "avatar avatar--initials", style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }, "aria-hidden": "true" }, initials(p?.name));
}

// ---------------------------------------------------------------------------
// Adding a friend
// ---------------------------------------------------------------------------

export function openAddFriend(prefill = "") {
  const input = h("input", {
    class: "field field--code num",
    type: "text",
    inputmode: "text",
    autocapitalize: "characters",
    autocomplete: "off",
    spellcheck: "false",
    maxlength: 60,
    placeholder: "Their code",
    value: prefill,
    "aria-label": "Their friend code",
  });
  const result = h("div", { class: "addf__result", "aria-live": "polite" });
  const find = h("button", { class: "btn btn--quiet", type: "button", onclick: () => search() }, "Find");
  input.addEventListener("keydown", (e) => e.key === "Enter" && search());

  async function search() {
    replaceChildren(result, h("p", { class: "faint" }, "Looking…"));
    try {
      const card = await lookup(input.value);
      if (!card) return replaceChildren(result, h("p", { class: "addf__msg" }, "Nobody has that code. Check it with them and try again."));
      const already = friendsState().friends.some((f) => f.uid === card.uid);
      replaceChildren(
        result,
        h(
          "div",
          { class: "person" },
          personAvatar(card, 48),
          h("span", { class: "person__text" }, h("span", { class: "person__name" }, card.name), h("span", { class: "person__sub" }, already ? "Already your friend" : `Code ${card.code}`)),
          already
            ? null
            : h(
                "button",
                {
                  class: "btn btn--primary person__btn",
                  type: "button",
                  onclick: async (e) => {
                    e.currentTarget.disabled = true;
                    try {
                      const r = await sendRequest(card);
                      toast(r === "accepted" ? `You and ${card.name} are now friends` : r === "already" ? `${card.name} is already your friend` : `Request sent to ${card.name}`, { tone: "ok" });
                      sheet.close();
                    } catch (err) {
                      toast(err.message || "Couldn't send that. Try again.", { tone: "bad" });
                      e.currentTarget.disabled = false;
                    }
                  },
                },
                "Add friend"
              )
        )
      );
    } catch (err) {
      replaceChildren(result, h("p", { class: "addf__msg" }, err.message));
    }
  }

  const sheet = openSheet({
    title: "Add a friend",
    className: "sheet--addf",
    body: [
      friendCodeCard(),
      h("div", { class: "question addf__theirs" }, h("span", { class: "question__label" }, "Or add theirs"), h("div", { class: "addf__row" }, input, find), result),
    ],
  });
  if (prefill) search();
  return sheet.closed;
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function friendsScreen(params = {}) {
  const body = h("div", { class: "friends__body" });

  function row(p, { sub, actions = [], href = null }) {
    return h(
      href ? "a" : "div",
      { class: ["person", href && "person--link"], href },
      personAvatar(p, 44),
      h("span", { class: "person__text" }, h("span", { class: "person__name" }, p.name), sub ? h("span", { class: "person__sub" }, sub) : null),
      ...actions
    );
  }

  const small = (label, tone, onclick) => h("button", { class: ["btn", `btn--${tone}`, "person__btn"], type: "button", onclick }, label);

  function render() {
    const s = friendsState();
    if (accountState().status === "loading") {
      replaceChildren(body, h("p", { class: "faint section--first" }, "Checking your account…"));
      return;
    }
    if (!accountState().user) {
      replaceChildren(
        body,
        h(
          "div",
          { class: "empty section--first" },
          h("h2", null, "Sign in to add friends"),
          h("p", null, "Friends can see each other's stats, compare, and play online together."),
          h("a", { class: "btn btn--primary", href: "#/profile" }, "Sign in with Google")
        )
      );
      return;
    }

    const sections = [];
    if (s.incoming.length) {
      sections.push(
        h(
          "section",
          { class: "section section--first" },
          h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Waiting for you")),
          h(
            "div",
            { class: "people" },
            s.incoming.map((p) =>
              row(p, {
                sub: "Wants to be friends",
                actions: [
                  small("Accept", "primary", async () => {
                    await accept(p.id);
                    toast(`You and ${p.name} are now friends`, { tone: "ok" });
                  }),
                  small("Decline", "quiet", () => removeFriendship(p.id)),
                ],
              })
            )
          )
        )
      );
    }

    sections.push(
      h(
        "section",
        { class: ["section", !s.incoming.length && "section--first"] },
        h("button", { class: "btn btn--primary btn--block addf__open", type: "button", onclick: () => openAddFriend() }, icon("plus", { size: 20 }), h("span", { class: "btn__label" }, "Add a friend"))
      )
    );

    const list = s.friends.length
      ? h(
          "div",
          { class: "people" },
          s.friends.map((p) => {
            const el = row(p, { sub: "Friends", href: `#/friends/${encodeURIComponent(p.uid)}`, actions: [h("span", { class: "row__chev" }, icon("chevron", { size: 18 }))] });
            // Fill in their average once their profile arrives.
            friendProfile(p.uid).then((prof) => {
              const sub = el.querySelector(".person__sub");
              if (sub && prof?.stats?.matches) sub.textContent = `${fmt.avg(prof.stats.avg, 1)} average, ${prof.stats.matches} ${prof.stats.matches === 1 ? "match" : "matches"}`;
            });
            return el;
          })
        )
      : h("div", { class: "empty" }, h("h2", null, s.loaded ? "No friends yet" : "Loading friends…"), s.loaded ? h("p", null, "Share your code or link, or add theirs.") : null);

    sections.push(h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Your friends"), s.friends.length ? h("span", { class: "section__note" }, String(s.friends.length)) : null), list));

    if (s.outgoing.length) {
      sections.push(
        h(
          "section",
          { class: "section" },
          h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Sent")),
          h("div", { class: "people" }, s.outgoing.map((p) => row(p, { sub: "Waiting for them to accept", actions: [small("Cancel", "quiet", () => removeFriendship(p.id))] })))
        )
      );
    }
    replaceChildren(body, sections);
  }

  const off = onFriendsChange(render);
  const offAccount = onAccountChange(render);
  render();

  const el = h("main", { class: "page friends" }, topBar({ title: "Friends", back: "#/" }), body);
  return {
    el,
    title: "Friends",
    async afterMount() {
      if (!params.code) return;
      const s = await whenAccountReady();
      if (s.user) openAddFriend(params.code).then(() => navigate("/friends", { replace: true }));
      else toast("Sign in first, then open the link again", { tone: "bad" });
    },
    destroy() {
      off();
      offAccount();
    },
  };
}

