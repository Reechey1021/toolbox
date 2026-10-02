"""
DesiBuff simulation test: a full simulated ride in a real browser.

    pip install playwright && playwright install chromium
    python3 desibuff/tests/sim.py

Plays the in-app "Bemutató" (simulated GPS race + simulated heart rate) at the
S20 FE's screen size, fast-forwarding time, and checks the live map, heart-rate
tile and zones, compass, wind, the record ghost and turning the map off.
The weather service is faked with a known wind so the wind corner can be
checked; the street map library is either blocked (to prove the map works
without it) or replaced with a stand-in that records what the app asks of it.
Screenshots go to desibuff/tests/out/.
"""
import http.server, json, math, socketserver, sys, threading, time
from functools import partial
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent
OUT = APP / "tests" / "out"
OUT.mkdir(exist_ok=True)
WIND = {"current": {"wind_speed_10m": 18.0, "wind_direction_10m": 300.0, "wind_gusts_10m": 31.0}}

passed, failed = 0, []
def check(ok, msg):
    global passed
    if ok: passed += 1
    else: failed.append(msg)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), partial(Quiet, directory=str(APP.parent)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/{APP.name}/"

FAKE_MAPLIBRE = """
window.__mlCalls = [];
window.maplibregl = { Map: class {
  constructor(o) { this.o = o; window.__mlOptions = o; this.h = {}; setTimeout(() => (this.h.load || []).forEach((f) => f()), 0); }
  on(n, f) { (this.h[n] ||= []).push(f); }
  jumpTo(v) { window.__mlCalls.push(v); if (window.__mlCalls.length > 50) window.__mlCalls.shift(); }
  resize() {}
} };
"""

def page_for(browser, url, fake_maplibre=False):
    ctx = browser.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True)
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    ctx.route("https://tile.openstreetmap.org/**", lambda r: r.abort())
    ctx.route("https://tiles.openfreemap.org/**", lambda r: r.abort())
    ctx.route("https://cdn.jsdelivr.net/**", lambda r: r.abort())
    ctx.route("https://unpkg.com/**", lambda r: r.abort())
    ctx.route("https://api.open-meteo.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(WIND), headers={"Access-Control-Allow-Origin": "*"}))
    if fake_maplibre: ctx.add_init_script(FAKE_MAPLIBRE)
    pg = ctx.new_page()
    pg.set_default_timeout(5000)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.clock.install(time=1759400000000)
    pg.goto(url + "?nosw")
    # stored data loads in real time, not on the fake clock: wait until the app is up
    for _ in range(100):
        pg.clock.run_for(100)
        if pg.evaluate("!!window.__desibuff"): break
        time.sleep(0.05)
    pg.clock.run_for(1000)
    return ctx, pg, errs

def ev(pg, js): return pg.evaluate(js)

def canvas_colours(pg):
    """Counts pixels on the map overlay that are neon green, white-ish, red and grey."""
    return ev(pg, """(() => {
      const c = document.querySelector('.mm-ov'); if (!c || !c.width) return null;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let neon = 0, white = 0, red = 0, grey = 0;
      for (let i = 0; i < d.length; i += 16) {
        const [r, g, b, a] = [d[i], d[i+1], d[i+2], d[i+3]]; if (a < 150) continue;  // grey courses are drawn slightly see-through
        if (g > 220 && r > 160 && r < 215 && b < 60) neon++;
        else if (r > 215 && g > 220 && b > 230) white++;
        else if (r > 230 && g < 110 && b < 120) red++;
        else if (Math.abs(r - 125) < 25 && Math.abs(g - 137) < 25 && b > 160 && b < 205) grey++;
      }
      return { neon, white, red, grey };
    })()""")

def run_until(pg, js, step=20000, limit=120):
    for _ in range(limit):
        if ev(pg, js): return True
        pg.clock.run_for(step)
    return False

def main():
    httpd, url = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- 1. the whole demo, street map unavailable (overlay must work alone) ----------
        ctx, pg, errs = page_for(browser, url)
        pg.click(".tabs >> text=Profil"); pg.clock.run_for(300)
        pg.click('[aria-label="Beállítások"]'); pg.clock.run_for(300)
        pg.screenshot(path=str(OUT / "01_settings.png"))
        pg.click('button:has-text("Bemutató")'); pg.clock.run_for(800)
        check(ev(pg, "__desibuff.settings.simGps && __desibuff.settings.simHr"), "Bemutató switches on simulated GPS and heart rate")
        pg.clock.run_for(2000)
        check(ev(pg, "!!__desibuff.engine.countdown || __desibuff.engine.mode === 'race'"), "Bemutató starts a race on the Reservoir course")
        pg.clock.run_for(4000)
        check(ev(pg, "__desibuff.engine.mode") == "race", "race running after the countdown")
        ev(pg, "__desibuff.gps.setSimSpeed(90)")      # fast-forward the lap
        pg.clock.run_for(60000)

        mm = ev(pg, "(() => { const m = document.querySelector('.minimap'); const r = m && m.getBoundingClientRect(); const c = document.querySelector('.controls').getBoundingClientRect(); return m && { h: r.height, w: r.width, bottom: r.bottom, ctrlTop: c.top, tiny: m.classList.contains('mm-tiny') }; })()")
        check(mm and mm["h"] >= 120 and not mm["tiny"], f"race: the live map fills the free space ({mm})")
        check(mm and mm["bottom"] <= mm["ctrlTop"] + 1, "the map sits above the buttons")
        check(pg.locator(".mini-track").count() == 0, "the old small track drawing is gone")
        col = canvas_colours(pg)
        check(col and col["neon"] > 30 and col["white"] > 30, f"race: green behind him and white ahead are drawn ({col})")
        b = ev(pg, "__desibuff.minimap.bearing"); hd = ev(pg, "__desibuff.engine.heading")
        diff = abs(((b - hd + 540) % 360) - 180)
        check(diff < 25, f"the map turns so his heading is up (map {b:.0f}°, heading {hd:.0f}°)")
        rot = ev(pg, "document.querySelector('.mm-compass g').getAttribute('transform')")
        check(rot and f"rotate({-b:.0f}" in f"rotate({float(rot.split('(')[1].split()[0]):.0f}", f"compass needle counter-rotates with the map ({rot})")
        wind = ev(pg, "(() => { const w = document.querySelector('.mm-wind'); return { hidden: w.hidden, text: w.innerText, feel: w.dataset.feel }; })()")
        check(not wind["hidden"] and "18 km/h" in wind["text"], f"wind corner shows the wind speed ({wind})")
        feel = ev(pg, "(() => { const f = __desibuff.engine.fix; const h = __desibuff.engine.heading; const a = Math.abs((((300 - h) % 360) + 540) % 360 - 180); return a <= 45 ? 'szembeszél' : a >= 135 ? 'hátszél' : 'oldalszél'; })()")
        check(wind["feel"] == feel, f"wind is labelled against his direction of travel ({wind['feel']} vs expected {feel})")
        check("Open-Meteo" in pg.inner_text(".mm-attr"), "wind source credited on the map")

        hr = ev(pg, """(() => { const c = document.querySelector('.hr-cell'); if (!c) return null;
          const n = c.querySelector('.hr-num .num'); const bar = c.querySelector('.hr-bar');
          return { bpm: Number(n.textContent), font: parseFloat(getComputedStyle(n).fontSize), barH: bar.getBoundingClientRect().height,
                   text: c.innerText, widths: [...bar.querySelectorAll('b')].map((b) => parseFloat(b.style.width) || 0) }; })()""")
        check(hr and hr["font"] >= 64, f"heart-rate number is big ({hr and hr['font']} px)")
        check(hr and "zóna" not in hr["text"].lower(), "no '4. zóna: Küszöb' label on the ride screen")
        check(hr and hr["barH"] >= 28, f"the bar is fatter ({hr and hr['barH']} px)")
        exp = ev(pg, f"""(async () => {{ const z = await import('./js/engine/zones.js'); return z.zoneFill({hr['bpm'] if hr else 0}, z.zoneLimits(__desibuff.settings)).map((f) => +(f * 100).toFixed(1)); }})()""")
        check(hr and all(abs(a - b) < 0.2 for a, b in zip(hr["widths"], exp)), f"bar fills with the actual pulse ({hr and hr['bpm']} bpm: {hr and hr['widths']} vs {exp})")
        pg.screenshot(path=str(OUT / "02_race_first_lap.png"))

        ok = run_until(pg, "__desibuff.engine.mode !== 'race'")
        check(ok and ev(pg, "__desibuff.engine.result && __desibuff.engine.result.kind") == "race", "the simulated race finishes by itself")
        pg.screenshot(path=str(OUT / "03_result.png"))
        pg.click('.layer.modal button:has-text("Bezárás")'); pg.clock.run_for(300)

        # ---------- 2. a second lap: now there's a record ghost ----------
        ev(pg, "__desibuff.engine.suppressed.clear(); __desibuff.settings.simKmh = 80; __desibuff.restartGps()")
        pg.clock.run_for(1500)
        ev(pg, "__desibuff.startRace('reservoir_cw')"); pg.clock.run_for(4000)
        pg.clock.run_for(180000)
        check(ev(pg, "!!(__desibuff.engine.race && __desibuff.engine.race.ref)"), "second lap races against the first one's record")
        col = canvas_colours(pg)
        check(col and col["red"] > 5, f"the record ghost shows on the map ({col})")
        pg.screenshot(path=str(OUT / "04_race_with_ghost.png"))
        ev(pg, "__desibuff.engine.abortRace()"); pg.clock.run_for(500)

        # ---------- 3. idle and free ride: trail, nearby courses, heart rate on the idle screen ----------
        pg.clock.run_for(20000)
        idle = ev(pg, "({ irany: [...document.querySelectorAll('.cell .lab')].some((l) => l.textContent.includes('Irány')), hr: !!document.querySelector('.ride .hr-cell'), map: !!document.querySelector('.ride .minimap') })")
        check(idle["map"] and idle["hr"], f"idle screen has the map and the heart-rate tile ({idle})")
        check(not idle["irany"], "with the map on, the compass replaces the Irány tile")
        col = canvas_colours(pg)
        check(col and col["neon"] > 10, f"idle: his trail draws green ({col})")
        pg.screenshot(path=str(OUT / "05_idle.png"))
        pg.click("text=Szabad menet"); pg.clock.run_for(3500); pg.clock.run_for(90000)
        col = canvas_colours(pg)
        check(ev(pg, "__desibuff.engine.mode") == "freeroam" and col and col["neon"] > 30, f"free ride: his trail draws green behind him ({col})")
        pg.screenshot(path=str(OUT / "06_free_ride.png"))
        pg.click('.controls button:has-text("Vége")'); pg.click(".controls button.armed"); pg.clock.run_for(500)
        pg.click('.layer.modal button:has-text("Bezárás")'); pg.clock.run_for(300)

        # ---------- 4. custom zones ----------
        pg.click(".tabs >> text=Profil"); pg.clock.run_for(300)
        pg.click('[aria-label="Beállítások"]'); pg.clock.run_for(300)
        pg.click('button:has-text("Zónák testreszabása")'); pg.clock.run_for(300)
        before = ev(pg, "__desibuff.settings.hrZones")
        for _ in range(6): pg.click('[aria-label="4. zóna kezdete feljebb"]'); pg.clock.run_for(50)
        z = ev(pg, "__desibuff.settings.hrZones")
        check(before is None and z and z[3] == 136 + 6, f"pressing + moves zone 4's start up one bpm at a time ({z})")
        check(z and all(z[i] < z[i + 1] for i in range(4)), "zones stay in rising order")
        for _ in range(40): pg.click('[aria-label="4. zóna kezdete feljebb"]'); pg.clock.run_for(20)
        z = ev(pg, "__desibuff.settings.hrZones")
        check(z and z[3] == z[4] - 1, f"zone 4 can't run past the start of zone 5 ({z})")
        pg.screenshot(path=str(OUT / "07_zones.png"))
        pg.click('button:has-text("Visszaállítás a max pulzusból")'); pg.clock.run_for(300)
        check(ev(pg, "__desibuff.settings.hrZones") is None, "reset goes back to zones from max heart rate")
        pg.click('button:has-text("Kész")'); pg.clock.run_for(300)

        # ---------- 5. map off ----------
        pg.click('[aria-label="Élő térkép"]'); pg.clock.run_for(300)
        pg.click(".layer.page .back"); pg.click(".tabs >> text=Utazás"); pg.clock.run_for(600)
        off = ev(pg, "({ map: !!document.querySelector('.ride .minimap'), irany: [...document.querySelectorAll('.cell .lab')].some((l) => l.textContent.includes('Irány')) })")
        check(not off["map"] and off["irany"], f"with the map off, the Irány tile comes back ({off})")
        check(not errs, f"no errors in the page ({errs[:3]})")
        ctx.close()

        # ---------- 6. the street-map library contract (stand-in records what we ask) ----------
        ctx, pg, errs = page_for(browser, url, fake_maplibre=True)
        ev(pg, "Object.assign(__desibuff.settings, { simGps: true, simKmh: 30 }); __desibuff.restartGps()")
        pg.clock.run_for(15000)
        opts = ev(pg, "window.__mlOptions && { style: window.__mlOptions.style.sources.omt.url, interactive: window.__mlOptions.interactive, layers: window.__mlOptions.style.layers.map((l) => l.type) }")
        check(opts and opts["style"] == "https://tiles.openfreemap.org/planet" and opts["interactive"] is False, f"street map uses OpenFreeMap and ignores touches ({opts})")
        check(opts and "symbol" not in opts["layers"], "street map has no text labels (they'd turn upside down)")
        call = ev(pg, "window.__mlCalls.at(-1)")
        fix = ev(pg, "__desibuff.engine.fix")
        b = ev(pg, "__desibuff.minimap.bearing")
        check(call and abs(((call["bearing"] - b + 540) % 360) - 180) < 0.5, f"street map turns with the overlay ({call and call['bearing']:.1f} vs {b:.1f})")
        if call and fix:
            # the camera centre sits ahead of him, in the direction he's heading
            dy = (call["center"][1] - fix["lat"]) * 111320
            dx = (call["center"][0] - fix["lng"]) * 111320 * math.cos(math.radians(fix["lat"]))
            ahead = math.degrees(math.atan2(dx, dy)) % 360
            check(abs(((ahead - b + 540) % 360) - 180) < 30 and 5 < math.hypot(dx, dy) < 400, f"street map centre is ahead of him (bearing {ahead:.0f}° vs {b:.0f}°, {math.hypot(dx, dy):.0f} m)")
        check("OpenMapTiles" in pg.inner_text(".mm-attr"), "street map credited once it loads")
        col = canvas_colours(pg)
        check(col and col["grey"] > 20 and col["neon"] > 10, f"idle on a course he hasn't ridden yet: the course ahead is grey, his trail green ({col})")
        pg.screenshot(path=str(OUT / "08_idle_with_street_map_stub.png"))
        check(not errs, f"no errors with the street map ({errs[:3]})")
        ctx.close()
        browser.close()
    httpd.shutdown()
    print(f"{passed} simulation checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
        sys.exit(1)
    print(f"screenshots in {OUT}")

if __name__ == "__main__":
    main()
