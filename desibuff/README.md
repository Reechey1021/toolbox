# DesiBuff

A bike computer for Dad: speed, free rides, recorded courses with splits, racing your own record, and heart rate from the CYCPLUS H1. A web version of the Android app, with the same measuring rules, in the bike's navy and neon green. The interface is in Hungarian.

Lives at `reechs-toolbox/desibuff/` and works on its own: it has its own manifest and icon, so it can be installed as a separate app.

## Gyors útmutató (apának)

**Telepítés a telefonra (Samsung, Chrome):**
1. Nyisd meg Chrome-ban: `https://reech.lol/desibuff/`
2. Koppints a jobb felső ⋮ menüre → **Hozzáadás a kezdőképernyőhöz** (vagy **Alkalmazás telepítése**) → **Telepítés**.
3. Ezután a kezdőképernyőn lévő DesiBuff ikonról indítsd: teljes képernyőn nyílik, böngészősáv nélkül.
4. Első indításkor engedélyezd a **helymeghatározást**.

**A régi app adatainak áthozása:**
1. A **régi** appban: Profil → Általános → **MENTÉS**, és mentsd el a fájlt (például a Letöltések mappába).
2. Az **új** appban: Profil → **Betöltés fájlból** → válaszd ki a fájlt → **Betöltés**.
3. Minden átjön: pályák, rekordok, részidők, pályafutamok, szabad menetek. Ha valami nem stimmel: **Utolsó betöltés visszavonása**.

**Élő térkép:** a gombok fölötti helyen. Mindig arra fordul, amerre mész; a zöld vonal mögötted van, a fehér előtted (pályafutamnál). A piros pont vagy piros nyíl a rekord menet. Bal felső sarok: iránytű, jobb felső: szél (ha van internet).

**Pulzuszónák:** Profil → fogaskerék → **Zónák testreszabása**. Mindegyik zónánál beállítod, hány bpm-nél kezdődik.

**Pulzusmérő (CYCPLUS H1):** kapcsold be, tedd fel, majd koppints a felső sávban a szívre → **Csatlakoztatás** → válaszd ki a listából. Minden indításkor egyszer kell csatlakoztatni. Menet közben, ha megszakad, magától újracsatlakozik.

**Képernyő:** amíg az app nyitva van, nem kapcsol ki és nem zárol le magától. A bekapcsológombot nem tudja letiltani.

## What's in it

- **Utazás (ride):** idle cruise, free ride (with pause), recording a new course (with splits), racing a course against its record.
- **Race screen priorities:** the gap to the record is the biggest thing on screen, and the whole band turns green (ahead) or red (behind). Then speed, time and distance left. A thin course strip shows you, the record ghost and the splits, with an optional small track map.
- **Pályák (courses):** list, a page per course (map, best times, splits, rename, reorder, delete) and the split editor (slider plus map, equal splits, undo).
- **Profil:** totals (this week, this month, all time), filterable history, a page per ride (map, sectors, speed, height, heart-rate and delta charts), and import/export.
- **Live map:** fills the space above the buttons on every ride screen, with rounded corners and softly faded edges. It turns so his direction is always up, glides between GPS fixes and zooms out as he speeds up.
  - In a race: done part green, rest of the course white, record ghost red (an arrow on the map's edge when it's out of view), splits yellow, finish red and white.
  - Otherwise: his trail green, nearby courses grey with their starts marked.
  - Corners: compass (top left) and wind (top right), the wind labelled headwind, tailwind or crosswind against his direction.
  - The lines, blip, compass and ghost are drawn by the app itself and need no signal. Underneath, a dark label-free street map is added when the phone can load it.
- **Heart rate:** a big bpm number and a fat five-part bar that fills with the actual pulse: 135 bpm in a 120–150 zone 4 fills half the 4th part. The filled bar takes the zone's colour. Zones are 50/60/70/80/90 % of max heart rate by default, or his own bpm limits via "Zónák testreszabása".
- **Voice and buzz:** Hungarian call-outs for the countdown, each split ("Második részidő, 3 másodperccel előrébb"), the finish and each km. Uses the phone's own text-to-speech, with beeps and vibration too.

## Same rules as the Android app

The ride engine (`js/engine/ride.js`) is a port of the Android app's logic, decompiled from its classes:

- Distance uses Android's exact formula (Vincenty on WGS84, `Location.distanceBetween`). It only counts steps of 0.5 to 250 m between fixes that are both within 30 m accuracy.
- A track point is saved at ≤ 30 m accuracy and ≥ 6 m from the last.
- The race follows you along the route in a window of 3 points back and 20 ahead. The finish unlocks within 50 m of the end, in the last 3 points.
- A course counts as nearby within 50 m of its start. Starting it or tapping "Most nem" hides the prompt for 5 minutes.
- GPS quality labels use the old thresholds: 8, 15 and 30 m.
- Sector times are measured the same way, so imported rides and new ones compare fairly.

