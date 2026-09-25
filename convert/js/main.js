// js/main.js
// Convert: one box. Type "100km to yards", "68F to C", "5ft 10in to cm",
// "1 PB in GB"... and the answer appears underneath. Just "100 kg" shows it in
// every unit of its kind.

import { h, replaceChildren } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { parse, convert, format, UNITS, CATEGORIES } from "./units.js";

const EXAMPLES = ["100km to yards", "68F to C", "5ft 10in to cm", "12st 7lb to kg", "1 PB in GB", "50 mpg to L/100km", "1 cup to ml", "60 mph to km/h", "1 acre to m2", "100 Mbps to MB/s"];
const app = document.getElementById("app");

const input = h("input", {
  class: "field cbox",
  type: "text",
  inputmode: "text",
  autocomplete: "off",
  autocapitalize: "off",
  spellcheck: false,
  placeholder: "e.g. 100km to yards",
  "aria-label": "What to convert",
  oninput: () => paint(),
});
const out = h("section", { class: "cout", "aria-live": "polite" });

function paint() {
  const p = parse(input.value);
  if (!p) {
    return replaceChildren(out, h("p", { class: "chint" }, "Type an amount and what to convert it to."), h("div", { class: "cex" }, EXAMPLES.map((x) => h("button", { class: "cchip", type: "button", onclick: () => ((input.value = x), paint(), input.focus()) }, x))));
  }
  if (p.error) return replaceChildren(out, h("p", { class: "cerr" }, p.error));
  const from = p.label ?? `${format(p.value)} ${p.from.sym}`;
  if (!p.to) {
    // Every unit of the same kind.
    const same = UNITS.filter((u) => u.cat === p.from.cat && u !== p.from);
    return replaceChildren(
      out,
      h("p", { class: "clabel" }, `${from} in every ${p.from.cat.toLowerCase()} unit`),
      h("ul", { class: "call" }, same.map((u) => h("li", null, h("button", { class: "call__row", type: "button", onclick: () => ((input.value = `${input.value.trim()} to ${u.sym}`), paint()) }, h("span", { class: "call__v num" }, format(convert(p.value, p.from, u))), h("span", { class: "call__u" }, `${u.sym} \u00b7 ${u.name}`)))))
    );
  }
  const v = convert(p.value, p.from, p.to);
  const linear = !["Temperature", "Fuel economy"].includes(p.from.cat);
  replaceChildren(
    out,
    h(
      "div",
      { class: "cres" },
      h("p", { class: "cres__q" }, `${from} =`),
      h("p", { class: "cres__a num" }, `${format(v)} ${p.to.sym}`),
      h("p", { class: "cres__name" }, p.to.name),
      linear && p.from.sym !== p.to.sym ? h("p", { class: "cres__rate" }, `1 ${p.from.sym} = ${format(convert(1, p.from, p.to))} ${p.to.sym}`) : null
    )
  );
}

replaceChildren(
  app,
  h(
    "main",
    { class: "cpage" },
    h("header", { class: "chead" }, h("a", { class: "icon-btn", href: "../", "aria-label": "Reech's Toolbox" }, icon("back")), h("div", null, h("h1", { class: "chead__title" }, "Convert"), h("p", { class: "chead__sub" }, "Convert anything"))),
    input,
    out,
    h(
      "details",
      { class: "clib" },
      h("summary", null, `Everything it knows (${UNITS.length} units)`),
      CATEGORIES.map((c) => h("div", { class: "clib__cat" }, h("h2", null, c), h("p", null, UNITS.filter((u) => u.cat === c).map((u) => `${u.sym} (${u.name})`).join(", "))))
    )
  )
);
paint();
input.focus();
