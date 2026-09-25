// screens/friend.js
// A friend's profile: their numbers, their darts, and you side by side.

import { h, fmt, replaceChildren } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { topBar, segmented, confirm, toast } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { getOwner } from "../services/profile.js";
import { matches } from "../services/storage.js";
import { friendById, friendProfile, removeFriendship, onFriendsChange } from "../services/friends.js";
import { lifetimeStats } from "../engine/stats.js";
import { statsSummary } from "../engine/records.js";
import { personAvatar } from "./friends.js";
import { inviteFriend } from "../services/online.js";

// label, read(summary), show(value), which way is better
const ROWS = [
  ["3-dart average", (s) => s.avg, (v) => fmt.avg(v), "high"],
  ["First 9", (s) => s.first9, (v) => fmt.avg(v), "high"],
  ["Checkout", (s) => s.checkoutPct, (v) => fmt.pct(v), "high"],
  ["Highest checkout", (s) => s.highestCheckout, (v) => fmt.int(v), "high"],
  ["Best leg", (s) => s.bestLeg, (v) => (v == null ? "–" : `${v} darts`), "low"],
  ["Best match", (s) => s.bestMatchAvg, (v) => fmt.avg(v), "high"],
  ["180s", (s) => s.s180, (v) => fmt.int(v), "high"],
  ["140+", (s) => s.s140, (v) => fmt.int(v), "high"],
  ["100+", (s) => s.s100, (v) => fmt.int(v), "high"],
  ["Legs won", (s) => s.legsWon, (v) => fmt.int(v), "high"],
  ["Matches", (s) => s.matches, (v) => fmt.int(v), null],
];

function statGrid(s) {
  const cell = (label, value) => h("div", { class: "statcell" }, h("dt", null, label), h("dd", { class: "num" }, value));
  return h("dl", { class: "statgrid" }, ROWS.slice(0, 8).map(([label, read, show]) => cell(label, show(read(s)))));
}

function compareTable(me, them, theirName) {
  return h(
    "div",
    { class: "cmp-wrap" },
    h(
      "table",
      { class: "cmp" },
      h("thead", null, h("tr", null, h("th", null, h("span", { class: "visually-hidden" }, "Stat")), h("th", { scope: "col" }, "You"), h("th", { scope: "col" }, theirName))),
      h(
        "tbody",
        null,
        ROWS.map(([label, read, show, better]) => {
          const a = read(me);
          const b = read(them);
          const both = a != null && b != null && a !== b;
          const aBest = both && better && (better === "high" ? a > b : a < b);
          const bBest = both && better && !aBest;
          return h("tr", null, h("th", { scope: "row" }, label), h("td", { class: ["num", aBest && "is-best"] }, show(a)), h("td", { class: ["num", bBest && "is-best"] }, show(b)));
        })
      )
    )
  );
}

export async function friendScreen({ uid }) {
  const owner = getOwner();
  const mine = statsSummary(lifetimeStats(await matches.list(), owner.id));
  const body = h("div", { class: "friend__body" });
  let view = "theirs";

  async function render() {
    const card = friendById(uid);
    if (!card) {
      replaceChildren(body, h("div", { class: "empty section--first" }, h("h2", null, "Not in your friends"), h("p", null, "They may have removed you, or you them."), h("a", { class: "btn btn--primary", href: "#/friends" }, "Back to friends")));
      return;
    }
    const prof = await friendProfile(uid);
    const stats = prof?.stats ?? null;
    const name = prof?.name || card.name;
    const eq = prof?.equipment;
    const darts = eq && (eq.brand || eq.model) ? [eq.brand, eq.model].filter(Boolean).join(" ") + (eq.weight ? `, ${eq.weight}g` : "") : null;

    const numbers = !stats
      ? h("p", { class: "muted" }, `${name}'s numbers show up here once they've played a match signed in.`)
      : view === "theirs"
        ? statGrid(stats)
        : compareTable(mine, stats, name);

    replaceChildren(
      body,
      h(
        "section",
        { class: "me" },
        personAvatar({ ...card, photoURL: prof?.photoURL || card.photoURL }, 76),
        h("div", { class: "me__text" }, h("h2", { class: "me__name" }, name), h("p", { class: "me__sub" }, card.since ? `Friends since ${fmt.date(card.since)}` : "Friends"))
      ),
      darts ? h("p", { class: "friend__darts" }, icon("target", { size: 18 }), h("span", null, `Throws ${darts}`)) : null,
      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Numbers")),
        stats
          ? segmented({
              label: "Show",
              value: view,
              options: [
                { value: "theirs", label: `${name.split(" ")[0]}'s stats` },
                { value: "compare", label: "Compare with you" },
              ],
              onChange: (v) => {
                view = v;
                render();
              },
              className: "friend__toggle",
            })
          : null,
        numbers
      ),
      h(
        "section",
        { class: "section friend__actions" },
        h(
          "button",
          {
            class: "btn btn--primary btn--block",
            type: "button",
            onclick: async (e) => {
              e.currentTarget.disabled = true;
              try {
                const c = await inviteFriend(uid);
                toast(`Invite sent to ${name}`, { tone: "ok" });
                navigate(`/lobby/${c}`);
              } catch (err) {
                toast(err.message, { tone: "bad" });
                e.currentTarget.disabled = false;
              }
            },
          },
          h("span", { class: "btn__label" }, "Invite to game"),
          h("span", { class: "btn__sub" }, "Opens a lobby for you both")
        ),
        h(
          "button",
          {
            class: "btn btn--danger btn--block",
            type: "button",
            onclick: async () => {
              const ok = await confirm({ title: `Remove ${name}?`, lead: "You'll stop seeing each other's stats. You can add each other again any time.", confirmLabel: "Remove friend", tone: "danger" });
              if (!ok) return;
              await removeFriendship(card.id);
              toast(`${name} removed`);
              navigate("/friends", { replace: true });
            },
          },
          "Remove friend"
        )
      )
    );
  }

  const off = onFriendsChange(() => render());
  await render();
  const el = h("main", { class: "page friend" }, topBar({ title: "Friend", back: "#/friends" }), body);
  return { el, title: "Friend", destroy: off };
}