## What changed from the Android app

- **Live delta:** worked out by distance along the course every second, instead of by route-point fraction every 5 s.
- **Auto-finish:** the clock stops at your closest point to the finish, with no button to fumble. It can be switched off in Settings; with it off, the finish button stays usable after you've reached the line.
- **One comparison:** a run's total delta and its sector deltas are both against the record. The old app compared the sectors with your very first ride.
- **Recording time:** a new course's time stops when the recording stops. The old app kept counting while you typed the name.
- **Imported course IDs:** kept, so imported runs stay attached to their courses. The old importer gave every course a new ID.
- **Screen-off gaps:** if GPS paused (screen off), the straight-line gap is added back when it's believable (≤ 60 km/h).
- **Max speed:** ignores fixes worse than 30 m accuracy.
- **Height for every ride:** altitude is now saved on course runs too, so they get a height chart.
- **Heart rate:** stored per point, with average and max per ride.
- **Crash recovery:** if the browser closes mid-ride, it offers to carry on or save.
- **Protection mid-ride:** back swipes can't close the app mid-ride (on the main screen it takes two). Pull-to-refresh is off, and the screen is portrait-locked when installed.

## Data

Saved in IndexedDB on the device (not localStorage, whose ~5 MB is shared with the whole site). Backups use the Android app's version 2 JSON format, so the Android app can read them too. The extra fields (`heartRate`, `avgHeartRate`, `maxHeartRate`) are ignored there.

## Limits worth knowing

- **iPhone:** no browser on iOS supports Bluetooth, so heart rate is Android (Chrome) only. Everything else works on iPhone.
- **Screen off:** a web page gets no GPS while the screen is off. The app keeps the screen on, but can't stop the power button.
- **Bluetooth after a restart:** Chrome asks to pick the heart-rate monitor again after each app restart. Where Chrome allows it, the app reconnects to a known device by itself.
- **Maps:** course and ride pages use OpenStreetMap's own tiles (free, no API key), darkened to match the app. The live map's streets come from OpenFreeMap (free, no key) through the MapLibre library, loaded from a CDN the first time and then cached. Without them, the live map still draws the route, trail, blip, ghost and compass on a dark background. Map data you've seen is kept for offline use.
- **Wind:** Open-Meteo's forecast for the area, free for personal use and needing no key. It's checked every 15 minutes or after 5 km, only when online. It's a model value for the area, not a measurement on the spot.

## Testing on a desktop

Settings → **Teszt (asztali géphez)**:
- **Bemutató** starts a simulated race on the Reservoir course with simulated GPS and heart rate: live map, wind, heart-rate bar, splits and the finish, all at once.
- **Szimulált GPS** and **Szimulált pulzus** switch each one on separately.
- **Szimuláció ki** turns both off.

Run it from a local server in the toolbox folder:

```
python3 -m http.server 8000
# then open http://localhost:8000/desibuff/
```

Logic tests (distance maths, ride rules, races, splits, Android backup round trip, heart-rate zones, map camera, wind):

```
node desibuff/tests/run.mjs
```

Simulation test in a real browser. It plays the Bemutató at S20 FE screen size with time fast-forwarded, and checks the live map, compass, wind, ghost, heart-rate tile, custom zones and turning the map off. Screenshots go to `desibuff/tests/out/`:

```
pip install playwright && playwright install chromium
python3 desibuff/tests/sim.py
```

## Files

```
desibuff/
  index.html  manifest.webmanifest  sw.js  README.md
  css/app.css
  icons/      icon.svg, 180/192/512 px PNGs, maskable 512
  js/main.js            starts the app, wires everything up
  js/engine/            geo.js (distances), ride.js (the rules), sectors.js (splits, delta), format.js,
                        zones.js (heart-rate zones), camera.js (live map maths)
  js/data/              repo.js (courses and rides), backup.js (Android format), defaults.js (Reservoir CW/CCW), store.js (IndexedDB)
  js/services/          gps.js (plus simulator), hr.js (Bluetooth heart rate), wakelock.js, voice.js, wind.js
  js/ui/                dom.js, layers.js (pages, sheets, toasts), map.js (track drawing, tile map), minimap.js (live map), charts.js
  js/screens/           ride.js, courses.js, profile.js, sheets.js
  tests/run.mjs         logic tests (Node)
  tests/sim.py          browser simulation test (Playwright)
```
