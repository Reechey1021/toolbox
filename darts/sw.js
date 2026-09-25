// sw.js
// Offline support.
//   App files: network first, so a new version shows up as soon as you're online,
//              falling back to the cached copy when there's no signal.
//   Audio:     cache first, since the clips never change.
// The page tells the worker which files it loaded (see main.js), so there's no
// file list to keep up to date here.

const CACHE_VERSION = "v5.1.0";
const APP_CACHE = `darts-app-${CACHE_VERSION}`;
const AUDIO_CACHE = "darts-audio-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest"]).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("darts-app-") && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    caches.open(APP_CACHE).then((c) =>
      Promise.all(
        event.data.urls.map((u) =>
          fetch(u, { cache: "no-cache" })
            .then((res) => res.ok && c.put(u, res))
            .catch(() => {})
        )
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/audio/")) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match("./index.html")) || Response.error())
  );
});
