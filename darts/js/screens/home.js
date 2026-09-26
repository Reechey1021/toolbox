// screens/home.js

import { h, fmt } from "../ui/dom.js";
import { icon, brandMark } from "../ui/icons.js";
import { linkRow, confirm, toast } from "../ui/components.js";
import { getOwner, greeting } from "../services/profile.js";
import { accountState } from "../services/account.js";
import { friendsState, onFriendsChange } from "../services/friends.js";
import { avatar } from "./profile.js";

// "Target Power 9Five, 23g"
const dartsLine = (eq) => (eq && (eq.brand || eq.model) ? [eq.brand, eq.model].filter(Boolean).join(" ") + (eq.weight ? `, ${eq.weight}g` : "") : null);
import { getActive, activeState, discardActive } from "../services/session.js";
import { matches } from "../services/storage.js";
import { lifetimeStats } from "../engine/stats.js";
import { rivalry } from "../engine/nemesis/rivalry.js";
import { currentLeg, describeFormat, needsBull, sideName } from "../engine/match.js";

export async function homeScreen() {
  const owner = getOwner();
  const records = await matches.list();
  const life = lifetimeStats(records, owner.id);
  const rival = rivalry(records, owner.id);
  const rivalLine = rival.matches
    ? rival.youWon === rival.itWon
      ? `All square at ${rival.youWon}–${rival.itWon}.`
      : rival.youWon > rival.itWon
        ? `You lead ${rival.youWon}–${rival.itWon}.`
        : `Nemesis leads ${rival.itWon}–${rival.youWon}.`
    : "A bot that throws to the average you set.";

  // Friends, with a live count of requests waiting.
  const friendsRow = linkRow({ label: "Friends", hint: "Add friends with a code or link", iconName: "users", href: "#/friends" });
  const paintFriends = () => {
    const f = friendsState();
    const hint = friendsRow.querySelector(".row__hint");
    const chev = friendsRow.querySelector(".row__chev");
    if (!hint || !chev) return;
    friendsRow.querySelector(".tag")?.remove();
    if (!f.signedIn) hint.textContent = "Sign in to add friends";
    else hint.textContent = f.friends.length ? `${f.friends.length} ${f.friends.length === 1 ? "friend" : "friends"}` : "Add friends with a code or link";
    if (f.incoming.length) chev.before(h("span", { class: "tag tag--alert" }, `${f.incoming.length} ${f.incoming.length === 1 ? "request" : "requests"}`));
  };
  paintFriends();
  const offFriends = onFriendsChange(paintFriends);

  const el = h(
    "main",
    { class: "page home" },
    h(
      "header",
      { class: "home__bar" },
      h(
        "div",
        { class: "home__brandrow" },
        h("a", { class: "icon-btn home__toolbox", href: "../", "aria-label": "Reech's Toolbox" }, icon("back")),
        h("a", { class: "brand", href: "#/", "aria-label": "Reech Darts home" }, brandMark(26), h("span", { class: "wordmark" }, "Reech Darts"))
      ),
      h(
        "div",
        { class: "home__actions" },
        h("a", { class: "icon-btn", href: "#/settings", "aria-label": "Settings" }, icon("sliders")),
        h("a", { class: "home__me", href: "#/profile", "aria-label": "Your profile" }, avatar(owner, 36))
      )
    ),
    h("h1", { class: "home__hello" }, `${greeting()}, ${owner.name}.`),
    h(
      "a",
      { class: "home__card", href: "#/profile" },
      avatar(owner, 52),
      h(
        "span",
        { class: "home__cardtext" },
        h("span", { class: "home__cardname" }, owner.name),
        h("span", { class: "home__carddarts" }, dartsLine(owner.equipment) ?? "Add your darts on your profile")
      ),
      h("span", { class: "mode__go" }, icon("chevron"))
    ),
    resumeCard(),
    h(
      "section",
      { class: "modes", "aria-label": "Play" },
      h(
        "a",
        { class: "mode mode--local", href: "#/setup" },
        h("span", { class: "mode__icon" }, icon("users", { size: 26 })),
        h("span", { class: "mode__text" }, h("span", { class: "mode__title" }, "Play local"), h("span", { class: "mode__sub" }, "One device, up to four players. Works offline.")),
        h("span", { class: "mode__go" }, icon("chevron"))
      ),
      accountState().user
        ? h(
            "a",
            { class: "mode mode--nemesis", href: "#/online" },
            h("span", { class: "mode__icon" }, icon("globe", { size: 26 })),
            h("span", { class: "mode__text" }, h("span", { class: "mode__title" }, "Play online"), h("span", { class: "mode__sub" }, "Host a lobby or join a friend's game.")),
            h("span", { class: "mode__go" }, icon("chevron"))
          )
        : h(
            "a",
            { class: "mode mode--soon", href: "#/profile" },
            h("span", { class: "mode__icon" }, icon("globe", { size: 26 })),
            h("span", { class: "mode__text" }, h("span", { class: "mode__title" }, "Play online"), h("span", { class: "mode__sub" }, "Friends, invites and your profile, with Google sign-in.")),
            h("span", { class: "tag" }, icon("lock", { size: 13 }), " Sign in")
          ),
      h(
        "a",
        { class: "mode mode--nemesis", href: "#/nemesis" },
        h("span", { class: "mode__icon" }, icon("bot", { size: 26 })),
        h("span", { class: "mode__text" }, h("span", { class: "mode__title" }, "Nemesis"), h("span", { class: "mode__sub" }, rivalLine)),
        h("span", { class: "mode__go" }, icon("chevron"))
      ),
      h(
        "a",
        { class: "mode mode--nemesis", href: "#/arcade" },
        h("span", { class: "mode__icon" }, icon("target", { size: 26 })),
        h("span", { class: "mode__text" }, h("span", { class: "mode__title" }, "Arcade"), h("span", { class: "mode__sub" }, "Quick-fire darts games for one or more players.")),
        h("span", { class: "mode__go" }, icon("chevron"))
      )
    ),
    numbers(life),
    h(
      "nav",
      { class: "section rows", "aria-label": "More" },
      friendsRow,
      linkRow({ label: "Stats", hint: "Averages, checkouts and trends", iconName: "chart", href: "#/stats" }),
      linkRow({ label: "History", hint: life.matches ? `${life.matches} finished ${life.matches === 1 ? "match" : "matches"}` : "Every match you finish", iconName: "clock", href: "#/history" }),
      linkRow({ label: "Settings", hint: "Caller, scoring and your data", iconName: "sliders", href: "#/settings" })
    )
  );

  return { el, title: null, destroy: offFriends };
}

