# CS2 Library

A lineup library for Counter-Strike 2: every smoke, flash, molotov and HE on a zoomable radar, with the clip one click away. Part of Reech's Toolbox, but completely self-contained: this folder doesn't depend on anything else.

## Running it

Put this folder in `reechs-toolbox/` next to `darts/`, so you have `reechs-toolbox/cs2-library/`. With VS Code's Live Server running, open `/cs2-library/`.

## Names, favourites, groups

- **Custom names**: while a clip plays, type your own name for it (next to Favourite). One name per map and side. Say it ("lineup, bazinga") to open it; its callouts still work too.
- **Favourites** show a yellow star on the map (bottom-right of the icon) and in the spot menu.
- **Content manager** (signed in, above your profile): your uploads, favourites and named lineups, with their own filters.
- **Utility groups**: choose **Group** as the grenade to add up to 10 utilities from one spot and one clip, each with its own grenade, landing, callout, throw and name (add them in the order they're thrown). Groups have their own icon and filter; the clip shows which utility lands where. By voice, a group only comes up when you say "group" (or its name).
- **Voice tab categories**: show all, favourites, named, or both. On the Voice tab, voice only searches what the map shows.

## Sharing and accounts

Anyone with the link can browse the library and watch clips. **Sign in with Google** (bottom of the menu) to keep **favourites** (a ★ on the clip, and a ★ Favourites filter on each map). **Contributors** can add lineups: you're the admin, and you choose contributors by email in **Settings**. Only whoever added a lineup can edit it; they can delete it, and so can the admin (to clean up), but nobody else. **SETUP.md** walks through the one-off setup: the security rules (`firestore.rules`, with your email in it), free clip hosting on Cloudinary (`js/config/clips-config.js`), and choosing contributors. Until then, everything works on this device as before; lineups saved on this device can be published to the shared library later from Setup.

## What's here

- **Library**: pick a map, then every lineup is its grenade's icon. Inside the map, top-left: **Filters** (favourites only, utility type, which side, show callouts, authors; the switches are saved to your preferences) and a **Throwing / Landing** switch; top-right: zoom. The Voice tab's map has the same controls. **Callouts**: **Show callouts** (off to begin with, or "lineup, show callouts" / "hide callouts") draws community callouts on the map as labels, under the lineups. **+ Add** on a map offers Add a lineup, Add or edit spawn points, and Add callouts: click the map, type the name, and it's centred there; click a callout to rename or delete it. T Spawn and CT Spawn are placed on every map to start with. **See spawns** (on each map) puts the T and CT spawns side by side, numbered, with every setpos to copy (one, all, or as `alias t1 "setpos …"` binds). Each lineup is its grenade's icon; several from the same spot share a dot with a count. Hover a spot for a menu of its lineups (side, from › to, throw, author): hovering a card highlights its path and shows where it lands as the grenade's rough area, to scale (smoke ~144 units, molotov ~150, incendiary ~137, HE 384; flashes have none); clicking it plays it. Scroll to zoom, drag to move (pinch on a phone). On a phone, the first tap previews and the second opens the clip.
- **The player**: the clip nearly full screen, with a magnifier in the bottom-left showing the middle of the same video (where the crosshair is), drawn from the playing video every frame so it's always in sync. Speed (1, 0.5, 0.25) and magnification (×2 to ×5). The **cog** opens playback settings: speed, magnification, and **close after 1 to 5 plays, or keep playing** (so a clip opened by voice closes itself mid-game; "lineup, close" works any time). Settings are saved to your account when you're signed in (so they follow you) and on the device otherwise. If the lineup came from getpos, **Copy setpos** puts you in the exact spot on a practice server.
- **Add content**: choose the clip (it's stored in this browser for now), pick the tags from fixed lists (all dropdowns: purpose included), and add a missing callout right in the list. Then three steps on the map, each unlocking the next: **Throw spot** (paste `getpos` for a perfect position, or tap), **Landing** (its own `getpos`, or tap) and **Bounces** (optional taps). Arrows move between the steps.
- **Instant smokes and spawns**: every spawn on all ten maps is built in (137, numbered as NadesDB numbers them, from the map files; Train's from a practice config), and a contributor can still correct them. Choosing the purpose **Instant (from spawn)** in Add content lets you pick the spawn, which places the throw spot exactly; say "spawn 2 window smoke" to get it. Lineups can be an image instead of a video (handy for instant smokes).
- **Voice assistant** (Chrome and Edge): start listening, then say the wake word and what you need: "lineup, mirage window smoke from T spawn". Or say just "lineup", wait for the beep, and ask within six seconds. Set **what you're playing** (map and side) on the Voice tab, or say "lineup, I'm on Mirage CT side": the tab then shows that map with its lineups and your side's numbered spawns, and requests made there stick to it ("lineup, window smoke" is enough). The corner pill on other tabs listens for anything (the map you name, else the one on screen). "T spawn to window smoke" works too. If it isn't sure, it offers the top few. While a clip is open: "close" (or "closed", "quit"), "slower", "faster", "next"; "again" (or "show again", "replay", "restart") replays it, or reopens the last one after it's closed. A pill in the corner shows it's listening on every tab. Speech is turned into text by Chrome's or Edge's speech service, so it needs the internet.
- **Settings**: how to record a lineup, and practice-server commands to copy.
- **Live game**: parked (the optional game connection only ever listens).

Try it straight away with **Load demo lineups** on an empty Mirage (uses `media/demo-clip.webm`; delete them whenever you like).

## Where things come from

- Spawns: [NadesDB](https://nadesdb.com/spawns/) (9 maps, read from the map files), and Train from a practice config; in `js/data/spawns.js`.

- Map icons, radars and screenshots: from [MurkyYT/cs2-map-icons](https://github.com/MurkyYT/cs2-map-icons), extracted from the game files on every CS2 update. The app uses your own copies in `maps/` first: run `tools/download-maps.ps1` (right-click, Run with PowerShell) to download them all. Anything not downloaded yet loads from GitHub instead (the browser console shows a 404 for each local file it didn't find: harmless).
- The overview numbers in `js/data/maps.js` turn getpos coordinates into radar positions. They're marked unverified until checked against `game/csgo/resource/overviews/<map>.txt`.
- Your lineups, clips and added callouts live in this browser (IndexedDB), behind `js/services/store.js`, so shared storage (Firestore for details, a free video host for clips) can slot in later without touching the screens.

## Layout

```
cs2-library/
├── index.html
├── css/            tokens, base and components (the toolbox look, copied), app.css
├── js/
│   ├── main.js     side menu and routes
│   ├── data/       maps, tags, lineup helpers, voice matching (pure, tested)
│   ├── config/     firebase-config.js, clips-config.js (Cloudinary)
│   ├── services/   library (shared + device), store (IndexedDB), cloud (Firebase), account,
│   │               clips (Cloudinary uploads), voice (listening), assistant, demo lineups
│   ├── screens/    library, map viewer, player, add, live, setup
│   └── ui/         page building, icons, sheets, router (copied from the toolbox)
├── maps/           your downloaded map images (see tools/download-maps.ps1)
├── media/          the demo clip
├── tools/          download-maps.ps1
└── tests/run.mjs   node cs2-library/tests/run.mjs
```

## Clips and bandwidth

Shared clips are downloaded once into this browser's cache storage and played from there, so replays, reopening a clip and later visits use no bandwidth (worst case: each clip once per device). Closing a clip unloads it completely.

## Recording

Record MP4 (H.264) or WebM, about five seconds, crosshair visible. Chrome and Edge play both; Firefox and Safari play WebM and most MP4s.
