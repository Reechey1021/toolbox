// services/wakelock.js
// Keeps the screen on the whole time the app is open, not just while riding.
// Uses the Screen Wake Lock API (Chrome on Android, Samsung Internet, Safari
// 16.4+). The browser drops the lock whenever the page is hidden, so it's taken
// again every time the page comes back. Where the API is missing or refuses,
// a tiny silent looping video does the same job (the trick NoSleep.js uses).
//
// What a web page can't do: stop the power button. If he presses it, the phone
// locks; the ride keeps its time, and the gap in GPS is bridged when he's back.

const WEBM = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAH9EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggHn7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiECfQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYjfAnehZ+YhGpyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhDuaygDgibCBELqBEJqBAhJUw2f8c3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY2MC4xNi4xMDBzc9ZjwItjxYjfAnehZ+YhGmfIoUWjh0VOQ09ERVJEh5RMYXZjNjAuMzEuMTAyIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDIuMDAwMDAwMDAwAB9DtnXD54EAo6OBAACAEAIAnQEqEAAQAABHCIWFiJmEiAICAAwNYAD+/6tQgKOZgQPoALEBAAEQEAAYADA/9AwAAAD+/6tQgBxTu2uRu4+zgQC3iveBAfGCAZ/wgQM=";
const VIDEO = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMrbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHNbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABeG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAThzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZHsBEAAADAAQAAAMACDxImSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAApAAAAKQAAAABhzdHRzAAAAAAAAAAEAAAACAABAAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAACAAAAAQAAABxzdHN6AAAAAAAAAAAAAAACAAAChgAAAAoAAAAUc3RjbwAAAAAAAAABAAADWwAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAACGZyZWUAAAKYbWRhdAAAAnAGBf//bNxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxMTEgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTEgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAOZYiEBb///w9FAAFPf4AAAAAGQZo4CvqA";

export function createWakeLock({ onChange }) {
  let sentinel = null;
  let video = null;
  let state = "off"; // "on" | "video" | "off"

  const set = (s) => { if (s !== state) { state = s; onChange?.(s); } };

  function startVideo() {
    if (!video) {
      video = document.createElement("video");
      video.setAttribute("playsinline", "");
      video.setAttribute("muted", "");
      video.muted = true;
      video.loop = true;
      // WebM for Chromium builds without H.264, MP4 for everything else
      for (const [src, type] of [[WEBM, "video/webm"], [VIDEO, "video/mp4"]]) {
        const so = document.createElement("source");
        so.src = src; so.type = type;
        video.appendChild(so);
      }
      Object.assign(video.style, { position: "fixed", width: "1px", height: "1px", opacity: "0.01", left: "0", bottom: "0", pointerEvents: "none" });
      video.setAttribute("aria-hidden", "true");
      document.body.appendChild(video);
    }
    return video.play().then(() => set("video")).catch(() => set("off"));
  }

  async function acquire() {
    if (document.visibilityState !== "visible") return;
    if (sentinel && !sentinel.released) { set("on"); return; }
    if ("wakeLock" in navigator) {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        sentinel.addEventListener("release", () => { sentinel = null; if (document.visibilityState === "visible") acquire(); else set("off"); });
        if (video) video.pause();
        set("on");
        return;
      } catch { /* refused (e.g. battery saver): fall back */ }
    }
    await startVideo();
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") acquire(); });
  // A tap is a user gesture, which some browsers need before they'll grant it.
  document.addEventListener("pointerdown", () => { if (state !== "on") acquire(); }, { capture: true, passive: true });

  return { acquire, get state() { return state; } };
}
