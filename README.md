# Reech's Toolbox

A home for the tools I build. Each tool lives in its own folder and never depends on another, so one breaking can't take the rest down.

| Tool | Folder | What it does |
| --- | --- | --- |
| Darts | [`/darts`](./darts/) | X01 scorer with online play, friends, Nemesis (a bot rival), teams, throw for the bull, handicaps, a caller, match history and lifetime stats |

The root `index.html` is a placeholder until there are enough tools for a proper hub.

---

## Run it on your computer

Browsers won't run the app by double-clicking `index.html` (they block the code files when opened that way), so you need a tiny local server. Pick whichever's easiest:

**Python** (already on most Macs and Linux; on Windows, install it from python.org):

```bash
cd reechs-toolbox
python3 -m http.server 8000
```

Then open <http://localhost:8000/darts/>.

**VS Code:** install the "Live Server" extension, right-click `index.html` in the root, choose "Open with Live Server", then go to `/darts/`.

**Node:** `npx serve .` in the root folder.

### Try it on your phone before deploying

With the server running, find your computer's local IP (e.g. `192.168.1.20`) and open `http://192.168.1.20:8000/darts/` on your phone, on the same Wi-Fi. A couple of things (keeping the screen awake, offline support) only switch on over `https`, so they'll work properly once it's on GitHub Pages.

---

## Put it on GitHub Pages

1. Create a new repository on GitHub, e.g. `reechs-toolbox`. Public is fine.
2. Upload everything in this folder to it (drag and drop on github.com works, or use `git push`).
3. In the repository go to **Settings, Pages**. Under "Build and deployment" choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute it's live at `https://<your-username>.github.io/reechs-toolbox/darts/`.

Every push after that redeploys automatically.

### Install it like an app

Open the darts page on your phone, then:

- **iPhone:** Share button, then "Add to Home Screen".
- **Android:** the browser menu, then "Install app" or "Add to Home screen".

It opens full screen, and works with no signal after you've opened it once online. For the caller to work offline too, go to **Settings, Save the caller for offline use** once on Wi-Fi.

### Shipping an update

Bump `VERSION` in `darts/js/version.js` and `CACHE_VERSION` in `darts/sw.js`, then push. Phones pick up the new version the next time they open the app online.

---

## Darts: how it's built

No frameworks, no build step. Plain HTML, CSS and JavaScript modules, so there's nothing to install and nothing to break.

```
darts/
├── index.html            the page shell
├── sw.js                 offline support
├── manifest.webmanifest  "add to home screen" details
├── css/                  tokens (palette, type), base, components, screens, game
├── audio/                caller clips (numbers, names, phrases)
├── icons/
├── tests/                engine tests: open /darts/tests/ in the browser
└── js/
    ├── engine/           the rules. Pure logic: no screen, no storage
    │   ├── board.js      every possible dart
    │   ├── rules.js      finishes, bogeys, busts, darts at a double
    │   ├── checkouts.js  checkout routes
    │   ├── visit.js      scores one visit
    │   ├── match.js      a match = settings + list of visits, replayed
    │   └── stats.js      every number shown anywhere
    ├── config/           firebase-config.js (paste yours here)
    ├── services/         talking to the outside world
    │   ├── storage.js    the only file that touches saved data
    │   ├── account.js    Google sign-in, linking and sync
    │   ├── cloud/        Firebase (real) and a fake for testing
    │   ├── profile.js    who's using this device
    │   ├── session.js    the match in progress
    │   ├── settings.js
    │   ├── caller.js
    │   └── device.js     screen wake lock, vibration, file downloads
    ├── ui/               shared building blocks (router, sheets, controls, icons)
    └── screens/          one file per screen; game/ splits the match screen up
```

### The rules that keep it from falling apart

1. **The engine never touches the screen or storage.** If a rule changes, only `js/engine` changes, and the tests prove it still works.
2. **A match is its settings plus a list of visits.** Scores, legs, stats and whose throw it is are all worked out by replaying that list. Undo just removes the last visit. That's also what makes Nemesis, ghost replays and online sync straightforward later.
3. **Only `storage.js` saves anything.** When Google sign-in arrives, cloud sync goes in there and nothing else needs to know.
4. **Screens don't talk to each other.** They go through services.
5. **Run the tests after touching the engine:** open `/darts/tests/` in the browser, or `node darts/tests/run.mjs`.

### Your data

Everything is saved on the device: settings and the match in progress in local storage, finished matches in the browser's database. **Settings, Back up everything** saves a file you can restore on another device. When sign-in arrives, matches played on this device will move into your account.

### Getting around

A menu bar floats at the bottom of every screen except during a match (and the bull throw): **Home**, **Stats**, **Friends** (with a badge when requests are waiting), **Profile** and **Settings**.

### Accounts and your profile

