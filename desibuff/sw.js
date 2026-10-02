// sw.js
// Offline support, so a ride never depends on mobile signal.
//   App files:  network first (a new version shows up as soon as you're online),
//               falling back to the cached copy when there's no signal.
//   Fonts: cache first, since they don't change.
//   Map tiles: network first, cached copy when offline.
// Bump VERSION when files are added or renamed.

const VERSION = "desibuff-1.0.1";
const APP = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/main.js", "./js/ui/dom.js", "./js/ui/layers.js", "./js/ui/map.js", "./js/ui/charts.js",
  "./js/engine/geo.js", "./js/engine/ride.js", "./js/engine/sectors.js", "./js/engine/format.js",
  "./js/data/repo.js", "./js/data/backup.js", "./js/data/defaults.js", "./js/data/store.js",
  "./js/services/gps.js", "./js/services/hr.js", "./js/services/wakelock.js", "./js/services/voice.js",
  "./js/screens/ride.js", "./js/screens/courses.js", "./js/screens/profile.js", "./js/screens/sheets.js",
  "./icons/icon.svg", "./icons/icon-180.png", "./icons/icon-192.png",
];
const ASSETS = "desibuff-assets-2"; // new name drops the old CARTO "API key required" tiles
const MAX_TILES = 1500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("desibuff-") && k !== VERSION && k !== ASSETS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname === "tile.openstreetmap.org") {
    // Map tiles: from the network (the browser's own cache follows OSM's headers),
    // falling back to our copy when there's no signal.
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(ASSETS).then((c) => { c.put(e.request, copy); trim(c); }); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || Response.error())));
    return;
  }
  const isAsset = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (isAsset) {
    e.respondWith(caches.open(ASSETS).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === "opaque") { cache.put(e.request, res.clone()); trim(cache); }
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin || !url.pathname.includes("/desibuff/")) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html"))));
});
