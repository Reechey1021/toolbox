// screens/player.js
// Watching a lineup: the clip nearly full screen, and a magnifier in the corner
// showing the middle of the same video, where the crosshair is. The magnifier
// is drawn from the playing video every frame, so it's always in perfect sync
// and nothing is loaded twice.
//
// Your playback settings (services/playback.js) decide the speed, the
// magnification, and how many plays before it closes by itself, so you never
// need to tab out of the game: "lineup, close" works any time too.

import { h, replaceChildren } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { confirm, toast, segmented } from "../ui/components.js";
import { tagLabels } from "../data/lineups.js";
import { typeById } from "../data/tags.js";
import { clipUrl, deleteLineup, canEdit, canDelete } from "../services/library.js";
import { accountState, isFavourite, toggleFavourite, customName, setCustomName } from "../services/account.js";
import { itemName } from "../data/lineups.js";
import { playback, setPlayback, savedWhere } from "../services/playback.js";

// The clip that's open, if any (voice controls act on it).
let current = null;
export const activePlayer = () => current;

const SPEEDS = [1, 0.5, 0.25];
const PLAYS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 0, label: "Keep playing" },
];

export async function openPlayer(l) {
  current?.close();
  const url = await clipUrl(l.clip);
  const isImage = l.clip?.media === "image";
  let { speed, zoom, autoClose } = playback();
  let plays = 0;
  let raf = null;
  let imageTimer = null;
  const IMAGE_PLAY_MS = 5000; // for "close after N plays", an image counts 5 seconds a play
  const img = isImage ? h("img", { class: "player__video player__img", src: url || undefined, alt: l.name }) : null;

  const video = h("video", { class: "player__video", src: !isImage && url ? url : undefined, autoplay: true, muted: true, playsinline: true });
  video.muted = true;
  video.loop = !autoClose;
  video.playbackRate = speed;
  const mag = h("canvas", { class: "player__mag", width: 480, height: 270, "aria-hidden": "true" });
  const magLabel = h("span", { class: "player__maglabel" });
  const ctx = mag.getContext("2d");
  const countdown = h("span", { class: "player__count", "aria-live": "polite" });

  // The magnifier: the middle of the frame, scaled up by `zoom` relative to the main video.
  function drawMag() {
    const src = isImage ? img : video;
    const vw = isImage ? img.naturalWidth : video.videoWidth;
    const vh = isImage ? img.naturalHeight : video.videoHeight;
    if (vw && vh && (isImage ? img.complete : video.readyState >= 2)) {
      const shown = src.getBoundingClientRect();
      const scale = Math.min(shown.width / vw, shown.height / vh) || 1;
      const cw = mag.clientWidth || mag.width;
      const sw = cw / (scale * zoom);
      const sh = sw * (mag.height / mag.width);
      ctx.drawImage(src, vw / 2 - sw / 2, vh / 2 - sh / 2, sw, sh, 0, 0, mag.width, mag.height);
    }
    magLabel.textContent = `\u00d7${zoom}`;
    if (isImage) return; // a still: redrawn when it loads and when the zoom changes
    raf = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(drawMag) : requestAnimationFrame(drawMag);
  }
  img?.addEventListener("load", () => {
    mag.height = Math.round(mag.width * (img.naturalHeight / img.naturalWidth || 9 / 16));
    drawMag();
  });
  video.addEventListener("loadeddata", () => {
    mag.height = Math.round(mag.width * (video.videoHeight / video.videoWidth || 9 / 16));
    drawMag();
  });

  // Auto-close: count the plays, close after the last one.
  function paintCount() {
    if (isImage) return; // images show their own seconds countdown
    countdown.textContent = autoClose ? (autoClose - plays <= 1 ? "Closes after this play" : `Closes after ${autoClose - plays} more plays`) : "";
  }
  // Images: "close after N plays" is N x 5 seconds.
  function startImageTimer() {
    clearInterval(imageTimer);
    countdown.textContent = "";
    if (!isImage || !autoClose) return;
    let left = Math.round((autoClose * IMAGE_PLAY_MS) / 1000);
    countdown.textContent = `Closes in ${left}s`;
    imageTimer = setInterval(() => {
      left--;
      if (left <= 0) return close();
      countdown.textContent = `Closes in ${left}s`;
    }, 1000);
  }
  video.addEventListener("ended", () => {
    plays++;
    if (autoClose && plays >= autoClose) return close();
    video.currentTime = 0;
    video.play().catch(() => {});
    paintCount();
  });

  // Quick controls: these also become your saved settings.
  const playBtn = h("button", { class: "btn btn--quiet player__btn", type: "button", onclick: () => (video.paused ? video.play() : video.pause()) });
  const speedBtn = h("button", { class: "btn btn--quiet player__btn", type: "button", onclick: () => applySpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]) });
  const zoomBtn = h("button", { class: "btn btn--quiet player__btn", type: "button", onclick: () => applyZoom(zoom >= 5 ? 2 : zoom + 1) });
  const cogBtn = h("button", { class: "btn btn--quiet player__btn player__cog", type: "button", "aria-label": "Playback settings", "aria-expanded": "false", onclick: () => toggleSettings() }, icon("sliders", { size: 18 }));
  function applySpeed(v) {
    speed = v;
    video.playbackRate = v;
    setPlayback({ speed: v });
    paint();
  }
  function applyZoom(v) {
    zoom = v;
    setPlayback({ zoom: v });
    paint();
    if (isImage) drawMag();
  }
  function applyAutoClose(v) {
    autoClose = v;
    plays = 0;
    video.loop = !v;
    setPlayback({ autoClose: v });
    startImageTimer();
    paint();
  }
  function paint() {
    replaceChildren(playBtn, icon(video.paused ? "play" : "pause", { size: 18 }), h("span", { class: "btn__label" }, video.paused ? "Play" : "Pause"));
    replaceChildren(speedBtn, h("span", { class: "btn__label" }, `Speed ${speed}\u00d7`));
    replaceChildren(zoomBtn, icon("zoom", { size: 18 }), h("span", { class: "btn__label" }, `Magnify \u00d7${zoom}`));
    paintCount();
    if (!settings.hidden) renderSettings();
  }
  video.addEventListener("play", paint);
  video.addEventListener("pause", paint);

  // The settings panel behind the cog.
  const settings = h("div", { class: "player__settings", hidden: true, role: "group", "aria-label": "Playback settings" });
  function renderSettings() {
    replaceChildren(
      settings,
      h("div", { class: "pset__row" }, h("span", { class: "pset__label" }, "Speed"), segmented({ label: "Speed", value: speed, options: SPEEDS.map((v) => ({ value: v, label: `${v}\u00d7` })), onChange: applySpeed })),
      h("div", { class: "pset__row" }, h("span", { class: "pset__label" }, "Magnify"), segmented({ label: "Magnify", value: zoom, options: [2, 3, 4, 5].map((v) => ({ value: v, label: `\u00d7${v}` })), onChange: applyZoom })),
      h("div", { class: "pset__row" }, h("span", { class: "pset__label" }, "Close after"), segmented({ label: "Close after", value: autoClose, options: PLAYS, className: "seg--wrap", onChange: applyAutoClose })),
      h("p", { class: "pset__note" }, "\u201cLineup, close\u201d closes it any time."),
      h("p", { class: "pset__saved" }, savedWhere() === "account" ? "Saved to your account, on every device." : "Saved on this device. Sign in to keep them everywhere.")
    );
  }
  function toggleSettings() {
    settings.hidden = !settings.hidden;
    cogBtn.setAttribute("aria-expanded", String(!settings.hidden));
    if (!settings.hidden) renderSettings();
  }

  const favBtn = h("button", { class: "btn btn--quiet player__btn player__fav", type: "button" });
  const paintFav = () => {
    const on = isFavourite(l.id);
    favBtn.setAttribute("aria-pressed", String(on));
    favBtn.textContent = on ? "\u2605 Favourite" : "\u2606 Favourite";
  };
  favBtn.addEventListener("click", async () => {
    try {
      await toggleFavourite(l.id);
      paintFav();
    } catch (err) {
      toast(err.message, { tone: "bad" });
    }
  });
  paintFav();

  // Your own name for it (any lineup, favourite or not). One per map and side.
  const nameInput = h("input", { class: "field player__cname", type: "text", maxlength: 40, placeholder: "Custom name", value: customName(l.id), "aria-label": "Custom name" });
  const saveName = async () => {
    if (nameInput.value.trim() === customName(l.id)) return;
    try {
      const n = await setCustomName(l, nameInput.value);
      toast(n ? `Named \u201c${n}\u201d: say it to open this one` : "Custom name removed", { tone: "ok" });
    } catch (err) {
      toast(err.message, { tone: "bad", ms: 4200 });
      nameInput.value = customName(l.id);
    }
  };
  nameInput.addEventListener("change", saveName);
  nameInput.addEventListener("keydown", (e) => (e.stopPropagation(), e.key === "Enter" && nameInput.blur()));

  // A group: which utility lands where, in the order they're thrown.
  const strip =
    l.type === "group" && (l.items || []).length
      ? h(
          "ol",
          { class: "player__strip", "aria-label": "In this clip" },
          l.items.map((it, i) => h("li", { class: "player__stripitem", style: { "--c": typeById(it.type)?.colour } }, h("span", { class: "player__stripn num" }, i + 1), itemName(it)))
        )
      : null;

  const setpos = l.world ? `setpos ${l.world.x} ${l.world.y} ${l.world.z}${l.world.pitch !== null ? `;setang ${l.world.pitch} ${l.world.yaw} 0` : ""}` : null;
  const layer = h(
    "div",
    { class: "player", role: "dialog", "aria-modal": "true", "aria-label": l.name },
    h(
      "div",
      { class: "player__box" },
      h(
        "header",
        { class: "player__head" },
        h("span", { class: "player__type", style: { background: typeById(l.type)?.colour } }),
        h("div", { class: "player__titles" }, h("h2", { class: "player__name" }, l.name || "Untitled"), h("p", { class: "player__tags" }, `${tagLabels(l).join(" \u00b7 ")} \u00b7 ${l.origin} \u2192 ${l.dest}${l.author ? ` \u00b7 by ${l.author}` : ""}`)),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: () => close() }, icon("close"))
      ),
      h(
        "div",
        { class: "player__stage" },
        strip,
        url ? (isImage ? img : video) : h("div", { class: "player__noclip" }, h("p", null, "No clip for this lineup yet."), canEdit(l) ? h("a", { class: "btn btn--quiet", href: `#/add/${l.id}` }, "Add one") : null),
        url ? h("div", { class: "player__magwrap" }, mag, magLabel) : null,
        settings // floats over the clip, so the window never grows past the screen
      ),
      l.notes ? h("p", { class: "player__notes" }, l.notes) : null,
      h(
        "footer",
        { class: "player__foot" },
        url ? (isImage ? [zoomBtn, cogBtn] : [playBtn, speedBtn, zoomBtn, cogBtn]) : null,
        countdown,
        setpos
          ? h(
              "button",
              {
                class: "btn btn--quiet player__btn",
                type: "button",
                title: setpos,
                onclick: async () => {
                  try {
                    await navigator.clipboard.writeText(setpos);
                    toast("setpos copied: paste it in the console on a practice server", { tone: "ok" });
                  } catch {
                    toast(setpos);
                  }
                },
              },
              icon("copy", { size: 18 }),
              h("span", { class: "btn__label" }, "Copy setpos")
            )
          : null,
        h("span", { class: "player__spacer" }),
        accountState().user ? nameInput : null,
        accountState().user ? favBtn : null,
        canEdit(l) ? h("a", { class: "btn btn--quiet player__btn", href: `#/add/${l.id}`, onclick: () => close() }, icon("edit", { size: 18 }), h("span", { class: "btn__label" }, "Edit")) : null,
        canDelete(l)
          ? h(
              "button",
              {
                class: "btn btn--ghost player__btn player__del",
                type: "button",
                "aria-label": "Delete this lineup",
                onclick: async () => {
                  const others = l.source === "shared" && l.authorUid !== accountState().user?.uid;
                  const lead = others ? `This is ${l.author || "someone else"}'s lineup: as admin you can remove it for everyone.` : l.source === "shared" ? "It's removed from the shared library for everyone." : "Its clip is deleted too.";
                  if (!(await confirm({ title: "Delete this lineup?", lead, confirmLabel: "Delete", tone: "danger" }))) return;
                  try {
                    await deleteLineup(l);
                    close();
                    toast("Lineup deleted");
                  } catch (err) {
                    toast(err.message || "Couldn't delete that", { tone: "bad" });
                  }
                },
              },
              icon("trash", { size: 18 })
            )
          : null
      )
    )
  );
  paint();
  startImageTimer();

  function onKey(e) {
    if (e.key === "Escape") close();
    if (e.key === " " && url && !isImage) (e.preventDefault(), video.paused ? video.play() : video.pause());
  }
  function close() {
    if (current?.layer === layer) current = null;
    document.removeEventListener("keydown", onKey);
    clearInterval(imageTimer);
    if (raf !== null) video.cancelVideoFrameCallback ? video.cancelVideoFrameCallback(raf) : cancelAnimationFrame(raf);
    // Fully unload it: nothing keeps playing or downloading once it's closed.
    video.pause();
    video.removeAttribute("src");
    video.load();
    layer.remove();
  }
  layer.addEventListener("click", (e) => e.target === layer && close());
  document.addEventListener("keydown", onKey);
  document.body.append(layer);
  current = {
    lineup: l,
    layer,
    close,
    replay: () => (isImage ? startImageTimer() : ((plays = 0), (video.currentTime = 0), video.play().catch(() => {}), paintCount())),
    setSpeed: (v) => applySpeed(v),
  };
  return current;
}