Tap **Profile** (or your avatar on the home screen) for your profile: your darts under your name, a quick look at your numbers, your five most recent matches (with a link to the full history), and at the bottom your profile settings: account, name, darts, and the **announcer** recording the caller uses for you ("Richard, you require 32").

Signing in with Google backs up your matches and profile and syncs them between devices. Each account is its own person: its own name, announcer, darts, friend code and matches. Signing out takes the device back to its guest, and signing in as someone else never mixes anyone's matches; only matches played as the guest are offered to bring along. It needs a one-off free Firebase setup: follow **FIREBASE_SETUP.md** and paste your config into `darts/js/config/firebase-config.js`. Until then the app runs entirely on the device, and nothing is loaded from Google.

How it works: the device is always the source of truth, so you can play offline and it catches up later. On a device's first sign-in your matches move to your account's player id, and you choose whether to back them up or keep them on that device only. After that, finished matches, deletions and profile edits sync straight away; for the profile, the newest change wins.

Firebase is configured in `darts/js/config/firebase-config.js` (set it to `null` to switch accounts off). For testing without a real account, add `?fakecloud` to the address (e.g. `http://127.0.0.1:5500/darts/?fakecloud`). It pretends to be a signed-in Google account and keeps its "cloud" in the browser. Never used otherwise.

### Voice scoring

A third way to enter scores, alongside the keypad and the dart pad: the input button cycles keypad, dart pad, voice (or pick one from the match menu). A big microphone takes the keys' place and starts listening straight away. Say the wake word and the score: "score one hundred and forty" (it also accepts "school", "sore", "scored", "scores" and "call", which is what browsers often hear). Switch the microphone to **Tap to talk** to listen only when you tap it, with no wake word needed.

The engine is the original app's, unchanged: Chrome and Edge use the browser's speech recognition; other browsers (Firefox, Safari, Opera GX) fall back to Whisper running on the device, which is slower the first time it loads. It pauses while it isn't your turn (online, or while Nemesis throws). See `darts/js/services/voice.js`.

### Rules and match info

In a match, the **ⓘ** button next to the menu shows the match settings and how to play the game. Arcade setup and online lobbies have **How to play** for the chosen game, and there's no back button in a match: you leave with Leave match or End match in the menu.

### Arcade

**Arcade** on the home screen (and in online lobbies, via the X01 / Arcade switch) has five games:

- **High Score**: most points in a set number of visits.
- **Race**: first to a target (300, 500, 600 or 1,000).
- **Around the Clock**: 1 to 20 or 20 to 1, then 25 or bull, the bull only, or no bull. Hits can count for anything, doubles only or trebles only, and optionally doubles and trebles jump you on (a jump never skips the bull).
- **Bull game**: 25 is 1 point, the bull is 3; a set number of visits or a points target.
- **Shanghai**: one number per round (7, 10 or 20 rounds); a single, double and treble of it in one visit wins outright.

High Score and Race use the keypad. The others use the **target pad**: a few big keys for the next dart that change as you go, with undo a dart at a time (on desktop, number keys 1 to 4 and M for miss).

Fairness: everyone always gets the same number of visits, as wins are only checked at the end of a full round. Several players finishing in the same round, or level when the visits run out, is a tie, settled by the rule you pick: **Sudden death** (one more visit each, best visit wins, repeat if still level), **Bull throw** (the tied players throw for the bull), **Starter wins**, or **Allow a tie**. Games can be first to or best of several, and each new game the next player leads off.

**Change game** (in the game menu and on the summary) keeps the players and switches to another game; online, the host's choice takes everyone back to the lobby, still ready. Arcade games are in your history, but never touch your X01 averages or stats.

Under the hood each game is a small set of rules in `darts/js/engine/arcade/modes.js`; rounds, ties, games and turns are shared in `arcade/core.js`, so a new game is mostly a new entry in that file.

### Online play

Signed in, **Play online** lets you host a lobby or join one with a six-character game code or link. Friends can also be invited straight from your friends list or a friend's profile; the invite pops up in their app wherever they are.

- **The lobby**: seats are tied to Google accounts, so nobody else can take yours. The host sets the match (2 to 4 players, score, legs, rules, who throws first) and everyone sees changes live. **Start** unlocks once every seat is filled and everyone's ready.
- **Scoring**: by default everyone enters their own scores, and only on their turn. The host can switch on **Anyone can enter scores**, so one person can do the typing for everyone. Undo is limited to your own last visit unless anyone can score; while waiting for the next player you can still undo your own last visit from the waiting panel.
- **Reconnecting**: your seat belongs to your account, so if your phone locks or you close the app, just open it again and carry on. There is no background "online/away" tracking: Firebase is only written when someone actually does something (joining, ready, a visit, an undo, a chat message), which keeps it comfortably free.
- **Chat and the live log**: under the keypad on wide screens, behind the chat button on phones. The scoring lines ("Reech scored 138. 363 remaining.") come from the match itself.
- **Afterwards**: everyone gets the match in their own history and stats. The host can rematch, which takes everyone back to the lobby with the same seats.

