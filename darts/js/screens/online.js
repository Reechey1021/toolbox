// screens/online.js
// Play online: the hub (rejoin, invites, host, join), the lobby, and join links.

import { h, replaceChildren } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { topBar, segmented, stepper, switchRow, openSheet, toast } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { accountState, whenAccountReady } from "../services/account.js";
import { friendsState } from "../services/friends.js";
import {
  onlineState, onOnlineChange, hostLobby, joinLobby, openLobby, leaveLobby, setReady, updateSettings, setSeatCount,
  canStart, startOnline, inviteFriend, dismissInvite, myOpenLobbies, isAway, MIN_SEATS, MAX_SEATS,
} from "../services/online.js";
import { describeFormat, describeRules } from "../engine/match.js";
import { personAvatar } from "./friends.js";
import { matchOptions } from "./parts/matchOptions.js";
import { createChat } from "./parts/chat.js";
import { arcadeOptions, describeArcade } from "./parts/arcadeOptions.js";
import { openHowToPlay } from "./parts/rules.js";

export const joinLink = (code) => `${location.origin}${location.pathname}#/join/${code}`;

function signInPrompt() {
  return h(
    "div",
    { class: "empty section--first" },
    h("h2", null, "Sign in to play online"),
    h("p", null, "Play friends on their own phones, wherever they are."),
    h("a", { class: "btn btn--primary", href: "#/profile" }, "Sign in with Google")
  );
}

// ---------------------------------------------------------------------------
// The hub
// ---------------------------------------------------------------------------

export async function onlineScreen() {
  const body = h("div");
  const codeInput = h("input", { class: "field field--code num", type: "text", autocapitalize: "characters", autocomplete: "off", spellcheck: "false", maxlength: 60, placeholder: "Game code", "aria-label": "Game code" });
  const join = async () => {
    try {
      const c = await joinLobby(codeInput.value);
      navigate(`/lobby/${c}`);
    } catch (err) {
      toast(err.message, { tone: "bad" });
    }
  };
  codeInput.addEventListener("keydown", (e) => e.key === "Enter" && join());

  async function render() {
    const acc = await whenAccountReady();
    if (!acc.user) return replaceChildren(body, signInPrompt());
    const s = onlineState();
    let mine = [];
    try {
      mine = await myOpenLobbies();
    } catch {
      /* offline: nothing to rejoin */
    }
    replaceChildren(
      body,
      mine.length
        ? h(
            "section",
            { class: "section section--first" },
            h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Carry on")),
            h(
              "div",
              { class: "people" },
              mine.map((l) =>
                h(
                  "a",
                  { class: "person person--link", href: `#/lobby/${l.code}` },
                  h("span", { class: "row__icon" }, icon("globe")),
                  h("span", { class: "person__text" }, h("span", { class: "person__name" }, l.status === "playing" ? "Match in progress" : "In the lobby"), h("span", { class: "person__sub" }, `Game ${l.code}, ${l.members.length} of ${l.seatCount} players`)),
                  h("span", { class: "tag tag--alert" }, "Rejoin")
                )
              )
            )
          )
        : null,
      s.invites.length
        ? h(
            "section",
            { class: ["section", !mine.length && "section--first"] },
            h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Invites")),
            h(
              "div",
              { class: "people" },
              s.invites.map((inv) =>
                h(
                  "div",
                  { class: "person" },
                  personAvatar({ name: inv.fromName, photoURL: inv.fromPhoto }, 44),
                  h("span", { class: "person__text" }, h("span", { class: "person__name" }, inv.fromName), h("span", { class: "person__sub" }, "Invited you to play")),
                  h("button", { class: "btn btn--primary person__btn", type: "button", onclick: () => acceptInvite(inv) }, "Join"),
                  h("button", { class: "btn btn--quiet person__btn", type: "button", onclick: () => dismissInvite(inv.id) }, "Not now")
                )
              )
            )
          )
        : null,
      h(
        "section",
        { class: ["section", !mine.length && !s.invites.length && "section--first"] },
        h(
          "button",
          {
            class: "btn btn--primary btn--block online__host",
            type: "button",
            onclick: async (e) => {
              e.currentTarget.disabled = true;
              try {
                navigate(`/lobby/${await hostLobby()}`);
              } catch (err) {
                toast(err.message, { tone: "bad" });
                e.currentTarget.disabled = false;
              }
            },
          },
          h("span", { class: "btn__label" }, "Host a lobby"),
          h("span", { class: "btn__sub" }, "Set up the match, then share the code")
        )
      ),
      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Join a game")),
        h("div", { class: "addf__row" }, codeInput, h("button", { class: "btn btn--quiet", type: "button", onclick: join }, "Join"))
      )
    );
  }

  const off = onOnlineChange((_, reason) => reason === "invites" && render());
  await render();
  return { el: h("main", { class: "page online" }, topBar({ title: "Play online", back: "#/" }), body), title: "Play online", destroy: off };
}

