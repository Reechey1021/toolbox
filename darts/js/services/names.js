// services/names.js
// The caller's name recordings: every MP3 in darts/audio/names. Drop a file in
// (e.g. "Dave.mp3") and "Dave" appears in the announcer list, and a player
// called Dave gets his name called.
//
// Websites can't normally list a folder, so this tries, in order:
//   1. the folder listing, which local servers such as Live Server provide
//   2. GitHub's public API, when running on a github.io site
//   3. the names it already knows (the last list found, or the built-in four)
// The list is remembered, and refreshed at most once an hour.

import { kv } from "./storage.js";

const BASE = new URL("../../audio/names/", import.meta.url);
const KEY = "callerNames";
const REFRESH_MS = 60 * 60 * 1000;
const BUILT_IN = ["Kameron", "Marie", "Richard", "Rookie"];

const fromFile = (file) => decodeURIComponent(file.split("/").pop()).replace(/\.mp3$/i, "");
const tidy = (list) => [...new Set(list.map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// The names we know right now (never waits on the network).
export function callerNames() {
  return kv.get(KEY, null)?.names ?? BUILT_IN;
}

// The exact file name for a player's name, matching case-insensitively, or null.
export function recordingFor(name) {
  const want = String(name || "").trim().toLowerCase();
  if (!want) return null;
  return callerNames().find((n) => n.toLowerCase() === want) ?? null;
}

export function recordingUrl(name) {
  return new URL(`${encodeURIComponent(name)}.mp3`, BASE).href;
}

// 1. A server folder listing (an HTML page of links).
async function fromListing() {
  const res = await fetch(BASE.href, { cache: "no-store" });
  if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) return null;
  const html = await res.text();
  const files = [...html.matchAll(/href="([^"]+\.mp3)"/gi)].map((m) => fromFile(m[1]));
  return files.length ? files : null;
}

// 2. GitHub's API, for a site at <owner>.github.io/<repo>/.../darts/
async function fromGitHub() {
  if (!location.hostname.endsWith(".github.io")) return null;
  const owner = location.hostname.split(".")[0];
  const parts = location.pathname.split("/").filter(Boolean);
  const darts = parts.indexOf("darts");
  if (darts < 0) return null;
  // A project site has the repo name first; a user site (<owner>.github.io repo) doesn't.
  const repo = darts > 0 ? parts[0] : `${owner}.github.io`;
  const inRepo = [...parts.slice(darts > 0 ? 1 : 0, darts + 1), "audio", "names"].join("/");
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${inRepo}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const list = await res.json();
  if (!Array.isArray(list)) return null;
  const files = list.filter((f) => f.type === "file" && /\.mp3$/i.test(f.name)).map((f) => fromFile(f.name));
  return files.length ? files : null;
}

let pending = null;

// Refresh the list from the folder. Resolves to the names (or the known ones if nothing answered).
export function discoverNames({ force = false } = {}) {
  const cached = kv.get(KEY, null);
  if (!force && cached && Date.now() - cached.at < REFRESH_MS) return Promise.resolve(cached.names);
  if (pending) return pending;
  pending = (async () => {
    for (const source of [fromListing, fromGitHub]) {
      try {
        const found = await source();
        if (found) {
          const names = tidy(found);
          kv.set(KEY, { names, at: Date.now() });
          return names;
        }
      } catch {
        /* try the next way */
      }
    }
    return callerNames();
  })().finally(() => (pending = null));
  return pending;
}