How it works: the lobby is one Firestore document every player listens to. The match is its settings plus the list of visits, exactly as offline; each device replays the same list, so everyone sees the same thing. Every visit and undo is a transaction, so two phones can never both write "the next visit", and the security rules enforce whose turn it is. Online is singles for now (teams, Nemesis and handicaps are local only). **Throwing for the bull** works online too: everyone taps where their own dart landed on their own phone, sees the others' darts arrive, and the host's phone settles it (ties throw again). The host's match menu also has **Restart match**: same players and settings, back to the first dart.

For testing without two phones, open two tabs with `?fakecloud&fakeuser=reech` and `?fakecloud&fakeuser=dave`: each tab is a separate person and device, sharing one pretend cloud.

### Friends

Signed in, you get a **friend code** (six letters and numbers, nothing easily confused) and a link, both on your profile and in **Friends**. Share either; opening the link goes straight to adding you. Requests appear in the app live, with a badge on the home screen, and you can accept or decline. A friend's profile shows their stats, their darts and a side-by-side comparison with yours, and lets you remove them.

Privacy: before you're friends, all anyone can see is your name and photo. Your stats are visible to your friends only, and only as totals, never your individual matches. The security rules in `firestore.rules` enforce all of this on Firebase's side, not just in the app. **Whenever `firestore.rules` changes, paste it into Firebase again** (Firestore Database, Rules, Publish).

### Nemesis

Nemesis is a bot you play against, either from its own screen (your head-to-head record, its personality, one button to play) or added as a player in a local game with **Add Nemesis**, including as someone's team partner. One per match.

Its personality is a target average plus four dials, with six presets (Standard, Scorer, Finisher, Rollercoaster, Ice Cold, Bottler):

- **Range**: how far one leg's average can land from the target. A 60 at ±4 always lands between 56 and 64.
- **Consistency**: how much its scoring swings from visit to visit.
- **Checkout strength**: how well it hits the doubles.
- **Composure**: when it's behind in legs or in a deciding leg, an ice-cold Nemesis leans to the top of its range and a bottler to the bottom. It never leaves the range.

"Match my form" sets its target a couple of points above your recent average.

How it works: every dart is simulated for real. Nemesis aims where a player would (checkout routes, safe setups such as 25 from 61 to leave D18, otherwise treble 20), and a single skill number decides where each dart lands. At the start of each leg it simulates dozens of candidate legs and keeps the one closest to that leg's target, correcting its skill first so it stays accurate from any starting score and with any rules. Everything is seeded from the match, so undo and replays give identical darts. As a team partner it plans one visit at a time, since the shared score depends on someone else too.

The engine tests prove it: every planned leg replays exactly through the real scoring engine, and across all six presets at averages from 30 to 105, every leg lands inside its range. `node darts/tools/calibrate.mjs` re-measures the dart model if you ever tweak it.

Your averages count every dart you throw, but your win record is split between friends and Nemesis, so beating a 40-average bot never pads it.

### Teams

With three or four players, setup offers **Singles** or **Teams**: always two teams (2 v 2, or 2 v 1 where the solo player throws every time their team is up). Partners share one score. Teams alternate and partners alternate, in a fixed rotation (for example Reech, Third, Test, Four), and each leg starts one place further round, so the teams take turns to start and everyone leads off a leg. For the bull, the first player on each team throws. Handicaps belong to the team. Everyone keeps their own stats from their own darts, legs won belong to the team, and a team win counts as a win for you.

Under the hood every match is played between *sides*: a normal game is just sides of one player each, so solo and team games run through the same code.

### Handicaps

Each player in setup has a Handicap button: their own starting score, a score multiplier (0.5x to 2x), check in, check out, and whether they must finish exactly or can go over. Any multiplier other than 1x always finishes by reaching zero or going over, because some multiplied scores can never land exactly on zero (at 2x from 501 you're always left on an odd number). Averages still count what each player actually threw, and checkout records aren't kept for handicapped players. Handicaps are never remembered for the next match, so every new match starts level.

### Adding a caller name

Drop an MP3 into `darts/audio/names/`, named exactly as it should appear (e.g. `Dave.mp3`, or `Big Dave.mp3`). That's it:

- it appears in the **Announcer** dropdown on your profile, so you can pick it for yourself
- any player with that name (any capitalisation) gets their name called: "Dave, you require 32"

Locally (Live Server) the app reads the folder directly. On GitHub Pages, where folders can't be listed, it asks GitHub's public API what's in the folder, so push the new file and it shows up (the list refreshes at most once an hour).

---

## What's next for darts

1. Cricket
2. Voice scoring and ghost replays
