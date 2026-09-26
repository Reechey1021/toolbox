// screens/add.js
// Adding (or editing) a lineup: the clip, the tags, and where it's thrown from
// and lands on the map. Tags come from fixed lists; a callout that's missing can
// be added right here, so everyone reuses the same names.

import { h, replaceChildren } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { segmented, openSheet, toast } from "../ui/components.js";
import { navigate, currentQuery } from "../ui/router.js";
import { MAPS, mapById } from "../data/maps.js";
import { TYPES, SIDES, THROWS, PURPOSES } from "../data/tags.js";
import { parseGetpos, worldToRadar, levelFor, onRadar, suggestName, missingFor, areaRadius } from "../data/lineups.js";
import { prefs } from "../services/store.js";
import { getLineup, saveLineup, clipUrl, customCallouts, addCallout, saveTarget, canEdit } from "../services/library.js";
import { cloudAvailable } from "../services/cloud.js";
import { accountState, onAccount, signIn, setUpAccess } from "../services/account.js";
import { displayNickname } from "../services/playback.js";
import { createMapCanvas, pathLine, dot, svgEl } from "./parts/mapCanvas.js";
import { nadeBadge } from "./parts/nadeIcons.js";
import { createSpawnPanel } from "./parts/spawnPanel.js";

const NEW = "__new__";

// When the shared library is on, adding is for contributors only.
async function ready() {
  let a = accountState();
  if (a.status !== "loading") return a;
  return new Promise((resolve) => {
    const off = onAccount((s) => s.status !== "loading" && (off(), resolve(s)));
  });
}

function gate(a, editing) {
  const box = (title, text, ...actions) => ({
    el: h("main", { class: "page cs-page" }, h("header", { class: "cs-head" }, h("h1", { class: "cs-title" }, "Add a lineup")), h("section", { class: "addsec gate" }, h("h2", null, title), h("p", { class: "muted" }, text), h("div", { class: "btn-row" }, ...actions))),
    title: "Add a lineup",
  });
  if (!a.user)
    return box(
      "Sign in to add lineups",
      "Anyone can browse the library. Adding to it is for contributors, so sign in with Google first.",
      h("button", { class: "btn btn--primary", type: "button", onclick: () => signIn().catch((e) => toast(e.message, { tone: "bad" })) }, "Sign in with Google")
    );
  if (!a.access)
    return box(
      "Set up who can add lineups",
      "Nobody's set up access yet. If this is your library, set it up now and you'll be the admin: you choose who else can add lineups, in Settings.",
      h("button", { class: "btn btn--primary", type: "button", onclick: () => setUpAccess().then(() => navigate("/add", { replace: true })).catch(() => toast("Only the library's owner can set up access (see SETUP.md).", { tone: "bad", ms: 4200 })) }, "Set up access")
    );
  if (!a.contributor) return box("You're not a contributor yet", `Ask the library's owner to add ${a.user.email} as a contributor. Until then, you can browse, watch and keep favourites.`);
  if (editing && !canEdit(editing)) return box("Not yours to edit", "Only the person who added a lineup can change it.");
  return null;
}

