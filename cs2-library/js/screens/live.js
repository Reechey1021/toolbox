// screens/live.js
// Live game: parked for now. Voice requests come first; the game connection
// is optional and only ever listens.

import { h } from "../ui/dom.js";

export function liveScreen() {
  return {
    el: h(
      "main",
      { class: "page cs-page cs-prose" },
      h("header", { class: "cs-head" }, h("h1", { class: "cs-title" }, "Live game"), h("p", { class: "muted" }, "Coming later.")),
      h("h2", null, "Voice requests"),
      h("p", null, "Say the wake word and what you need, like \u201cmirage window smoke from T spawn\u201d, and the clip plays. Built on the darts voice engine, using your lineups' tags."),
      h("h2", null, "Game connection (optional)"),
      h("p", null, "CS2 has an official Game State Integration feature: with one text file in its cfg folder, the game itself sends your map, side and score to a small listener on your PC. Nothing reads or changes the game. It's parked until you decide you want it.")
    ),
    title: "Live game",
  };
}
