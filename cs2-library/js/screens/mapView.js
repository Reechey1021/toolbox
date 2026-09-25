// screens/mapView.js
// One map: its name, zoom buttons, Add, and the map panel (parts/mapPanel.js)
// with every lineup.

import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { mapById } from "../data/maps.js";
import { createMapPanel } from "./parts/mapPanel.js";
import { choose } from "../ui/components.js";
import { navigate } from "../ui/router.js";
import { labelsEditable } from "../services/labels.js";

export async function mapScreen({ map: mapId }) {
  const map = mapById(mapId);
  if (!map) return { el: h("main", { class: "page cs-page" }, h("p", null, "Unknown map. "), h("a", { href: "#/library" }, "Back to the library")) };
  const panel = createMapPanel(map, { tools: "full" });
  await panel.ready;

  // + Add: a lineup, spawns, or callouts on this map.
  async function addMenu() {
    const canPlace = labelsEditable();
    const pick = await choose({
      title: `Add to ${map.name}`,
      options: [
        { label: "Add a lineup", value: "lineup", sub: "A clip or image, its tags, and where it's thrown and lands" },
        ...(canPlace
          ? [
              { label: "Add or edit spawn points", value: "spawns", sub: "The numbered spawns, for instant smokes" },
              { label: "Add callouts", value: "callouts", sub: "Click the map and type a name: labels for everyone" },
            ]
          : []),
      ],
    });
    if (pick === "lineup") navigate(`/add?map=${map.id}`);
    if (pick === "spawns") navigate(`/spawns/${map.id}`);
    if (pick === "callouts") panel.editCallouts(true);
  }
  const el = h(
    "main",
    { class: "page cs-page mapview" },
    h(
      "header",
      { class: "cs-head cs-head--row" },
      h("a", { class: "icon-btn", href: "#/library", "aria-label": "All maps" }, icon("back")),
      h("h1", { class: "cs-title" }, map.name),
      h("a", { class: "cs-spawnsbtn", href: `#/spawns/${map.id}` }, icon("users", { size: 16 }), h("span", null, "See spawns")),
      h(
        "div",
        { class: "cs-head__tools" },
        h("button", { class: "btn btn--primary cs-add", type: "button", onclick: addMenu }, icon("plus", { size: 18 }), h("span", { class: "btn__label" }, "Add"))
      )
    ),
    panel.el
  );
  return { el, title: map.name, destroy: () => panel.destroy() };
}