export async function addScreen(params = {}) {
  const editing = params.id ? await getLineup(params.id) : null;
  // Only when accounts are actually reachable: offline, adding saves to this device.
  const acc = cloudAvailable() ? await ready() : null;
  if (acc && (acc.status === "guest" || acc.status === "signed-in")) {
    const blocked = gate(acc, editing);
    if (blocked) {
      const off = onAccount(() => navigate(location.hash.slice(1) || "/add", { replace: true }));
      return { ...blocked, destroy: off };
    }
  }
  const q = currentQuery();
  const l = editing
    ? { ...editing, purposes: [...(editing.purposes || [])], arc: [...(editing.arc || [])] }
    : { map: q.get("map") || prefs.get("lastMap", "de_mirage"), type: "smoke", side: "T", throw: "left", origin: "", dest: "", purposes: [], author: displayNickname() || prefs.get("author", ""), name: "", notes: "", from: null, to: null, arc: [], world: null, level: "upper", clip: null };
  let nameEdited = Boolean(editing?.name);
  let file = null;

  // ---------------------------------------------------------------- the clip
  const clipPreview = h("video", { class: "addclip__video", muted: true, loop: true, playsinline: true, controls: true, hidden: true });
  const imgPreview = h("img", { class: "addclip__video", alt: "", hidden: true });
  function showPreview(src, media) {
    clipPreview.hidden = media === "image";
    imgPreview.hidden = media !== "image";
    if (media === "image") {
      clipPreview.pause();
      imgPreview.src = src;
    } else {
      clipPreview.src = src;
      clipPreview.play().catch(() => {});
    }
  }
  const clipNote = h("p", { class: "muted addclip__note" });
  const fileInput = h("input", {
    type: "file",
    accept: "video/*,image/*",
    class: "addclip__input",
    "aria-label": "Choose an image or video",
    onchange: (e) => {
      file = e.target.files?.[0] ?? null;
      if (!file) return;
      showPreview(URL.createObjectURL(file), file.type.startsWith("image/") ? "image" : "video");
      clipNote.textContent = `${file.name}, ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    },
  });
  if (editing?.clip) {
    clipUrl(editing.clip).then((u) => u && showPreview(u, editing.clip.media ?? "video"));
    clipNote.textContent = "Keeping the current one unless you choose a new image or video.";
  }

  // ---------------------------------------------------------------- tags
  const nameInput = h("input", { class: "field", type: "text", maxlength: 80, placeholder: "Suggested from the tags", value: l.name, "aria-label": "Name", oninput: (e) => ((l.name = e.target.value), (nameEdited = Boolean(e.target.value))) });
  function suggest() {
    if (nameEdited) return;
    l.name = suggestName(l);
    nameInput.value = l.name;
  }

  const originWrap = h("div");
  const destWrap = h("div");
  async function calloutSelect(key, label) {
    const map = mapById(l.map);
    const custom = (await customCallouts(l.map)).map((c) => c.name);
    const names = [...new Set([...map.callouts, ...custom])].sort((a, b) => a.localeCompare(b));
    if (l[key] && !names.includes(l[key])) names.push(l[key]);
    return h(
      "select",
      {
        class: "field select",
        "aria-label": label,
        onchange: async (e) => {
          if (e.target.value === NEW) {
            const name = await askCallout(map.name);
            if (name) {
              await addCallout(l.map, name, l.author);
              l[key] = name;
              suggest(); // the new callout belongs in the suggested name too
            }
            return renderCallouts();
          }
          l[key] = e.target.value;
          suggest();
        },
      },
      h("option", { value: "" }, "Choose…"),
      names.map((n) => h("option", { value: n, selected: l[key] === n }, n)),
      h("option", { value: NEW }, "Add a new callout…")
    );
  }
  async function renderCallouts() {
    replaceChildren(originWrap, await calloutSelect("origin", "Thrown from"));
    replaceChildren(destWrap, await calloutSelect("dest", "Lands at"));
  }

  function askCallout(mapName) {
    const input = h("input", { class: "field", type: "text", maxlength: 40, placeholder: "e.g. Tetris", "aria-label": "New callout" });
    return new Promise((resolve) => {
      const sheet = openSheet({
        title: `New callout on ${mapName}`,
        lead: "Check the list first: using the same names keeps the library easy to search.",
        body: input,
        actions: [h("button", { class: "btn btn--primary btn--block", type: "button", onclick: () => sheet.close(input.value.trim() || null) }, "Add callout")],
      });
      input.addEventListener("keydown", (e) => e.key === "Enter" && sheet.close(input.value.trim() || null));
      setTimeout(() => input.focus(), 200);
      sheet.closed.then(resolve);
    });
  }

  // Purpose: one per lineup, from the list (stored as purposes: [id] so more can come later).
  const purposeSel = h(
    "select",
    {
      class: "field select",
      "aria-label": "Purpose",
      onchange: (e) => {
        l.purposes = e.target.value ? [e.target.value] : [];
        if (!l.purposes.includes("instant")) l.spawn = null;
        renderSpawnPick();
        suggest();
      },
    },
    h("option", { value: "" }, "None"),
    PURPOSES.map((p) => h("option", { value: p.id, selected: l.purposes[0] === p.id }, p.name))
  );

  // ---------------------------------------------------------------- the map, in three steps
  // 1 Throw spot (getpos or a tap), 2 Landing (getpos or a tap), 3 Bounces (optional).
  // Each step unlocks once the one before it is done.
  const STEPS = [
    { key: "from", title: "Throw spot", tap: "Tap where it's thrown from, or paste getpos from that spot.", getpos: true },
    { key: "to", title: "Landing", tap: "Tap where it lands.", getpos: false },
    { key: "arc", title: "Bounces", tap: "Optional: tap each bounce in order. Clear them to start again.", getpos: false },
  ];
  let step = 0;

  // Instant (from spawn): the throw spot is a numbered spawn.
  const spawnWrap = h("div", { class: "addspawn" });
  let spawnPick = null;
  function renderSpawnPick() {
    spawnPick?.destroy();
    spawnPick = null;
    if (!l.purposes.includes("instant")) return replaceChildren(spawnWrap);
    if (l.side !== "T" && l.side !== "CT") return replaceChildren(spawnWrap, h("p", { class: "stepbody__note" }, "Instant lineups are thrown from a spawn: pick T or CT as the side to choose which one."));
    spawnPick = createSpawnPanel(mapById(l.map), l.side, {
      selected: l.spawn,
      onPick: (n, sp) => {
        l.spawn = n;
        l.from = { x: sp.x, y: sp.y };
        l.world = sp.world ?? null;
        if (!l.origin) l.origin = `${l.side} Spawn`;
        renderCallouts();
        suggest();
        step = 1;
        renderMarks();
        renderStep();
      },
    });
    replaceChildren(spawnWrap, spawnPick.el);
  }
  const map0 = mapById(l.map);
  const canvas = createMapCanvas({ radar: l.level === "lower" && map0.lowerRadar ? map0.lowerRadar : map0.radar, label: "Place the lineup", onTap: (pos) => place(pos) });
  const stepper = h("div", { class: "stepper3" });
  const stepBody = h("div", { class: "stepbody" });
  const levelWrap = h("div");
  const unlocked = (i) => i === 0 || (i === 1 && onRadar(l.from)) || (i === 2 && onRadar(l.from) && onRadar(l.to));

  function place(pos) {
    if (!onRadar(pos)) return;
    const key = STEPS[step].key;
    if (key === "from") {
      l.from = pos;
      l.world = null; // placed by hand now
    } else if (key === "to") {
      l.to = pos;
      l.worldTo = null;
    } else l.arc = [...l.arc, pos];
    renderMarks();
    renderStep();
  }

  // As on the library map: the grenade's icon where it's thrown, its area (to scale) where it lands.
  function renderMarks() {
    const colour = TYPES.find((t) => t.id === l.type)?.colour ?? "#fff";
    const pts = [l.from, ...l.arc, l.to].filter(Boolean);
    const r = l.to ? areaRadius(mapById(l.map), l) : 0;
    canvas.layers.lines.replaceChildren(
      ...(r ? [svgEl("circle", { cx: l.to.x * 1000, cy: l.to.y * 1000, r, class: `mark mark--to lu-area lu-area--${l.type} is-focus`, fill: colour, stroke: colour, "data-w": 2 })] : []),
      ...(pts.length > 1 ? [pathLine(pts, "lu-path is-focus", 3)] : [])
    );
    canvas.layers.marks.replaceChildren(
      ...l.arc.map((p) => dot(p, "mark mark--arc", 5)),
      ...(l.to && !r ? [dot(l.to, "mark mark--to", 9, { stroke: colour })] : []),
      ...(l.from ? [nadeBadge(l.type, l.from, { cls: "mark mark--from" })] : [])
    );
    canvas.refresh();
  }

  function applyGetpos(text, note) {
    // getpos is for the throw spot only (paste and change can both fire: act once).
    if (STEPS[step].key !== "from") return;
    const g = parseGetpos(text);
    if (!g) return (note.textContent = "That doesn't look like getpos output. It starts with \u201csetpos\u201d.");
    const map = mapById(l.map);
    const pos = worldToRadar(map, g);
    if (!onRadar(pos)) return (note.textContent = "That position is off this map's radar. Right map?");
    if (STEPS[step].key === "from") {
      l.world = g;
      l.from = pos;
      l.level = levelFor(map, g.z);
      canvas.setRadar(l.level === "lower" && map.lowerRadar ? map.lowerRadar : map.radar);
      renderLevel();
      step = 1; // exact spot in: straight on to the landing
    } else {
      l.worldTo = g;
      l.to = pos;
      step = 2;
    }
    renderMarks();
    renderStep();
  }

  function renderStep() {
    const s = STEPS[step];
    const done = [onRadar(l.from), onRadar(l.to), l.arc.length > 0];
    replaceChildren(
      stepper,
      h("button", { class: "icon-btn stepper3__arrow", type: "button", "aria-label": "Previous step", disabled: step === 0, onclick: () => ((step = Math.max(0, step - 1)), renderStep()) }, icon("back")),
      h(
        "ol",
        { class: "stepper3__steps" },
        STEPS.map((st, i) =>
          h(
            "li",
            null,
            h(
              "button",
              { type: "button", class: ["stepper3__step", i === step && "is-on", done[i] && "is-done"], disabled: !unlocked(i), "aria-current": i === step ? "step" : null, onclick: () => ((step = i), renderStep()) },
              h("span", { class: "stepper3__num num" }, done[i] && i !== step ? icon("check", { size: 14 }) : i + 1),
              h("span", { class: "stepper3__label" }, st.title)
            )
          )
        )
      ),
      h("button", { class: "icon-btn stepper3__arrow stepper3__next", type: "button", "aria-label": "Next step", disabled: step === 2 || !unlocked(step + 1), onclick: () => ((step = Math.min(2, step + 1)), renderStep()) }, icon("chevron"))
    );
    const note = h("p", { class: "stepbody__note muted" });
    const exact = s.key === "from" ? l.world : s.key === "to" ? l.worldTo : null;
    if (exact) note.textContent = mapById(l.map).overview.verified ? "Placed exactly from getpos." : "Placed from getpos. (This map's overview numbers aren't verified yet: check it looks right.)";
    const input = s.getpos
      ? h("input", {
          class: "field stepbody__getpos",
          type: "text",
          placeholder: "setpos … ;setang …",
          "aria-label": `Paste getpos for the ${s.title.toLowerCase()}`,
          onchange: (e) => applyGetpos(e.target.value, note),
          onpaste: (e) => setTimeout(() => applyGetpos(e.target.value, note), 0),
        })
      : null;
    replaceChildren(
      stepBody,
      h("p", { class: "stepbody__hint" }, s.tap),
      input ? h("div", { class: "stepbody__row" }, h("span", { class: "stepbody__label" }, "getpos"), input) : null,
      note,
      s.key === "arc" && l.arc.length ? h("button", { class: "btn btn--quiet stepbody__clear", type: "button", onclick: () => ((l.arc = []), renderMarks(), renderStep()) }, "Clear bounces") : null
    );
  }

  function renderLevel() {
    const map = mapById(l.map);
    replaceChildren(
      levelWrap,
      map.lowerRadar
        ? segmented({
            label: "Level",
            value: l.level,
            options: [
              { value: "upper", label: "Upper" },
              { value: "lower", label: "Lower" },
            ],
            onChange: (v) => ((l.level = v), canvas.setRadar(v === "lower" ? map.lowerRadar : map.radar)),
          })
        : null
    );
  }

  // ---------------------------------------------------------------- choosing things
  const typeSeg = segmented({ label: "Grenade", value: l.type, options: TYPES.map((t) => ({ value: t.id, label: t.name })), className: "seg--wrap seg--nades", onChange: (v) => ((l.type = v), suggest(), renderMarks()) });
  const sideSeg = segmented({ label: "Side", value: l.side, options: SIDES.map((s) => ({ value: s.id, label: s.name })), onChange: (v) => ((l.side = v), (l.spawn = null), renderSpawnPick(), renderMarks()) });
  const throwSel = h("select", { class: "field select", "aria-label": "Throw", onchange: (e) => (l.throw = e.target.value) }, THROWS.map((t) => h("option", { value: t.id, selected: l.throw === t.id }, t.name)));
  const mapSel = h(
    "select",
    {
      class: "field select",
      "aria-label": "Map",
      onchange: async (e) => {
        l.map = e.target.value;
        l.origin = l.dest = "";
        l.from = l.to = null;
        l.arc = [];
        l.world = l.worldTo = null;
        l.level = "upper";
        step = 0;
        l.spawn = null;
        renderSpawnPick();
        canvas.setRadar(mapById(l.map).radar);
        canvas.reset();
        suggest();
        renderLevel();
        renderMarks();
        renderStep();
        await renderCallouts();
      },
    },
    MAPS.map((m) => h("option", { value: m.id, selected: l.map === m.id }, m.name))
  );
  const authorInput = h("input", { class: "field", type: "text", maxlength: 24, placeholder: displayNickname() || "e.g. Reech", value: l.author, "aria-label": "Author", oninput: (e) => (l.author = e.target.value.trim()) });
  const notesInput = h("textarea", { class: "field addnotes", rows: 3, maxlength: 400, placeholder: "Anything that helps, like where to aim.", "aria-label": "Notes", oninput: (e) => (l.notes = e.target.value) }, l.notes || "");

  async function save() {
    const missing = missingFor(l);
    if (!file && !l.clip) missing.unshift("an image or video");
    if (missing.length) return toast(`Still needed: ${missing.join(", ")}.`, { tone: "bad", ms: 4200 });
    const btn = saveBtn;
    btn.disabled = true;
    try {
      if (!l.name) l.name = suggestName(l) || "Untitled lineup";
      prefs.set("author", l.author);
      prefs.set("lastMap", l.map);
      const target = saveTarget();
      const rec = await saveLineup(l, { file, onProgress: (p) => (btn.textContent = `Uploading the clip\u2026 ${Math.round(p * 100)}%`) });
      if (rec.source === "shared") toast(editing ? "Lineup updated" : "Added to the shared library", { tone: "ok" });
      else if (target.reason === "no-clip-host") toast("Saved on this device. Set up clip hosting to share it (see SETUP.md).", { tone: "ok", ms: 4200 });
      else toast(editing ? "Lineup updated" : "Lineup saved", { tone: "ok" });
      navigate(`/library/${rec.map}`);
    } catch (err) {
      toast(err.message || "Couldn't save that", { tone: "bad" });
      btn.disabled = false;
      btn.textContent = editing ? "Save changes" : "Save lineup";
    }
  }
  const saveBtn = h("button", { class: "btn btn--primary btn--block", type: "button", onclick: save }, editing ? "Save changes" : "Save lineup");

  // A plain container, not a <label>: a label around several buttons forwards every click to the first one.
  const field = (label, control, hint = null) => h("div", { class: "addfield" }, h("span", { class: "addfield__label" }, label), control, hint ? h("span", { class: "addfield__hint muted" }, hint) : null);

  await renderCallouts();
  renderLevel();
  renderMarks();
  renderStep();
  renderSpawnPick();
  suggest();

  const el = h(
    "main",
    { class: "page cs-page addpage" },
    h("header", { class: "cs-head" }, h("h1", { class: "cs-title" }, editing ? "Edit lineup" : "Add a lineup"), h("p", { class: "muted" }, "Clip, tags, then mark it on the map.")),
    h(
      "div",
      { class: "addgrid" },
      h(
        "div",
        { class: "addform" },
        h("section", { class: "addsec" }, h("h2", { class: "addsec__title" }, "Image or video"), h("label", { class: "addclip" }, icon("upload"), h("span", null, editing?.clip ? "Choose a different image or video" : "Choose an image or video"), fileInput), clipNote, clipPreview, imgPreview),
        h(
          "section",
          { class: "addsec" },
          h("h2", { class: "addsec__title" }, "Tags"),
          field("Map", mapSel),
          field("Grenade", typeSeg),
          field("Side", sideSeg),
          field("Throw", throwSel),
          field("Thrown from", originWrap),
          field("Lands at", destWrap),
          field("Purpose", purposeSel),
          field("Author", authorInput),
          field("Name", nameInput, "Suggested from the tags. Change it if you like."),
          field("Notes", notesInput)
        )
      ),
      h(
        "div",
        { class: "addmap" },
        h(
          "section",
          { class: "addsec" },
          h("h2", { class: "addsec__title" }, "On the map"),
          spawnWrap,
          stepper,
          stepBody,
          levelWrap,
          h("div", { class: "addmap__canvas" }, canvas.el),
          h("div", { class: "btn-row" }, h("button", { class: "btn btn--quiet", type: "button", onclick: () => canvas.reset() }, "Reset zoom"))
        )
      )
    ),
    h("div", { class: "addsave" }, saveBtn)
  );
  return { el, title: editing ? "Edit lineup" : "Add a lineup" };
}