function resumeCard() {
  const active = getActive();
  if (!active) return null;
  const state = activeState();
  if (state.finished) return null;
  const cfg = state.cfg;
  const leg = currentLeg(state);
  const started = active.events.length > 0;
  const bullFirst = needsBull(cfg);

  const scores = h(
    "div",
    { class: "resume__scores" },
    state.sides.map((_, i) =>
      h(
        "span",
        { class: ["resume__player", !bullFirst && i === leg.current && "is-up"] },
        h("span", { class: "resume__name" }, sideName(cfg, i)),
        h("span", { class: "resume__score num" }, leg.remaining[i])
      )
    )
  );

  const card = h(
    "section",
    { class: "resume", "aria-label": "Match in progress" },
    h(
      "div",
      { class: "resume__head" },
      h("span", { class: "resume__title" }, bullFirst ? "Throw for the bull to start" : started ? `Leg ${leg.index + 1} in progress` : "Ready to start"),
      h("span", { class: "resume__meta" }, `${cfg.startScore}, ${describeFormat(cfg).toLowerCase()}`)
    ),
    scores,
    h(
      "div",
      { class: "btn-row" },
      h("a", { class: "btn btn--primary", href: "#/game" }, "Carry on"),
      h(
        "button",
        {
          class: "btn btn--quiet",
          type: "button",
          onclick: async () => {
            const ok = await confirm({
              title: "End this match?",
              lead: "It won't be saved to your history.",
              confirmLabel: "End match",
              tone: "danger",
            });
            if (!ok) return;
            discardActive();
            card.remove();
            toast("Match ended");
          },
        },
        "End match"
      )
    )
  );
  return card;
}

function numbers(life) {
  if (!life.matches) {
    return h(
      "section",
      { class: "section numbers numbers--empty" },
      h("p", { class: "muted" }, "Your averages and records build up here once you finish a match.")
    );
  }
  const cells = [
    ["Average", fmt.avg(life.avg)],
    ["First 9", fmt.avg(life.first9)],
    ["Checkout", fmt.pct(life.checkoutPct)],
    ["180s", fmt.int(life.s180)],
  ];
  return h(
    "a",
    { class: "section numbers", href: "#/stats", "aria-label": "Your stats" },
    cells.map(([label, value]) => h("span", { class: "numbers__cell" }, h("span", { class: "numbers__value num" }, value), h("span", { class: "numbers__label" }, label)))
  );
}