export async function acceptInvite(inv) {
  try {
    const c = await joinLobby(inv.code);
    await dismissInvite(inv.id);
    navigate(`/lobby/${c}`);
  } catch (err) {
    toast(err.message, { tone: "bad" });
    dismissInvite(inv.id);
  }
}

// ---------------------------------------------------------------------------
// Join links: #/join/CODE
// ---------------------------------------------------------------------------

export function joinScreen({ code }) {
  const body = h("p", { class: "faint section--first" }, "Joining…");
  return {
    el: h("main", { class: "page" }, topBar({ title: "Join a game", back: "#/online" }), body),
    title: "Join a game",
    async afterMount() {
      const acc = await whenAccountReady();
      if (!acc.user) return replaceChildren(body, signInPrompt());
      try {
        const c = await joinLobby(code);
        navigate(`/lobby/${c}`, { replace: true });
      } catch (err) {
        replaceChildren(body, h("div", { class: "empty" }, h("h2", null, "Couldn't join"), h("p", null, err.message), h("a", { class: "btn btn--primary", href: "#/online" }, "Back to Play online")));
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The lobby
// ---------------------------------------------------------------------------

function openInviteSheet() {
  const friends = friendsState().friends;
  const seated = new Set(onlineState().seats.filter(Boolean).map((x) => x.uid));
  openSheet({
    title: "Invite friends",
    lead: "They'll see it in the app, and can join from there.",
    body: friends.length
      ? h(
          "div",
          { class: "people" },
          friends.map((f) =>
            h(
              "div",
              { class: "person" },
              personAvatar(f, 44),
              h("span", { class: "person__text" }, h("span", { class: "person__name" }, f.name)),
              seated.has(f.uid)
                ? h("span", { class: "tag" }, "In the lobby")
                : h(
                    "button",
                    {
                      class: "btn btn--primary person__btn",
                      type: "button",
                      onclick: async (e) => {
                        const b = e.currentTarget;
                        b.disabled = true;
                        try {
                          await inviteFriend(f.uid);
                          b.textContent = "Invited";
                        } catch (err) {
                          toast(err.message, { tone: "bad" });
                          b.disabled = false;
                        }
                      },
                    },
                    "Invite"
                  )
            )
          )
        )
      : h("p", { class: "muted" }, "No friends yet. Share the game code instead, or add friends in Friends."),
  });
}

function seatRow(seat, i, s) {
  if (!seat) {
    return h("div", { class: "person seat seat--open" }, h("span", { class: "seat__num num" }, i + 1), h("span", { class: "person__text" }, h("span", { class: "person__name" }, "Open seat"), h("span", { class: "person__sub" }, "Share the code or invite a friend")));
  }
  const mine = seat.uid === s.uid;
  const host = seat.uid === s.lobby.host;
  const away = isAway(seat);
  return h(
    "div",
    { class: ["person", "seat", mine && "is-mine"] },
    personAvatar(seat, 44),
    h(
      "span",
      { class: "person__text" },
      h("span", { class: "person__name" }, seat.name, mine ? h("span", { class: "tag" }, "You") : null, host ? h("span", { class: "tag" }, "Host") : null),
      h("span", { class: "person__sub" }, away ? "Away" : host ? "Hosting" : seat.ready ? "Ready" : "Not ready yet")
    ),
    host ? null : h("span", { class: ["seat__ready", seat.ready && "is-ready"], "aria-hidden": "true" }, seat.ready ? icon("check", { size: 18 }) : null)
  );
}

function settingsSummary(st) {
  if (st.mode && st.mode !== "x01") {
    const d = describeArcade({ mode: st.mode, options: st.arcade ?? {}, formatType: st.formatType, legs: st.legs, tie: st.tie ?? "sudden" });
    return h(
      "div",
      { class: "rows" },
      h("div", { class: "row" }, h("span", { class: "row__text" }, h("span", { class: "row__label" }, d.title), h("span", { class: "row__hint" }, d.sub)), h("button", { class: "btn btn--quiet arcade-how arcade-how--inline", type: "button", onclick: () => openHowToPlay(st.mode) }, "How to play")),
      h("div", { class: "row" }, h("span", { class: "row__text" }, h("span", { class: "row__label" }, st.anyoneScores ? "Anyone can enter scores" : "Everyone scores their own"), h("span", { class: "row__hint" }, "Set by the host")))
    );
  }
  const cfgLike = { startScore: st.startScore, checkIn: st.checkIn, checkOut: st.checkOut, format: { type: st.formatType, legs: st.legs }, players: [{}, {}] };
  return h(
    "div",
    { class: "rows" },
    h("div", { class: "row" }, h("span", { class: "row__text" }, h("span", { class: "row__label" }, `${st.startScore} ${describeRules(cfgLike)}`), h("span", { class: "row__hint" }, describeFormat(cfgLike)))),
    h("div", { class: "row" }, h("span", { class: "row__text" }, h("span", { class: "row__label" }, st.anyoneScores ? "Anyone can enter scores" : "Everyone scores their own"), h("span", { class: "row__hint" }, "Set by the host")))
  );
}

export async function lobbyScreen({ code }) {
  const acc = await whenAccountReady();
  if (!acc.user) return { el: h("main", { class: "page" }, topBar({ title: "Lobby", back: "#/online" }), signInPrompt()), title: "Lobby" };
  try {
    await openLobby(code);
  } catch (err) {
    toast(err.message, { tone: "bad" });
  }

  const seatsBox = h("div", { class: "people" });
  const seatCountWrap = h("div");
  const settingsBox = h("div");
  const firstWrap = h("div");
  const go = h("div", { class: "setup__go-inner lobby__go" });
  const chat = createChat({ withLog: false });
  let hostControlsFor = null; // build the host's controls once, so typing isn't interrupted

  function render() {
    const s = onlineState();
    if (!s.lobby) return;
    replaceChildren(seatsBox, s.seats.map((seat, i) => seatRow(seat, i, s)));

    const family = s.lobby.settings.mode && s.lobby.settings.mode !== "x01" ? "arcade" : "x01";
    if (s.isHost && hostControlsFor !== `${s.lobby.code}:${family}`) {
      hostControlsFor = `${s.lobby.code}:${family}`;
      const st = { ...s.lobby.settings };
      // X01 or an arcade game.
      const familyPick = h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Play")),
        segmented({
          label: "Play",
          value: family,
          options: [
            { value: "x01", label: "X01" },
            { value: "arcade", label: "Arcade" },
          ],
          onChange: (v) => updateSettings({ mode: v === "x01" ? "x01" : st.lastArcade || "clock" }),
        })
      );
      const scoringSwitch = () =>
        switchRow({
          label: "Anyone can enter scores",
          hint: "Off: everyone enters their own. On: any player can score for anyone, handy when one of you is doing the typing.",
          checked: Boolean(st.anyoneScores),
          onChange: (v) => updateSettings({ anyoneScores: (st.anyoneScores = v) }),
        });
      if (family === "arcade") {
        const a = { mode: st.mode, options: st.arcade ?? {}, formatType: st.formatType, legs: st.legs, tie: st.tie ?? "sudden" };
        for (const m of Object.keys(a.options)) a.options[m] = { ...a.options[m] };
        const ao = arcadeOptions(a, {
          playerCount: () => onlineState().lobby?.seatCount ?? 2,
          onChange: () => updateSettings({ mode: a.mode, lastArcade: a.mode, arcade: a.options, formatType: a.formatType, legs: a.legs, tie: a.tie }),
        });
        replaceChildren(settingsBox, familyPick, ao.game, ao.options, ao.games, ao.ties, h("section", { class: "section rows" }, scoringSwitch()));
      } else {
      const x01Box = h("div");
      const opts = matchOptions(st, { sideCount: () => 2, onChange: () => updateSettings(st) });
      // matchOptions changes st in place; push those changes too.
      const pushSoon = () => updateSettings(st);
      x01Box.addEventListener("click", () => setTimeout(pushSoon, 0));
      const doubles = switchRow({
        label: "Track checkout doubles",
        hint: "Asks how many darts went at a double when it matters, for checkout %.",
        checked: st.trackDoubles !== false,
        onChange: (v) => updateSettings({ ...st, trackDoubles: (st.trackDoubles = v) }),
      });
      replaceChildren(x01Box, opts.game, opts.legs, opts.rules, h("section", { class: "section rows" }, scoringSwitch(), doubles));
      replaceChildren(settingsBox, familyPick, x01Box);
      }
    } else if (!s.isHost) {
      hostControlsFor = null;
      replaceChildren(settingsBox, h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Match")), settingsSummary(s.lobby.settings)));
    }

    // Seats (host) and who throws first.
    replaceChildren(
      seatCountWrap,
      s.isHost
        ? h(
            "div",
            { class: "lobby__seats" },
            stepper({
              value: s.lobby.seatCount,
              min: MIN_SEATS,
              max: MAX_SEATS,
              label: "players",
              onChange: (n) => setSeatCount(n).catch((err) => (toast(err.message, { tone: "bad" }), render())),
            })
          )
        : null
    );
    const names = s.seats.map((x, i) => ({ value: i, label: x?.name ?? `Seat ${i + 1}` }));
    replaceChildren(
      firstWrap,
      s.isHost
        ? h(
            "section",
            { class: "section" },
            h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Throws first")),
            segmented({
              label: "Throws first",
              value: s.lobby.settings.first,
              options: [...names, { value: "random", label: "Random" }, { value: "bull", label: "Throw for bull" }],
              className: "seg--wrap",
              onChange: (v) => updateSettings({ first: v }),
            }),
            s.lobby.settings.first === "bull" ? h("p", { class: "setup__hint faint" }, "Everyone taps where their own dart landed, on their own phone. Closest starts.") : null
          )
        : null
    );

    // The action button.
    const start = canStart(s);
    const mySeat = s.seats[s.mySeat];
    replaceChildren(
      go,
      s.isHost
        ? h("button", { class: "btn btn--primary btn--block", type: "button", disabled: !start.ok, onclick: () => startOnline() }, h("span", { class: "btn__label" }, "Start match"), start.why ? h("span", { class: "btn__sub" }, start.why) : null)
        : h(
            "button",
            { class: ["btn", "btn--block", mySeat?.ready ? "btn--quiet" : "btn--primary"], type: "button", disabled: !mySeat, onclick: () => setReady(!mySeat.ready) },
            h("span", { class: "btn__label" }, mySeat?.ready ? "Not ready" : "I'm ready"),
            h("span", { class: "btn__sub" }, mySeat?.ready ? "Waiting for the host to start" : "Tap when you're at the oche")
          )
    );
  }

  const off = onOnlineChange((s, reason) => {
    if (reason === "status:playing") return navigate("/game");
    render();
  });
  render();

  const code0 = code;
  const el = h(
    "div",
    { class: "setup lobby" },
    h(
      "main",
      { class: "page" },
      topBar({ title: "Lobby", sub: `Game ${code0}`, back: "#/online" }),
      h(
        "section",
        { class: "fcode section--first" },
        h("span", { class: "fcode__label" }, "Game code"),
        h("span", { class: "fcode__code num" }, code0),
        h(
          "div",
          { class: "btn-row" },
          h(
            "button",
            {
              class: "btn btn--quiet fcode__btn",
              type: "button",
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(joinLink(code0));
                  toast("Link copied", { tone: "ok" });
                } catch {
                  toast(`Share the code: ${code0}`);
                }
              },
            },
            icon("list", { size: 18 }),
            h("span", { class: "btn__label" }, "Copy link")
          ),
          navigator.share
            ? h("button", { class: "btn btn--quiet fcode__btn", type: "button", onclick: () => navigator.share({ title: "Darts?", text: `Join my darts game. Code ${code0}.`, url: joinLink(code0) }).catch(() => {}) }, icon("upload", { size: 18 }), h("span", { class: "btn__label" }, "Share"))
            : null,
          h("button", { class: "btn btn--primary fcode__btn", type: "button", onclick: openInviteSheet }, icon("users", { size: 18 }), h("span", { class: "btn__label" }, "Invite"))
        )
      ),
      h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Players"), seatCountWrap), seatsBox),
      settingsBox,
      firstWrap,
      h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Chat")), chat.el),
      h(
        "section",
        { class: "section" },
        h(
          "button",
          {
            class: "btn btn--ghost btn--block",
            type: "button",
            onclick: async () => {
              await leaveLobby();
              navigate("/online", { replace: true });
            },
          },
          "Leave lobby"
        )
      )
    ),
    h("div", { class: "setup__go" }, go)
  );

  return {
    el,
    title: "Lobby",
    destroy() {
      off();
      chat.destroy();
    },
  };
}
