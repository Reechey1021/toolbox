// services/clips.js
// Uploading clips for the shared library: Cloudinary's free tier, straight from
// the browser with an unsigned upload preset (see config/clips-config.js).

import { clipHost } from "../config/clips-config.js";

export const clipHostReady = () => Boolean(clipHost?.cloudName && clipHost?.uploadPreset);

// Resolves to the clip's public URL. onProgress(0..1) while it uploads.
export function uploadClip(file, onProgress = () => {}) {
  if (!clipHostReady()) return Promise.reject(new Error("Clip hosting isn't set up yet (see SETUP.md)."));
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", clipHost.uploadPreset);
  if (clipHost.folder) form.append("folder", clipHost.folder);
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    // "auto" takes images and videos alike.
    x.open("POST", `https://api.cloudinary.com/v1_1/${clipHost.cloudName}/auto/upload`);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => {
      try {
        const res = JSON.parse(x.responseText);
        if (x.status >= 200 && x.status < 300 && res.secure_url) resolve(res.secure_url);
        else reject(new Error(res.error?.message || `Upload failed (${x.status})`));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    x.onerror = () => reject(new Error("Upload failed: check your connection."));
    x.send(form);
  });
}

// ---------------------------------------------------------------- downloading once
// Every shared clip is fetched once, kept in this browser's cache storage, and
// played from there: replays, reopening it and later visits cost no bandwidth.
const CACHE = "reech-cs2-clips-v1";
const inMemory = new Map(); // url -> object URL, for this visit

export async function cachedClipUrl(url) {
  if (inMemory.has(url)) return inMemory.get(url);
  try {
    const cache = "caches" in window ? await caches.open(CACHE) : null;
    let res = cache ? await cache.match(url) : null;
    if (!res) {
      res = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(String(res.status));
      if (cache) await cache.put(url, res.clone());
    }
    const local = URL.createObjectURL(await res.blob());
    inMemory.set(url, local);
    return local;
  } catch {
    return url; // can't cache it (no CORS, private mode): play it directly
  }
}

// Images or videos, by file type.
export const mediaOf = (file) => (String(file?.type || "").startsWith("image/") ? "image" : "video");
